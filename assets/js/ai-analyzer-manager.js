/**
 * AI解析マネージャー
 * Azure Document Intelligence後のテキストをGroqまたはChatGPTで解析
 */

class AIAnalyzerManager {
  constructor() {
    this.analyzers = {
      groq: new GroqAnalyzer(),
      chatgpt: new ChatGPTAnalyzer()
    };
    
    this.currentAnalyzer = null;
    this.initializeAnalyzer();
  }

  /**
   * 解析器を初期化
   */
  initializeAnalyzer() {
    const provider = window.aiConfig?.getCurrentProvider()?.key || 'groq';
    this.setAnalyzer(provider);
  }

  /**
   * 解析器を設定
   */
  setAnalyzer(provider) {
    if (!this.analyzers[provider]) {
      throw new Error(`無効な解析器: ${provider}`);
    }
    
    this.currentAnalyzer = this.analyzers[provider];
    window.latestAIProvider = provider;
    window.latestAIProviderModel = this.currentAnalyzer?.model || null;
    console.log(`✅ AI解析器を${provider}に設定`);
  }

  /**
   * OCRテキストを解析
   */
  async analyzeRecipe(extractedText, supabaseClient) {
    if (!this.currentAnalyzer) {
      throw new Error('解析器が設定されていません');
    }

    console.log(`🔍 ${this.currentAnalyzer.provider}で解析を開始`);
    const providerKey = this.currentAnalyzer?.provider || null;
    const providerModel = this.currentAnalyzer?.model || null;

    try {
      const recipeData = await this.currentAnalyzer.analyzeRecipe(extractedText, supabaseClient);

      if (recipeData && typeof recipeData === 'object') {
        recipeData.aiProvider = providerKey;
        recipeData.aiProviderModel = providerModel;
      }
      window.latestAIProvider = providerKey;
      window.latestAIProviderModel = providerModel;
      
      // 解析統計を記録
      const stats = this.currentAnalyzer.getAnalysisStats(recipeData);
      console.log('📊 解析統計:', stats);
      
      return recipeData;
      
    } catch (error) {
      console.error(`❌ ${this.currentAnalyzer.provider}解析エラー:`, error);
      
      // フォールバック処理
      const fallback = this.fallbackAnalysis(extractedText);
      if (fallback && typeof fallback === 'object') {
        fallback.aiProvider = providerKey;
        fallback.aiProviderModel = providerModel;
      }
      window.latestAIProvider = providerKey;
      window.latestAIProviderModel = providerModel;
      return fallback;
    }
  }

  /**
   * フォールバック解析
   */
  fallbackAnalysis(extractedText) {
    console.log('🔄 フォールバック解析を開始');
    
    const lines = extractedText.split('\n').filter(line => line.trim());
    const ingredients = [];
    
    // 材料らしい行を検出
    for (const line of lines) {
      if (this.isIngredientLine(line)) {
        const ingredient = this.parseIngredientLine(line);
        if (ingredient) {
          ingredients.push(ingredient);
        }
      }
    }

    return {
      title: 'フォールバック解析レシピ',
      description: 'フォールバック処理で解析されたレシピです',
      servings: 2,
      ingredients: ingredients,
      steps: [],
      notes: ''
    };
  }

  /**
   * 材料行かどうかを判定
   */
  isIngredientLine(line) {
    return line && 
           line.length > 1 && 
           line.match(/\d/) && 
           (line.match(/[gml個本枚大さじ小さじ]/) || line.match(/\d+円/)) &&
           !line.includes('作り方') && 
           !line.includes('手順') &&
           line.length < 100;
  }

  /**
   * 材料行を解析
   */
  parseIngredientLine(line) {
    // パターン1: "材料名 分量単位 価格円"
    const pattern1 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s+(\d+)円$/);
    if (pattern1) {
      return {
        item: pattern1[1].trim(),
        quantity: pattern1[2].trim(),
        unit: pattern1[3].trim(),
        price: pattern1[4].trim()
      };
    }

    // パターン2: "材料名 価格円"
    const pattern2 = line.match(/^(.+?)\s+(\d+)円$/);
    if (pattern2) {
      return {
        item: pattern2[1].trim(),
        quantity: '',
        unit: '',
        price: pattern2[2].trim()
      };
    }

    // パターン3: "材料名 分量単位"
    const pattern3 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/);
    if (pattern3) {
      return {
        item: pattern3[1].trim(),
        quantity: pattern3[2].trim(),
        unit: pattern3[3].trim(),
        price: ''
      };
    }

    // パターン4: "材料名 分量"
    const pattern4 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)$/);
    if (pattern4) {
      return {
        item: pattern4[1].trim(),
        quantity: pattern4[2].trim(),
        unit: '',
        price: ''
      };
    }

    return null;
  }

  /**
   * プロバイダー変更イベントをリッスン
   */
  setupProviderChangeListener() {
    document.addEventListener('aiProviderChanged', (event) => {
      const { provider } = event.detail;
      this.setAnalyzer(provider);
    });
  }

  /**
   * 解析器の情報を取得
   */
  getCurrentAnalyzerInfo() {
    if (!this.currentAnalyzer) {
      return null;
    }

    return {
      provider: this.currentAnalyzer.provider,
      model: this.currentAnalyzer.model,
      maxTokens: this.currentAnalyzer.maxTokens,
      temperature: this.currentAnalyzer.temperature
    };
  }

  /**
   * 利用可能な解析器一覧を取得
   */
  getAvailableAnalyzers() {
    return Object.keys(this.analyzers).map(key => ({
      key,
      ...this.analyzers[key]
    }));
  }
}

// グローバルインスタンスを作成
window.aiAnalyzerManager = new AIAnalyzerManager();

// プロバイダー変更イベントをリッスン
window.aiAnalyzerManager.setupProviderChangeListener();
