# Googleログイン（設定有効化待ち）

- 既存Supabaseメール認証にGoogleを追加。公開プロジェクトは `hjhkccbktkscwtgzxjfq`。現在の公開Auth設定ではGoogle無効・メール有効。
- `GOOGLE_AUTH_ENABLED` リポジトリ変数が `true` のときだけ公開ビルドでボタンを表示する。Googleプロバイダー設定・Callback・Redirect URLの確認後に有効化する。
- アプリの戻り先はワイルドカードを含まない `https://marugo-s.github.io/app/`。既存メール再設定の戻り先設定は維持。
- Google identityのある利用者は、同じUIDのDBプロフィールを再検証し、表示IDと所属店舗のない状態ではアプリを開かない。キャッシュ・Google metadata・メールのローカル部から既存表示IDや業務権限を復元しない。DBプロフィールを管理者が設定した後にログインする。
- 管理者権限・マスタレシピ権限は従来のDB値だけから判定。プロフィールの自動fallback生成と店舗metadataの補完はGoogleでは実行しない。
- 既存メールログイン・新規メール登録・再設定は維持。DB migrationと本番Functions再配備は今回行わない。
- 秘密鍵はGoogle/Supabase設定にのみ保存。Gitや`VITE_`へ追加しない。

本人の実ログイン、既存UID・店舗・在庫・レシピの継続は未検証。旧ローカルstash・履歴の権限処理は復元していない。既存依存のnpm auditは2 moderate・7 highを報告しているが、今回依存を更新していない。
