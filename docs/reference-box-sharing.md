# 資料箱（Reference Box）— 共有機能と実装メモ

資料箱の共有を「相手のテーブルへファイルをコピー」から「**オーナー元データ 1 件＋閲覧権（共有テーブル）**」へ切り替えた内容と、画面上の挙動をまとめたドキュメントです。

---

## 1. 何が変わったか

### 1.1 以前（廃止済み）

- RPC `user_share_reference_documents` が、共有先ごとに相手ユーザーの `user_reference_documents` へ**新規行として添付コピーを INSERT**していました。
- 共有を外しても、相手側のコピー行が残るため、データが二重化しやすいモデルでした。

### 1.2 現在

| 観点 | 内容 |
|------|------|
| データの置き場所 | ファイル本体（添付 JSON）は **オーナーの `user_reference_documents` のみ**。 |
| 誰に見せるか | **`reference_attachment_shares`** に `(document_id, attachment_id, viewer_user_id)` を保存。 |
| 共有解除 | その行を削除（または RPC で置換）すれば、閲覧者側の一覧からも消える。**相手のテーブルにコピーは増やさない**。 |
| イメージ | レシピの「マスタ＋共有タグ」に近い **参照権** モデル。 |

---

## 2. データベース（Supabase）

### 2.1 関連マイグレーション

| ファイル | 役割 |
|----------|------|
| `20260508043000_create_user_reference_documents.sql` | 資料箱テーブル本体。 |
| `20260513140000_user_reference_share_and_list_profiles.sql` | 共有先ユーザー一覧 RPC `list_profiles_for_reference_share` など。 |
| `20260513200000_reference_attachment_shares.sql` | 共有テーブル、置換・一覧 RPC、旧 `user_share_reference_documents` の **DROP**。 |
| `20260513210000_remove_admin_copied_reference_documents_from_non_admins.sql` | 旧コピー方式で残ったデータの片付け（条件付き。後述）。 |

### 2.2 テーブル `reference_attachment_shares`

- **列の例**: `document_id`, `attachment_id`, `owner_user_id`, `viewer_user_id`, `created_at`
- **一意制約**: `(document_id, attachment_id, viewer_user_id)`
- **RLS**: 有効だが **ポリシーなし** → アプリからの直接 DML は想定せず、**SECURITY DEFINER の RPC のみ**で更新する想定。

### 2.3 主な RPC

| RPC | 説明 |
|-----|------|
| `set_reference_attachment_shares(p_document_id, p_attachment_id, p_viewer_user_ids uuid[])` | 当該添付の共有先を **指定配列で完全に置換**。空配列ならその添付の共有は全解除。呼び出し元は当該 `user_reference_documents` の所有者であること。 |
| `list_reference_shares_owned()` | 自分がオーナーとして付与している共有行の一覧（UI の共有人数・モーダル同期に使用）。 |
| `list_shared_reference_attachments_for_viewer()` | 自分が閲覧者として共有されている添付を、オーナー側ドキュメントから 1 件分組み立てて返す（受領一覧）。 |

### 2.4 廃止したもの

- **`user_share_reference_documents(uuid[], jsonb)`** … コピー挿入用の旧 RPC（マイグレーションで削除）。

### 2.5 旧コピー掃除マイグレーションについて

`20260513210000_...` は次を満たす行のみ **一般ユーザー側から DELETE** します（管理者の行は削除しません）。

- そのユーザーの `profiles.role` が **`admin` ではない**
- `attachments` が **ちょうど 1 要素**
- その添付の **`data`（gzip+base64）** が、**いずれかの管理者**の資料箱内のいずれかの添付と **完全一致**

一般ユーザー同士で共有されたコピーなど、上記に当てはまらない行は残る場合があります。必要なら別途 SQL で確認してください。

---

## 3. フロントエンド API（`referenceBoxService.js`）

| メソッド | 用途 |
|----------|------|
| `getAll(userId)` | 自分の `user_reference_documents` 一覧。 |
| `save` / `remove` | 自分の資料の作成・更新・削除。 |
| `fetchOwnedShareGrants()` | `list_reference_shares_owned` の結果。 |
| `fetchSharedIncoming()` | `list_shared_reference_attachments_for_viewer` の結果。 |
| `setAttachmentShares({ documentId, attachmentId, viewerUserIds })` | `set_reference_attachment_shares` を呼ぶ。クラウド保存済み（UUID）の資料のみ。 |

**削除済み**: `shareFilesToUsers` など、コピー共有用のクライアント経路。

**注意**: `getAll` は従来どおり localStorage にフォールバックし得ますが、**共有テーブルは Supabase のみ**のため、取得失敗時は共有人数・受領一覧が古い／空になる可能性があります。

---

## 4. UI（`ReferenceBox.jsx` / `ReferenceBox.css`）

### 4.1 一覧データの組み立て

- `loadDocuments` で **`getAll` + `fetchOwnedShareGrants` + `fetchSharedIncoming`** を `Promise.all` で取得。
- **自分の行**: `documents` 由来。`isSharedIncoming: false`。`shareViewerCount` は `ownedShareGrants` から添付キーごとに集計。
- **共有受領行**: `fetchSharedIncoming` 由来。`isSharedIncoming: true`。一覧キーは `shared:{ownerId}:{documentId}:{attachmentId}` 形式。

### 4.2 自分のファイル vs 共有受領

| 項目 | 自分のファイル | 共有を受領 |
|------|----------------|------------|
| 一覧左のアイコン | あり（アップロード意匠、**赤〜オレンジ系**のバッジ） | なし |
| 共有人数の表示 | **常に**「`N` 人に共有中」または「0 人に共有中」 | 「共有を受領（閲覧のみ）」 |
| 共有設定・削除・カテゴリー編集 | 利用可 | 不可（閲覧・ダウンロード中心。共有元 ID の表示など） |
| 使用容量への計上 | **自分の行のみ**（受領分は容量に含めない） | 含めない |

### 4.3 共有モーダル — ボタン名と意味（現行ラベル）

モーダル下部の 2 ボタンは、どちらも **今チェックしているユーザー一覧**を共有先として保存しますが、**適用範囲**が違います。

| ボタンラベル（画面上の文言） | 動作 |
|------------------------------|------|
| **選択中の1ファイルにだけ共有先を保存** | 左一覧で **ハイライトしている 1 ファイル** にだけ、`setAttachmentShares` でチェック内容を反映。 |
| **一覧の全表示分に共有先を一括保存** | **検索・カテゴリーで絞ったあと**に左一覧に並んでいる **自分のファイルすべて** に、同じチェック内容を順に反映（`isSharedIncoming` の行は対象外）。**資料箱の全件ではなく「今の一覧の行」だけ**が対象。 |

確認ダイアログの一括側は、「今の一覧に出ている自分のファイル N 件すべてについて…」と件数を明示する文言になっています。

モーダル内の説明テキストも、上記ボタン名に合わせて記載されています。

### 4.4 その他の UI 挙動

- **「共有設定を開く」**: 共有モーダルを開く。
- **「更新」**: 一覧再取得。選択中が自分のファイルで、モーダル内のチェックと DB の共有状態に差があれば、**選択中の 1 件**に対して `setAttachmentShares` を実行してから再読込する処理を含む。
- **localStorage**: 共有先のチェック状態の復元に `reference_box_share_targets_{userId}`、`reference_box_share_selection_by_file_{userId}` を使用（ファイル単位の復元など）。

---

## 5. 運用・開発時の注意

1. **マイグレーション未適用環境**  
   `reference_attachment_shares` や RPC が無いと、共有保存・一覧でエラーになります。本番・ステージングにマイグレーションを当てたうえでフロントをデプロイしてください。

2. **旧コピーデータ**  
   `20260513210000` はあくまで **条件に合う行だけ**削除です。残件がある場合は手動または別マイグレーションで対応してください。

3. **文言・ボタン名の変更**  
   本ドキュメントの「§4.3」の表は、**リポジトリ内の `ReferenceBox.jsx` と一致させる**とよいです。ボタン名を変えたら本ファイルも更新してください。

---

## 6. 関連ファイル（パス）

- `supabase/migrations/20260513140000_user_reference_share_and_list_profiles.sql`
- `supabase/migrations/20260513200000_reference_attachment_shares.sql`
- `supabase/migrations/20260513210000_remove_admin_copied_reference_documents_from_non_admins.sql`
- `src/services/referenceBoxService.js`
- `src/components/ReferenceBox.jsx`
- `src/components/ReferenceBox.css`
- 本書: `docs/reference-box-sharing.md`

---

*最終更新: 資料箱の共有モデル移行、一覧 UI（アイコン・共有人数）、共有モーダルボタン文言の整理に合わせて本ドキュメントを全面更新。*
