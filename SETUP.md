# Recipe Keeper - ローカル開発セットアップガイド

## 🔐 セキュリティに関する重要事項

**以下のファイルは絶対にGitにコミットしないでください：**

- `supabase/functions/.env` - APIキーが含まれます
- `supabase/.env.local` - ローカル環境変数
- `config.local.js` - ローカル開発用設定

これらのファイルは`.gitignore`に既に追加されています。

## 📋 初回セットアップ手順

### 1. 環境変数の設定

```bash
# .envファイルを作成
cd supabase/functions
cp .env.example .env

# .envファイルを編集して、実際のAPIキーを設定
# GOOGLE_API_KEY=your_actual_api_key_here
```

### 2. Google API Keyの取得

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) にアクセス
2. APIキーを作成
3. Gemini APIを有効化
4. APIキーを`supabase/functions/.env`に設定

### 3. Supabaseの起動

```bash
# プロジェクトルートで実行
supabase start
```

### 4. ローカルHTTPサーバーの起動

```bash
# プロジェクトルートで実行
python3 -m http.server 8080
```

### 5. ブラウザでアクセス

```
http://localhost:8080/pages/recipe_import_test.html
```

## 🚀 本番環境へのデプロイ

### 環境変数の設定

本番環境（Supabase）では、ダッシュボードから環境変数を設定します：

1. Supabaseダッシュボードにログイン
2. プロジェクト設定 → Edge Functions → Secrets
3. 必要なAPIキーを追加：
   - `GOOGLE_API_KEY`
   - `GROQ_API_KEY`（オプション）
   - `CHATGPT_API_KEY`（オプション）

### 設定ファイルについて

- **`config.js`**: 本番環境用（GitHubにコミット可能）
- **`config.local.js`**: ローカル開発用（Gitにコミットしない）

`config.local.js`が存在する場合、自動的に`config.js`を上書きします。

## 🔧 トラブルシューティング

### Edge Functionが400エラーを返す

1. `supabase/functions/.env`にAPIキーが正しく設定されているか確認
2. Supabaseを再起動: `supabase stop && supabase start`

### ローカル環境で本番のSupabaseに接続されてしまう

`config.local.js`が正しく読み込まれているか、ブラウザのコンソールを確認してください。
「✅ ローカル開発設定ロード完了」と表示されているはずです。

## 📝 開発者向けメモ

- **絶対にコミットしない**: `.env`, `.env.local`, `config.local.js`
- **APIキーの管理**: ローカルは`.env`ファイル、本番はSupabaseダッシュボード
- **設定の切り替え**: `config.local.js`の有無で自動判定
