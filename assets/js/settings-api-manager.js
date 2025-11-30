// 設定画面用のAPIマネージャー

class SettingsApiManager {
  constructor() {
    this.apiManager = window.apiServiceManager;
  }

  // 設定画面の初期化
  async initializeSettingsUI() {
    // apiManagerの参照を最新に更新
    this.apiManager = window.apiServiceManager;
    
    // apiManagerが存在しない場合はフォールバック処理
    if (!this.apiManager) {
      console.warn('⚠️ apiServiceManager not available, using fallback mode');
      this.renderApiServiceSelector();
      this.bindEventListeners();
      
      // 初期選択状態を確認して基準選択を表示
      setTimeout(() => {
        const serviceSelect = document.getElementById('current-api-service');
        if (serviceSelect) {
          // デフォルトで自動選択を設定
          serviceSelect.value = 'auto';
          this.handleServiceChange('auto');
        }
      }, 100);
      
      // API通信状況を初期表示
      setTimeout(() => {
        const statusList = document.getElementById('api-status-list');
        if (statusList) {
          statusList.innerHTML = this.generateApiStatusList('unknown');
        }
      }, 1000);
      
      return;
    }
    
    try {
      await this.apiManager.initialize();
      this.renderApiServiceSelector();
      this.bindEventListeners();
      
      // 初期選択状態を確認して基準選択を表示
      setTimeout(() => {
        const serviceSelect = document.getElementById('current-api-service');
        if (serviceSelect) {
          // デフォルトで自動選択を設定
          serviceSelect.value = 'auto';
          this.handleServiceChange('auto');
        }
      }, 100);
      
      // API通信状況を初期表示
      setTimeout(() => {
        const statusList = document.getElementById('api-status-list');
        if (statusList) {
          statusList.innerHTML = this.generateApiStatusList('unknown');
        }
      }, 1000);
      
    } catch (error) {
      console.error('❌ API Manager initialization failed:', error);
      // エラー時もフォールバック処理を実行
      this.renderApiServiceSelector();
      this.bindEventListeners();
      
      // 初期選択状態を確認して基準選択を表示
      setTimeout(() => {
        const serviceSelect = document.getElementById('current-api-service');
        if (serviceSelect) {
          // デフォルトで自動選択を設定
          serviceSelect.value = 'auto';
          this.handleServiceChange('auto');
        }
      }, 100);
      
      // API通信状況を初期表示
      setTimeout(() => {
        const statusList = document.getElementById('api-status-list');
        if (statusList) {
          statusList.innerHTML = this.generateApiStatusList('unknown');
        }
      }, 1000);
    }
  }

  // APIサービス選択UIを描画
  renderApiServiceSelector() {
    const container = document.getElementById('api-service-selector');
    if (!container) return;

    let services = [];
    let currentService = 'auto';
    
    if (this.apiManager) {
      services = this.apiManager.getAvailableServices();
      currentService = this.apiManager.getCurrentService();
    } else {
      // フォールバック: 直接サービス一覧を定義
      services = [
        {
          id: 'claude-haiku',
          name: 'Claude 3.5 Haiku',
          models: ['haiku'],
          capabilities: ['recipe_extraction', 'text_generation', 'analysis'],
          cost_tier: 'low',
          speed_tier: 'fast'
        },
        {
          id: 'claude-sonnet',
          name: 'Claude 3.5 Sonnet',
          models: ['sonnet'],
          capabilities: ['recipe_extraction', 'text_generation', 'analysis'],
          cost_tier: 'medium',
          speed_tier: 'medium'
        },
        {
          id: 'claude-opus',
          name: 'Claude 3 Opus',
          models: ['opus'],
          capabilities: ['recipe_extraction', 'text_generation', 'analysis'],
          cost_tier: 'high',
          speed_tier: 'slow'
        },
        {
          id: 'groq',
          name: 'Groq (Llama)',
          models: ['llama', 'mixtral', 'gemma'],
          capabilities: ['recipe_extraction', 'text_generation'],
          cost_tier: 'free',
          speed_tier: 'ultra-fast'
        },
        {
          id: 'chatgpt-4o-mini',
          name: 'GPT-4o Mini',
          models: ['gpt-4o-mini'],
          capabilities: ['recipe_extraction', 'text_generation'],
          cost_tier: 'low',
          speed_tier: 'fast'
        },
        {
          id: 'chatgpt-4o',
          name: 'GPT-4o',
          models: ['gpt-4o'],
          capabilities: ['recipe_extraction', 'text_generation'],
          cost_tier: 'high',
          speed_tier: 'medium'
        },
        {
          id: 'chatgpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          models: ['gpt-3.5-turbo'],
          capabilities: ['recipe_extraction', 'text_generation'],
          cost_tier: 'low',
          speed_tier: 'fast'
        },
        {
          id: 'vision',
          name: 'Google Vision API',
          models: ['vision-api'],
          capabilities: ['ocr', 'text_detection'],
          cost_tier: 'low',
          speed_tier: 'fast'
        }
      ];
    }

    const html = `
      <div class="settings-section">
        <h3>🤖 AIサービス設定</h3>
        <div class="form-group">
          <label for="current-api-service">使用するAIサービス</label>
          <select id="current-api-service" class="form-control">
            <option value="auto" ${currentService === 'auto' ? 'selected' : ''}>
              自動選択（おすすめ）
            </option>
            ${services.map(service => `
              <option value="${service.id}" ${currentService === service.id ? 'selected' : ''}>
                ${service.name} - ${this.getCostBadge(service.cost_tier)} ${this.getSpeedBadge(service.speed_tier)}
              </option>
            `).join('')}
          </select>
          <small class="form-text">
            自動選択は設定した優先度に基づいて最適なサービスを選択します
          </small>
        </div>

        <div class="form-group" id="auto-selection-criteria" style="display: none;">
          <label for="auto-selection-basis">自動選択の基準</label>
          <select id="auto-selection-basis" class="form-control" onchange="updateAutoSelectionRecommendation()">
            <option value="cost">価格重視 - コストを最優先に選択</option>
            <option value="speed">スピード重視 - レスポンス速度を最優先に選択</option>
            <option value="quality">性能重視 - 品質と精度を最優先に選択</option>
          </select>
          <small class="form-text">
            選択した基準に基づいて最適なAIサービスが自動選択されます
          </small>
        </div>

        <div class="service-details" id="service-details">
          ${this.renderServiceDetails(currentService)}
        </div>
        
        <div class="api-status" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-light);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h5 style="margin: 0;">📊 API通信状況</h5>
            <button class="btn secondary btn-sm" onclick="checkAllApiStatus()">
              <i class="fas fa-sync-alt"></i>
              一括確認
            </button>
          </div>
          <div id="api-status-list" class="api-status-grid">
            <!-- API通信状況がここに表示されます -->
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }


  // サービス詳細を描画
  renderServiceDetails(serviceId) {
    if (serviceId === 'auto') {
      return `
        <div class="auto-selection-info">
          <h5>🎯 自動選択について</h5>
          <p>設定された優先度に基づいて、各タスクに最適なAIサービスを自動的に選択します。</p>
          <ul>
            <li><strong>レシピ抽出:</strong> ${this.apiManager ? this.apiManager.getRecommendedService('recipe_extraction') : 'Claude 3.5 Haiku'}</li>
            <li><strong>テキスト生成:</strong> ${this.apiManager ? this.apiManager.getRecommendedService('text_generation') : 'Claude 3.5 Haiku'}</li>
            <li><strong>OCR処理:</strong> ${this.apiManager ? this.apiManager.getRecommendedService('ocr') : 'Google Vision API'}</li>
          </ul>
        </div>
      `;
    }

    const service = this.apiManager ? this.apiManager.getAvailableServices().find(s => s.id === serviceId) : null;
    if (!service) return '';

    // 詳細なサービス情報を定義
    const serviceDetails = {
      'claude-haiku': { 
        features: ['⚡ 超高速レスポンス', '💰 低コスト', '📝 基本的なテキスト処理', '🔄 リアルタイム処理'],
        bestFor: ['簡単なレシピ生成', '基本的な料理手順', '素早い回答が必要な場合']
      },
      'claude-sonnet': { 
        features: ['⚖️ 品質と速度のバランス', '🍳 実用的なレシピ生成', '🛡️ 安全性への配慮', '📊 栄養バランスの考慮'],
        bestFor: ['実用的なレシピ作成', '栄養バランスの考慮', '安全な調理手順', '日常的な料理']
      },
      'claude-opus': { 
        features: ['🎯 最高品質の出力', '🧠 複雑な推論能力', '📚 深い知識理解', '🔍 詳細な分析'],
        bestFor: ['複雑なレシピ開発', '専門的な料理技術', '詳細な調理分析', '高品質な料理指導']
      },
      'groq': { 
        features: ['🆓 完全無料', '⚡ 超高速処理', '🔄 リアルタイム応答', '💻 軽量処理'],
        bestFor: ['基本的なレシピ提案', '簡単な料理手順', 'コストを抑えたい場合', '素早い回答']
      },
      'chatgpt-4o-mini': { 
        features: ['⚡ 高速処理', '💰 低コスト', '🔄 効率的な応答', '📝 基本的なテキスト生成'],
        bestFor: ['基本的なレシピ提案', '簡単な料理手順', 'コスト効率重視', '素早い回答']
      },
      'chatgpt-4o': { 
        features: ['🎯 最高品質の出力', '🌍 幅広い知識', '🔧 カスタマイズ性', '📊 詳細な分析'],
        bestFor: ['複雑なレシピ開発', '多様な料理知識', 'カスタマイズされた提案', '高品質な料理指導']
      },
      'chatgpt-3.5-turbo': { 
        features: ['⚖️ バランス型性能', '💰 コスト効率', '🔄 安定した応答', '📝 標準的なテキスト生成'],
        bestFor: ['標準的なレシピ生成', 'バランスの取れた提案', '日常的な料理', '安定した性能']
      },
      'vision': { 
        features: ['👁️ 画像認識', '📄 OCR機能', '🔍 テキスト抽出', '📸 写真解析'],
        bestFor: ['画像からのレシピ抽出', '手書きレシピの読み取り', '料理写真の分析', 'テキスト化']
      }
    };

    const details = serviceDetails[serviceId] || { features: [], bestFor: [] };

    return `
      <div class="service-info">
        <h5>📋 ${service.name} 詳細</h5>
        <div class="service-badges">
          ${this.getCostBadge(service.cost_tier)}
          ${this.getSpeedBadge(service.speed_tier)}
        </div>
        <p><strong>利用可能なモデル:</strong> ${service.models.join(', ')}</p>
        <p><strong>対応機能:</strong> ${service.capabilities ? service.capabilities.join(', ') : 'レシピ抽出、テキスト生成'}</p>
        
        <div class="service-features" style="margin-top: 1rem;">
          <h6 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">✨ 主な特徴</h6>
          <div class="features-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${details.features.map(feature => 
              `<span class="feature-tag" style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.8rem; color: var(--text-secondary);">${feature}</span>`
            ).join('')}
          </div>
        </div>
        
        <div class="service-best-for" style="margin-top: 1rem;">
          <h6 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">🎯 最適な用途</h6>
          <ul style="margin: 0; padding-left: 1.2rem; color: var(--text-secondary);">
            ${details.bestFor.map(use => `<li style="margin-bottom: 0.25rem;">${use}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }


  // バッジ作成ヘルパー
  getCostBadge(tier) {
    const badges = {
      free: '<span class="badge badge-success">無料</span>',
      low: '<span class="badge badge-info">低価格</span>',
      medium: '<span class="badge badge-warning">標準</span>',
      high: '<span class="badge badge-danger">高価格</span>'
    };
    return badges[tier] || '';
  }

  getSpeedBadge(tier) {
    const badges = {
      slow: '<span class="badge badge-secondary">低速</span>',
      medium: '<span class="badge badge-info">標準</span>',
      fast: '<span class="badge badge-primary">高速</span>',
      'ultra-fast': '<span class="badge badge-success">超高速</span>'
    };
    return badges[tier] || '';
  }

  // イベントリスナーをバインド
  bindEventListeners() {
    // APIサービス選択変更
    const serviceSelect = document.getElementById('current-api-service');
    if (serviceSelect) {
      serviceSelect.addEventListener('change', (e) => {
        this.handleServiceChange(e.target.value);
      });
    }
  }

  // サービス変更ハンドラ
  handleServiceChange(serviceId) {
    if (this.apiManager) {
      this.apiManager.setCurrentService(serviceId);
    } else {
      // フォールバック: ローカルストレージに直接保存
      localStorage.setItem('recipe-box-api-service', serviceId);
    }
    
    // 自動選択基準の表示/非表示を制御
    const criteriaDiv = document.getElementById('auto-selection-criteria');
    if (criteriaDiv) {
      if (serviceId === 'auto') {
        criteriaDiv.style.display = 'block';
        // 保存された基準を復元
        const savedBasis = localStorage.getItem('recipe-box-auto-selection-basis') || 'cost';
        const basisSelect = document.getElementById('auto-selection-basis');
        if (basisSelect) {
          basisSelect.value = savedBasis;
        }
        this.updateAutoSelectionRecommendation();
      } else {
        criteriaDiv.style.display = 'none';
      }
    }
    
    // UIを更新
    const detailsContainer = document.getElementById('service-details');
    if (detailsContainer) {
      if (serviceId === 'auto') {
        this.updateAutoSelectionRecommendation();
      } else {
        detailsContainer.innerHTML = this.renderServiceDetails(serviceId);
      }
    }

    // 成功メッセージ
    this.showMessage(`APIサービスを「${this.getServiceName(serviceId)}」に変更しました`, 'success');
  }


  // 自動選択の推奨を更新
  updateAutoSelectionRecommendation() {
    const basisSelect = document.getElementById('auto-selection-basis');
    const detailsContainer = document.getElementById('service-details');
    
    if (!basisSelect || !detailsContainer) return;
    
    const basis = basisSelect.value;
    localStorage.setItem('recipe-box-auto-selection-basis', basis);
    
    // 基準に基づく推奨サービスを決定
    const recommendations = {
      cost: {
        service: 'groq',
        name: 'Groq (Llama)',
        reason: '無料で利用可能なため、コストを最優先に選択します。'
      },
      speed: {
        service: 'groq',
        name: 'Groq (Llama)',
        reason: '超高速レスポンスを提供するため、スピードを最優先に選択します。'
      },
      quality: {
        service: 'chatgpt-4o',
        name: 'GPT-4o',
        reason: 'OpenAIの最新高性能モデルで、複雑な推論と高精度な出力を提供するため、性能を最優先に選択します。'                                                                                                   
      }
    };
    
    const recommendation = recommendations[basis];
    
    detailsContainer.innerHTML = `
      <div class="auto-selection-info">
        <h5>🎯 自動選択について</h5>
        <p>設定された基準「${this.getBasisLabel(basis)}」に基づいて、最適なAIサービスを自動的に選択します。</p>
        <div class="recommendation-box" style="margin-top: 1rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; border-left: 4px solid var(--accent-primary);">
          <h6 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">💡 推奨サービス</h6>
          <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: var(--accent-primary);">${recommendation.name}</p>
          <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">${recommendation.reason}</p>
        </div>
      </div>
    `;
  }
  
  // 基準のラベルを取得
  getBasisLabel(basis) {
    const labels = {
      cost: '価格重視',
      speed: 'スピード重視',
      quality: '性能重視'
    };
    return labels[basis] || basis;
  }

  // サービス名を取得
  getServiceName(serviceId) {
    if (serviceId === 'auto') return '自動選択';
    const service = this.apiManager ? this.apiManager.getAvailableServices().find(s => s.id === serviceId) : null;
    return service ? service.name : serviceId;
  }

  // メッセージ表示
  showMessage(message, type = 'info') {
    const alertClass = {
      success: 'alert-success',
      info: 'alert-info',
      warning: 'alert-warning',
      error: 'alert-danger'
    };

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertClass[type]} alert-dismissible fade show`;
    alertDiv.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // 設定セクションの先頭に挿入
    const container = document.getElementById('api-service-selector') || document.body;
    container.insertBefore(alertDiv, container.firstChild);

    // 3秒後に自動削除
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.parentNode.removeChild(alertDiv);
      }
    }, 3000);
  }

  // API状況リストを生成（ボタン形式）
  generateApiStatusList(mode, results = {}) {
    const apis = [
      { id: 'claude-haiku', name: 'Claude 3.5 Haiku', icon: '🤖' },
      { id: 'claude-sonnet', name: 'Claude 3.5 Sonnet', icon: '🤖' },
      { id: 'claude-opus', name: 'Claude 3 Opus', icon: '🤖' },
      { id: 'groq', name: 'Groq (Llama)', icon: '⚡' },
      { id: 'chatgpt-4o-mini', name: 'GPT-4o Mini', icon: '💬' },
      { id: 'chatgpt-4o', name: 'GPT-4o', icon: '💬' },
      { id: 'chatgpt-3.5-turbo', name: 'GPT-3.5 Turbo', icon: '💬' },
      { id: 'vision', name: 'Google Vision API', icon: '👁️' }
    ];
    
    return apis.map(api => {
      const result = results[api.id];
      const status = result ? result.status : 'unknown';
      const message = result ? result.message : '未確認';
      
      let statusIcon, statusClass, statusText;
      
      switch (status) {
        case 'checking':
          statusIcon = '⏳';
          statusClass = 'checking';
          statusText = '確認中...';
          break;
        case 'success':
          statusIcon = '✅';
          statusClass = 'success';
          statusText = '接続成功';
          break;
        case 'error':
          statusIcon = '❌';
          statusClass = 'error';
          statusText = '接続失敗';
          break;
        default:
          statusIcon = '❓';
          statusClass = 'unknown';
          statusText = '未確認';
      }
      
      return `
        <div class="api-status-button ${statusClass}">
          <div class="api-status-icon ${statusClass}">
            ${statusIcon}
          </div>
          <div class="api-status-name">${api.name}</div>
          <div class="api-status-message">${statusText}</div>
        </div>
      `;
    }).join('');
  }
}

// グローバルインスタンス
window.settingsApiManager = new SettingsApiManager();

