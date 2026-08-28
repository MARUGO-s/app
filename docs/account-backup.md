# アカウント別レシピバックアップ（管理者）

各ユーザーアカウントのレシピをサーバー側で自動保存し、管理者が確認・ダウンロード・復元できる機能です。

> **注意:** データ管理の「レシピバックアップ（JSON）」とは別機能です。JSON は手動のエクスポート/インポート、本機能は **全ユーザーを対象とした世代管理バックアップ** です。

---

## 概要

| 項目 | 内容 |
|------|------|
| **対象** | 全ユーザー（`profiles` に登録されたアカウント） |
| **保存先** | Supabase テーブル `account_backups` |
| **世代数** | ユーザーごと最大 **3世代**（古い世代から上書き） |
| **自動実行** | **毎週1回**（**月曜 0:00 JST** / 日曜 UTC 15:00） |
| **手動実行** | 管理者のみ（データ管理 → バックアップ管理） |
| **Edge Function** | `scheduled-backup` |

---

## 自動バックアップのスケジュール

- **頻度:** 週1回（以前は毎日だったが、2026-05-18 以降は週次に変更）
- **実行時刻:** 月曜 **0:00 JST**（cron: `0 15 * * 0` = 日曜 UTC 15:00）
- **ジョブ名:** `weekly-account-backup`（旧 `daily-account-backup` は廃止）
- **ラベル:** バックアップ一覧に「自動バックアップ（定期）」と表示

### 仕組み

1. Supabase **pg_cron** が `net.http_post` で Edge Function を呼び出す
2. **Vault** の `service_role_key` を `Authorization: Bearer` に載せて認証
3. `scheduled-backup` が service_role で全ユーザーのレシピを取得し、`admin_save_backup` RPC で保存

---

## 管理者画面での操作

**メニュー:** データ管理 → **バックアップ管理** タブ（管理者のみ）

| 操作 | 説明 |
|------|------|
| **今すぐバックアップ**（全体） | 全ユーザーを即時バックアップ（手動・管理者 JWT） |
| **今すぐバックアップ**（ユーザー単位） | 特定ユーザーのみ |
| **確認** | バックアップ内容（レシピ一覧）のプレビュー |
| **DL** | JSON ファイルとしてダウンロード |
| **復元** | 当該ユーザーのレシピをバックアップ内容で上書き復元 |

手動実行時のラベルは「手動バックアップ」です。

---

## 技術メモ（運用・開発者向け）

### 関連ファイル

- `supabase/functions/scheduled-backup/index.ts`
- `supabase/migrations/20260224080000_create_account_backups.sql`
- `supabase/migrations/20260518100000_fix_backup_cron_service_role_auth.sql`
- `supabase/migrations/20260518120000_backup_cron_weekly.sql`
- `scripts/ensure_backup_vault_secret.sh` — Vault に `service_role_key` を登録

### 認証

- **cron（定期）:** `service_role` トークン（Vault 経由）。管理者ロール不要
- **ブラウザ（手動）:** ログイン中の管理者 JWT + `role = admin`

2026-05-01 のセキュリティ強化以前は cron に Authorization がなく、定期実行が 401 で止まっていた。Vault + service_role 対応で復旧済み。

### cron 再設定（SQL Editor）

Vault シークレットが未設定の場合:

```sql
SELECT vault.create_secret(
  '<SUPABASE_SERVICE_ROLE_KEY>',
  'service_role_key',
  'Cron: scheduled-backup'
);
```

ジョブ確認:

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'weekly-account-backup';
```

CLI で Vault 登録:

```bash
SUPABASE_SERVICE_ROLE_KEY='...' ./scripts/ensure_backup_vault_secret.sh
```

（`npx supabase@2.98.2 db query --linked` を使用）

---

## Supabase プラットフォームのバックアップとの違い

| 種類 | 説明 |
|------|------|
| **本機能（account_backups）** | アプリがユーザー単位・最大3世代で保持するレシピ JSON |
| **Supabase スナップショット** | プロジェクト全体の DB バックアップ（約24時間ごと）。ダッシュボードからリストア |

用途が異なるため、重要な変更前には **手動バックアップ** または JSON エクスポートも併用してください。

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-02 | `account_backups` テーブル・日次 cron 導入 |
| 2026-05-01 | `scheduled-backup` に JWT / 管理者チェック追加（cron 一時停止の原因に） |
| 2026-05-17 | Vault + service_role で cron 認証を復旧 |
| 2026-05-18 | 自動実行を **毎日 → 毎週1回**（月曜 0:00 JST）に変更 |
