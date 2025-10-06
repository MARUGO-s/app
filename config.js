/**
 * GitHub Pages用設定ファイル
 * 本番環境用のSupabase設定
 */

window.APP_CONFIG = {
  // Supabase設定（本番環境）
  SUPABASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q',
  
  // API設定
  API_BASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co/functions/v1',
  
  // アプリ設定
  APP_NAME: 'Recipe Keeper',
  VERSION: '1.0.0',
  
  // GitHub Pages用設定
  IS_GITHUB_PAGES: true,
  BASE_PATH: '/recipes'
};

// デバッグ用ログ
console.log('✅ GitHub Pages設定ロード完了:', window.APP_CONFIG);