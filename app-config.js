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

// Supabase接続テスト関数
window.testSupabaseConnection = async function() {
  try {
    console.log('🔍 Supabase接続テスト開始...');
    
    // Supabaseクライアント初期化
    const { createClient } = supabase;
    const sb = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);
    
    // 簡単なクエリでテスト
    const { data, error } = await sb.from('recipes').select('count').limit(1);
    
    if (error) {
      console.error('❌ Supabase接続エラー:', error);
      return false;
    } else {
      console.log('✅ Supabase接続成功!', data);
      return true;
    }
  } catch (err) {
    console.error('❌ 接続テスト失敗:', err);
    return false;
  }
};

// ページ読み込み後に自動テスト
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (typeof supabase !== 'undefined') {
        window.testSupabaseConnection();
      } else {
        console.warn('⚠️ Supabase JSライブラリが読み込まれていません');
      }
    }, 1000);
  });
}
