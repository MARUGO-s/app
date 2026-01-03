/**
 * GitHub Pages用設定ファイル
 * 本番環境用のSupabase設定
 * ローカル開発時は config.local.js が優先的に読み込まれます
 */

window.APP_CONFIG = {
  // Supabase設定（Recipe Keeper用）
  SUPABASE_URL: 'https://nnbdzwrndqtsfzobknmj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYmR6d3JuZHF0c2Z6b2Jrbm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyMTkxNTQsImV4cCI6MjA3NTc5NTE1NH0.srlNmVFzw4w2d1tnp6gwZsBtXMJurpGDpFLe0bD0IYs',

  // API設定
  API_BASE_URL: 'https://nnbdzwrndqtsfzobknmj.supabase.co/functions/v1',
  
  // アプリ設定
  APP_NAME: 'Recipe Keeper',
  VERSION: '1.0.0',
  
  // GitHub Pages用設定
  IS_GITHUB_PAGES: true,
  BASE_PATH: '/app'
};

// デバッグ用ログ
