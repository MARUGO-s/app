---
description: フロントエンド（GitHub Pages）へのデプロイ手順
---

# デプロイワークフロー

## 前提
- フロントエンドは GitHub Pages にデプロイされる（`npm run deploy` = `gh-pages -d dist`）
- Supabase Edge Functions のデプロイは別途 `supabase functions deploy` で行う

## 手順

### 1. 変更ファイルの確認
// turbo
```bash
git diff --name-only
```

### 2. コミット
コミットメッセージには **必ず変更したファイル名を末尾に記載** すること。

**フォーマット:**
```
<種別>: <変更内容の簡潔な説明> (<変更ファイル1>, <変更ファイル2>, ...)
```

**種別の例:**
- `UI` - 画面の見た目やレイアウトの変更
- `fix` - バグ修正
- `feat` - 新機能追加
- `refactor` - リファクタリング
- `chore` - 設定やビルド関連

**コミットメッセージの例:**
```
UI: レシピ詳細のモバイルレイアウトを1列に修正 (RecipeDetail.jsx, RecipeDetail.css)
fix: 在庫計算の端数処理を修正 (inventoryService.js)
feat: デプロイ履歴のメッセージスクロール表示対応 (DeployLogs.jsx, DeployLogs.css)
```

> [!IMPORTANT]
> ファイル名はパスではなくベースネーム（ファイル名のみ）で記載する。
> 変更ファイルが多い場合は主要なものを3〜4個記載し、残りは `他` とする。
> 例: `feat: 注文機能の大幅改修 (OrderList.jsx, orderService.js, OrderForm.jsx 他)`

```bash
git add <変更ファイル> && git commit -m "<上記フォーマットのメッセージ>"
```

### 3. プッシュ
// turbo
```bash
git push
```

### 4. GitHub Pages へデプロイ（ビルド＆公開）
// turbo
```bash
npm run deploy
```

### 5. 完了確認
- `Published` と表示されればデプロイ成功
- 本番URL: https://MARUGO-s.github.io/app/
- キャッシュの関係で反映まで数分かかる場合がある

## Supabase Edge Functions のデプロイ
Supabase の Edge Functions を変更した場合は、以下も実行する:

```bash
npx supabase functions deploy <function-name> --project-ref <project-ref>
```
