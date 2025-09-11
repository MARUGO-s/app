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

// Supabaseクライアントの初期化
let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );
  }
  return supabaseClient;
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
    
    const [geminiKey, visionKey] = await Promise.all([
      getApiKey('GEMINI_API_KEY'),
      getApiKey('VISION_API_KEY')
    ]);
    
    if (!geminiKey || !visionKey) {
      throw new Error('APIキーの取得に失敗しました');
    }
    
    window.APP_CONFIG.GEMINI_API_KEY = geminiKey;
    window.APP_CONFIG.VISION_API_KEY = visionKey;
    
    console.log('🔑 APIキーの初期化完了');
    return true;
  } catch (error) {
    console.error('❌ APIキーの初期化に失敗:', error);
    throw error;
  }
}

// 初期化時にAPIキーを取得
document.addEventListener('DOMContentLoaded', () => {
  initializeApiKeys();
});
