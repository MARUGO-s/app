/**
 * プロキシ管理モジュール
 * 複数のプロキシサービスを使用してHTMLコンテンツを取得
 */

class ProxyManager {
  constructor() {
    this.proxies = [
      {
        name: 'AllOrigins',
        url: (targetUrl) => `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
        parser: async (response) => {
          const data = await response.json();
          return data.contents;
        }
      },
      {
        name: 'CORS Proxy',
        url: (targetUrl) => `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        parser: async (response) => {
          return await response.text();
        }
      },
      {
        name: 'Proxy CORS',
        url: (targetUrl) => `https://proxy.cors.sh/${targetUrl}`,
        parser: async (response) => {
          return await response.text();
        }
      },
      {
        name: 'CORS Anywhere',
        url: (targetUrl) => `https://cors-anywhere.herokuapp.com/${targetUrl}`,
        parser: async (response) => {
          return await response.text();
        }
      },
      {
        name: 'ThingProxy',
        url: (targetUrl) => `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
        parser: async (response) => {
          return await response.text();
        }
      },
      {
        name: 'CORS Proxy 2',
        url: (targetUrl) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        parser: async (response) => {
          return await response.text();
        }
      },
      {
        name: 'YQL Proxy',
        url: (targetUrl) => `https://query.yahooapis.com/v1/public/yql?q=SELECT%20*%20FROM%20html%20WHERE%20url%3D%22${encodeURIComponent(targetUrl)}%22&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys`,
        parser: async (response) => {
          const data = await response.json();
          return data.query.results ? data.query.results.body : '';
        }
      },
      {
        name: 'Supabase Proxy',
        url: (targetUrl) => {
          // Supabase Edge Functionを使用したプロキシ
          const supabaseUrl = 'https://nnbdzwrndqtsfzobknmj.supabase.co';
          return `${supabaseUrl}/functions/v1/fetch-url-content`;
        },
        parser: async (response) => {
          const data = await response.json();
          return data.html || data.content || '';
        },
        isSupabaseProxy: true
      }
    ];
    
    console.log('🌐 ProxyManager初期化完了:', this.proxies.length, '個のプロキシサービス');
  }

  /**
   * 指定されたURLからHTMLコンテンツを取得
   * @param {string} url - 取得対象のURL
   * @param {Object} options - オプション
   * @returns {Promise<string>} HTMLコンテンツ
   */
  async fetchHtml(url, options = {}) {
    const {
      minLength = 100,
      timeout = 10000,
      retryCount = 0,
      maxRetries = 3
    } = options;

    console.log(`🌐 HTML取得開始: ${url}`);
    console.log(`📊 設定: 最小長=${minLength}, タイムアウト=${timeout}ms, リトライ=${retryCount}/${maxRetries}`);

    for (let i = 0; i < this.proxies.length; i++) {
      const proxy = this.proxies[i];
      
      try {
        console.log(`🔄 プロキシ試行 ${i + 1}/${this.proxies.length}: ${proxy.name}`);
        
        const proxyUrl = proxy.url(url);
        console.log(`🔗 プロキシURL: ${proxyUrl}`);
        
        // タイムアウト付きのfetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        let fetchOptions = {
          signal: controller.signal,
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3'
            // Cache-ControlとPragmaヘッダーを削除（CORSエラーの原因）
          }
        };

        // Supabaseプロキシの場合は特別な処理
        if (proxy.isSupabaseProxy) {
          fetchOptions.method = 'POST';
          fetchOptions.headers['Content-Type'] = 'application/json';
          const anonKey = (typeof getConfig === 'function') ? getConfig('SUPABASE_ANON_KEY') : null;
          if (anonKey) {
            fetchOptions.headers['Authorization'] = `Bearer ${anonKey}`;
          }
          fetchOptions.body = JSON.stringify({ url: url });
        }

        const response = await fetch(proxyUrl, fetchOptions);
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.warn(`⚠️ ${proxy.name}: HTTP ${response.status} ${response.statusText}`);
          continue;
        }
        
        console.log(`✅ ${proxy.name}: レスポンス取得成功`);
        
        const html = await proxy.parser(response);
        
        if (html && html.length >= minLength) {
          console.log(`🎉 HTML取得成功: ${proxy.name} (${html.length}文字)`);
          return html;
        } else {
          console.warn(`⚠️ ${proxy.name}: HTMLが短すぎます (${html ? html.length : 0}文字)`);
        }
        
      } catch (error) {
        if (error.name === 'AbortError') {
          console.warn(`⏰ ${proxy.name}: タイムアウト (${timeout}ms)`);
        } else {
          console.warn(`❌ ${proxy.name}: エラー - ${error.message}`);
        }
        continue;
      }
    }
    
    // すべてのプロキシが失敗した場合のリトライ
    if (retryCount < maxRetries) {
      console.log(`🔄 全プロキシ失敗、リトライ中... (${retryCount + 1}/${maxRetries})`);
      await this.sleep(2000 * (retryCount + 1)); // 指数バックオフ
      return this.fetchHtml(url, { ...options, retryCount: retryCount + 1 });
    }
    
    throw new Error(`すべてのプロキシサービスが失敗しました (${this.proxies.length}個のプロキシ、${maxRetries}回リトライ)`);
  }

  /**
   * プロキシサービスの状態をテスト
   * @param {string} testUrl - テスト用URL
   * @returns {Promise<Object>} 各プロキシのテスト結果
   */
  async testProxies(testUrl = 'https://httpbin.org/html') {
    console.log('🧪 プロキシテスト開始:', testUrl);
    
    const results = {};
    
    for (const proxy of this.proxies) {
      try {
        console.log(`🧪 テスト中: ${proxy.name}`);
        const startTime = Date.now();
        
        const html = await this.fetchHtml(testUrl, { minLength: 10, timeout: 5000, maxRetries: 0 });
        
        const endTime = Date.now();
        results[proxy.name] = {
          success: true,
          responseTime: endTime - startTime,
          contentLength: html.length,
          error: null
        };
        
        console.log(`✅ ${proxy.name}: 成功 (${endTime - startTime}ms, ${html.length}文字)`);
        
      } catch (error) {
        results[proxy.name] = {
          success: false,
          responseTime: null,
          contentLength: 0,
          error: error.message
        };
        
        console.log(`❌ ${proxy.name}: 失敗 - ${error.message}`);
      }
    }
    
    console.log('🧪 プロキシテスト完了:', results);
    return results;
  }

  /**
   * 利用可能なプロキシの一覧を取得
   * @returns {Array} プロキシ一覧
   */
  getAvailableProxies() {
    return this.proxies.map(proxy => ({
      name: proxy.name,
      url: proxy.url('example.com')
    }));
  }

  /**
   * プロキシを追加
   * @param {Object} proxy - プロキシ設定
   */
  addProxy(proxy) {
    this.proxies.push(proxy);
    console.log(`➕ プロキシ追加: ${proxy.name}`);
  }

  /**
   * プロキシを削除
   * @param {string} name - プロキシ名
   */
  removeProxy(name) {
    const index = this.proxies.findIndex(proxy => proxy.name === name);
    if (index !== -1) {
      this.proxies.splice(index, 1);
      console.log(`➖ プロキシ削除: ${name}`);
    }
  }

  /**
   * スリープ関数
   * @param {number} ms - ミリ秒
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// グローバルインスタンスを作成
window.proxyManager = new ProxyManager();

// 便利な関数をグローバルに公開
window.fetchHtmlViaProxy = (url, options) => window.proxyManager.fetchHtml(url, options);
window.getAvailableProxies = () => window.proxyManager.getAvailableProxies();

console.log('🌐 ProxyManager loaded and ready');
