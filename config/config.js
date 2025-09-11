// アプリケーション設定
window.APP_CONFIG = {
  // API設定 - Supabaseから動的に取得
  GEMINI_API_KEY: null,
  VISION_API_KEY: null,
  
  // Supabase設定
  SUPABASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q',
  
  // アプリケーション設定
  APP_NAME: 'Recipe Box',
  APP_VERSION: '1.0.0',
  
  // 機能フラグ
  FEATURES: {
    URL_IMPORT: true,
    GEMINI_EXTRACTION: true,
    AI_SUGGESTIONS: true,
    VISION_OCR: true
  }
};

// 設定の取得関数
function getConfig(key) {
  return window.APP_CONFIG[key];
}

// Supabaseクライアントの初期化（削除済み - 下記の関数で統一）

// Supabaseクライアントの取得
function getSupabaseClient() {
  if (window.sb) return window.sb;
  
  if (window.supabase && window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_ANON_KEY) {
    window.sb = window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );
    return window.sb;
  }
  
  throw new Error('Supabaseクライアントが初期化されていません');
}

// APIキーの安全な取得
async function getApiKey(keyName) {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.functions.invoke('get-api-keys', {
      body: { keyName }
    });
    
    if (error) throw error;
    if (!data.success) throw new Error(data.error);
    
    return data.apiKey;
  } catch (error) {
    console.error(`APIキー取得エラー (${keyName}):`, error);
    throw error;
  }
}

// 非同期でAPIキーを初期化
async function initializeApiKeys() {
  try {
    console.log('🔄 APIキーの初期化を開始...');
    
    // 個別にAPIキーを取得してエラーハンドリングを改善
    let geminiKey = null;
    let visionKey = null;
    
    try {
      geminiKey = await getApiKey('GEMINI_API_KEY');
    } catch (error) {
      console.warn('⚠️ Gemini APIキーの取得に失敗:', error.message);
    }
    
    try {
      visionKey = await getApiKey('VISION_API_KEY');
    } catch (error) {
      console.warn('⚠️ Vision APIキーの取得に失敗:', error.message);
    }
    
    // 取得できたキーのみ設定
    if (geminiKey) {
      window.APP_CONFIG.GEMINI_API_KEY = geminiKey;
    }
    if (visionKey) {
      window.APP_CONFIG.VISION_API_KEY = visionKey;
    }
    
    console.log('🔑 APIキーの初期化完了');
    return true;
  } catch (error) {
    console.error('❌ APIキーの初期化に失敗:', error);
    // エラーを投げずに警告のみ表示
    console.warn('⚠️ APIキーが利用できません。一部の機能が制限される可能性があります。');
    return false;
  }
}

// 初期化時にAPIキーを取得（Supabaseの読み込みを待つ）
document.addEventListener('DOMContentLoaded', () => {
  // Supabaseの読み込みを待つ
  const waitForSupabase = () => {
    if (window.supabase) {
      initializeApiKeys();
    } else {
      setTimeout(waitForSupabase, 100);
    }
  };
  waitForSupabase();
});
