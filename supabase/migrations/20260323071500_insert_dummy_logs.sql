-- テスト用ダミーデータの挿入
INSERT INTO deploy_logs (project, type, message, actor, status)
VALUES 
    ('supabase', 'migration', 'deploy_logs テーブル作成のマイグレーション完了', 'system', 'success'),
    ('git', 'deploy', 'デプロイ履歴表示機能と各種設定のリリース (v1.0.0)', 'yoshito', 'success'),
    ('frontend', 'deploy', 'App.jsxとDeployLogsUIのデプロイ完了のお知らせ', 'github-actions', 'success');
