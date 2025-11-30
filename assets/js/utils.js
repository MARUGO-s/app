// 共通ユーティリティ関数

// Supabaseクライアントの取得
function getSupabaseClient() {
  if (window.sb) return window.sb;
  
  // Supabaseが利用可能な場合、直接クライアントを作成
  if (window.supabase && window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_ANON_KEY) {
    window.sb = window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );
    return window.sb;
  }
  
  throw new Error('Supabaseクライアントが初期化されていません');
}

// HTMLエスケープ関数
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// フラグ絵文字を取得
function getFlagEmoji(languageCode) {
  const flagMap = {
    'en': '🇺🇸',
    'fr': '🇫🇷',
    'de': '🇩🇪',
    'it': '🇮🇹',
    'es': '🇪🇸',
    'zh': '🇨🇳',
    'ja': '🇯🇵',
    'ko': '🇰🇷',
    'pt': '🇵🇹',
    'ru': '🇷🇺',
    'ar': '🇸🇦',
    'hi': '🇮🇳'
  };
  return flagMap[languageCode] || '🌐';
}

// 日付フォーマット
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('ja-JP');
}

// デバッグログ
function debugLog(message, data = null) {
  if (data) {
  } else {
  }
}

// エラーログ
function errorLog(message, error = null) {
  if (error) {
    console.error(message, error);
  } else {
    console.error(message);
  }
}

// URLパラメータを取得
function getUrlParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// レシピIDを取得
function getRecipeId() {
  return getUrlParam('id') || getUrlParam('i');
}

// 要素を取得（nullチェック付き）
function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with id '${id}' not found`);
  }
  return element;
}

// 要素の値を取得
function getElementValue(id) {
  const element = getElement(id);
  return element ? element.value : '';
}

// 要素のテキストを設定
function setElementText(id, text) {
  const element = getElement(id);
  if (element) {
    element.textContent = text;
  }
}

// 要素のHTMLを設定
function setElementHTML(id, html) {
  const element = getElement(id);
  if (element) {
    element.innerHTML = html;
  }
}

// 要素の表示/非表示を切り替え
function toggleElementVisibility(id, show) {
  const element = getElement(id);
  if (element) {
    element.style.display = show ? 'block' : 'none';
  }
}

// 配列を安全に処理
function safeArray(array) {
  return Array.isArray(array) ? array : [];
}

// オブジェクトを安全に処理
function safeObject(obj) {
  return obj && typeof obj === 'object' ? obj : {};
}

// 文字列を安全に処理
function safeString(str) {
  return typeof str === 'string' ? str : '';
}

// 数値を安全に処理
function safeNumber(num) {
  return typeof num === 'number' && !isNaN(num) ? num : 0;
}

// 非同期処理のエラーハンドリング
async function safeAsync(fn, errorMessage = '処理中にエラーが発生しました') {
  try {
    return await fn();
  } catch (error) {
    errorLog(errorMessage, error);
    return null;
  }
}

// 遅延実行
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ファイルサイズをフォーマット
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 文字列を切り詰め
function truncateString(str, maxLength) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

// ローカルストレージの安全な操作
const storage = {
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      errorLog('ローカルストレージ保存エラー', error);
      return false;
    }
  },
  
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      errorLog('ローカルストレージ取得エラー', error);
      return defaultValue;
    }
  },
  
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      errorLog('ローカルストレージ削除エラー', error);
      return false;
    }
  }
};

// セッションストレージの安全な操作
const session = {
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      errorLog('セッションストレージ保存エラー', error);
      return false;
    }
  },
  
  get(key, defaultValue = null) {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      errorLog('セッションストレージ取得エラー', error);
      return defaultValue;
    }
  },
  
  remove(key) {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      errorLog('セッションストレージ削除エラー', error);
      return false;
    }
  }
};

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    getFlagEmoji,
    formatDate,
    debugLog,
    errorLog,
    getUrlParam,
    getRecipeId,
    getElement,
    setElementText,
    setElementHTML,
    toggleElementVisibility,
    safeArray,
    safeObject,
    safeString,
    safeNumber,
    safeAsync,
    delay,
    formatFileSize,
    truncateString,
    storage,
    session
  };
}
