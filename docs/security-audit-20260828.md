# セキュリティ監査・強化記録（2026-08-28）

## 目的

一般ユーザーが、管理者から付与されていない権限・他ユーザーのデータ・運用ファイル・管理APIへアクセスできないことを、画面表示ではなくデータベースとEdge Function側で保証する。

## 防御構造

```text
認証
├─ Supabase Auth（署名・issuer・audience・role・subを検証）
├─ service_role（サーバー側のキー完全一致だけを許可）
└─ 管理者判定（profiles.roleをDBで再確認）

認可
├─ テーブルACL（anonを全面拒否、不要なTRUNCATE/TRIGGER/REFERENCESを剥奪）
├─ RLS（本人行・本人所有レシピ・管理者専用データを分離）
├─ SECURITY DEFINER RPC（関数内でauth.uid()と管理者権限を再検証）
└─ Storage（本人UUIDフォルダだけ書込可能）

外部入力
├─ POST限定・JWT必須
├─ fail-closedレート制限
├─ ストリーム読込中の本文サイズ制限
├─ モデル・件数・出力上限のサーバー側固定
└─ SSRF対策（URL・DNS・IP・リダイレクト・応答サイズ・タイムアウト）
```

## 実施内容

### 1. ユーザー権限

- `profiles.role`、`show_master_recipes`、店舗割当などを一般ユーザーが直接更新できないようにした。
- 新規プロフィールはDB既定値の `role='user'` と `show_master_recipes=false` から開始する。
- 管理画面の表示判定も、`app_metadata` や `localStorage` ではなくDBで取得したプロフィールだけを使用する。
- 管理者RPCは、呼出し引数を管理者証明として信用せず、必ず `auth.uid()` と `profiles.role` を関数内で照合する。
- 管理者自身の降格・削除をDBで拒否し、権限変更・ユーザー削除・店舗割当・マスター表示権限をサーバー側で監査記録する。管理者パスワード変更も成功したAuth操作に紐づけてEdge Function側で記録する。
- UUIDやメールアドレスをソースに固定して管理者へ昇格させる旧migrationを無効化した。
- 診断用RPC・トリガー関数・保守関数をブラウザから実行できないようにした。

### 2. レシピと関連データ

- レシピ作成・更新時の `owner:*` タグは、呼出し本人に一致するものを正確に1個だけ許可する。
- 匿名ロールによるレシピテーブルアクセスを廃止した。
- 非公開レシピの原価上書きデータを、別ユーザーが関連テーブル経由で読めないようにした。
- 未使用のグローバル原価テーブル `material_costs` は管理者専用にした。
- 共有添付RPCは、呼出し本人が所有する資料内の実在添付だけを共有でき、1回100人までに制限した。

### 3. Storage

- `app-data` をprivate bucketに変更し、本人UUIDフォルダだけ読書き可能にした。管理者は全件管理できる。
- `recipe-images` は既存URL互換のため公開読取を維持する一方、アップロード・更新・削除は本人UUIDフォルダだけに限定した。
- ファイルサイズとMIME typeをbucket側とクライアント側の両方で制限し、SVGは許可しない。
- 画像複製時もコピー先を現在ユーザーのUUIDフォルダへ固定した。

### 4. Edge Functions / 外部API

- 稼働中の全Edge FunctionをPOST・認証・レート制限・本文サイズ制限の対象にした。
- 本文はストリーム読込中に上限を判定し、`Content-Length`のない巨大送信も途中で中止する。
- JWTは署名に加え、issuer、audience、subject、roleを検証する。未署名の `service_role` claimは信用しない。
- URL取得系はprivate/loopback/link-local/special IP、危険なポート、認証情報付きURL、DNS解決後のprivate IP、危険なリダイレクトを拒否する。
- 外部API応答サイズ、リダイレクト回数、タイムアウト、AIモデル、メッセージ・ツール・出力件数を制限した。
- Gemini API keyをURL queryではなく `x-goog-api-key` headerで送る。
- 生の本文、API応答、URL、秘密情報をログへ出さないようにした。
- 未使用の `db_tester`、`debug-env`、`get-api-keys` を廃止した。
- Edge Function deploy workflowから、Supabaseが自動注入する予約済みsecretの再登録処理を除去し、廃止3関数専用の削除workflowを追加した。

### 5. リポジトリ

- 公開seedから認証ユーザー、パスワードハッシュ、セッション、refresh token、実データを除去した。
- service roleを使うインポート処理は、コード内固定値を廃止し `.env` 必須にした。
- 実データを表示する一時診断スクリプトと、旧LINE Reportプロジェクト参照を削除した。
- 旧認証テーブル `app_users`（password／秘密の質問カラムを含む）はブラウザAPIから完全に遮断した。内容削除は資格情報事故対応として別承認で行う。
- 現在ツリーをgitleaksで検査し、検出0件を確認した。
- Axios、React Router、Vite、Supabase CLIなどを修正版へ更新し、npm監査を本番依存・開発依存とも0件にした。
- SheetJSは古いnpm registry版を廃止し、公式配布の0.20.3をローカル取込スクリプト専用の開発依存にした。
- lintで判明した未定義関数呼出しと不要コードを整理し、管理者の材料マスター削除後に正しい再読込処理を呼ぶよう修正した。

## 自動検証

- Edge Function型検査: 稼働中22関数すべて成功
- セキュリティ単体テスト: 17件成功
- Fresh DB replay: 全migration成功
- SQL権限テスト: 成功
  - 一般ユーザーの管理RPC実行拒否
  - role自己昇格拒否
  - master recipe表示権限の自己付与拒否
  - 他ユーザーStorage読書き拒否
  - 他ユーザー非公開レシピ原価の読取拒否
  - 複数ownerタグ偽装拒否
  - anonのpublic table・特権関数アクセス拒否
- フロントエンドproduction build: 成功
- 現在ツリーの秘密情報検査: 0件
- npm audit（本番・開発依存）: 0件
- ESLint: 0 errors、30 warnings

## 資格情報事故対応（2026-08-28完了）

- 本番のパスワード認証ユーザー21件について、既存password hashを未知のランダム値へ置換した。全ユーザーはpassword recoveryによる再設定が必要。
- Auth session 138件と未失効refresh token 137件を削除し、既存セッションを失効した。
- 旧 `app_users` は本番で0行だったため、password／秘密の質問データの残存がないことを確認した。
- 履歴監査では、現Recipe-Managementプロジェクトのservice-role keyやsecret keyの固定値は検出されなかった。無関係な本番キー交換による停止を避け、露出が確認された認証データを直接失効した。
- 秘密情報検査0件の現在ツリーを新しいGit履歴の起点とし、公開mainを置換した。旧履歴へ到達する非main branchも削除した。

## 運用上の残件

`recipe-images` は既存表示との互換性を優先して公開読取のままである。機密画像も扱う要件になった場合は、bucketをprivate化し、保存URLをobject pathへ移行して短時間signed URLを発行する設計変更を行う。
