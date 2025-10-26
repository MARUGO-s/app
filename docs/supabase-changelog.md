# 📊 Supabase変更履歴管理ガイド

## 🎯 完璧な履歴管理のための手順

### 📋 日常的な変更管理

#### 1. **データベース変更時**
```bash
# 1. 新しいマイグレーション作成
supabase migration new "add_user_preferences_table"

# 2. SQLファイル編集
# supabase/migrations/YYYYMMDDHHMMSS_add_user_preferences_table.sql

# 3. ローカルでテスト
supabase db reset

# 4. 本番環境に適用
supabase db push

# 5. Gitにコミット
git add supabase/migrations/
git commit -m "🗄️ Add user preferences table"
git push origin main
```

#### 2. **Edge Function変更時**
```bash
# 1. 関数を修正
# supabase/functions/function-name/index.ts

# 2. ローカルでテスト
supabase functions serve function-name

# 3. デプロイ
supabase functions deploy function-name

# 4. Gitにコミット
git add supabase/functions/function-name/
git commit -m "🔧 Improve function-name error handling"
git push origin main
```

#### 3. **設定変更時**
```bash
# 1. 設定ファイル修正
# supabase/config.toml

# 2. 変更を適用
supabase start

# 3. Gitにコミット
git add supabase/config.toml
git commit -m "⚙️ Update database connection settings"
git push origin main
```

### 🔄 履歴を戻す方法

#### **マイグレーションを戻す**
```bash
# 特定のマイグレーションまで戻す
supabase migration repair --status reverted YYYYMMDDHHMMSS

# または新しい逆マイグレーションを作成
supabase migration new "revert_user_preferences_table"
# DROP TABLE user_preferences; を記述
```

#### **Edge Functionを戻す**
```bash
# Gitで戻してから再デプロイ
git checkout HEAD~1 -- supabase/functions/function-name/
supabase functions deploy function-name
```

#### **設定を戻す**
```bash
# Gitで戻す
git checkout HEAD~1 -- supabase/config.toml
supabase start
```

### 📊 履歴確認コマンド

```bash
# マイグレーション履歴
supabase migration list

# Git履歴
git log --oneline supabase/

# 特定ファイルの履歴
git log --oneline -- supabase/functions/call-groq-api/index.ts

# 変更差分確認
git diff HEAD~1 -- supabase/
```

### 🛡️ 安全な変更のルール

1. **必ずローカルでテスト**: `supabase db reset`
2. **段階的な変更**: 小さな変更を頻繁にコミット
3. **明確なコミットメッセージ**: 何を・なぜ変更したかを記録
4. **バックアップ確認**: 本番適用前に履歴確認

### 🎯 これで100%安全！

- ✅ **データベース**: マイグレーションで完全管理
- ✅ **Edge Functions**: Gitで履歴管理
- ✅ **設定ファイル**: バージョン管理
- ✅ **復元**: 任意の時点に瞬時に戻せる

**どんな変更も怖くありません！** 🚀


