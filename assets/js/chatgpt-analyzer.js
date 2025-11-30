/**
 * ChatGPT AI 解析モジュール
 * OpenAIベースの高精度レシピ解析
 */

class ChatGPTAnalyzer {
  constructor() {
    this.provider = 'chatgpt';
    this.model = 'gpt-4o-mini';
    this.maxTokens = 4096;
    this.temperature = 0.2;
    this.endpoint = 'call-openai-api';
  }

  /**
   * OCRテキストをChatGPTで解析してレシピデータを生成
   */
  async analyzeRecipe(extractedText, supabaseClient) {

    const prompt = this.createOptimizedPrompt(extractedText);

    try {
      const { data: result, error } = await supabaseClient.functions.invoke(this.endpoint, {
        body: {
          prompt,
          model: this.model,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          responseFormat: { type: 'json_object' }
        }
      });

      if (error) {
        throw new Error(`ChatGPT API エラー: ${error.message}`);
      }

      if (!result?.success) {
        throw new Error(`ChatGPT API レスポンスエラー: ${result?.error || 'Unknown error'}`);
      }

      const generatedText = this.extractContentFromChatGPT(result);
      if (!generatedText) {
        throw new Error('ChatGPT API から有効なテキストを取得できませんでした');
      }


      return this.parseChatGPTResponse(generatedText, extractedText);

    } catch (error) {
      console.error('❌ ChatGPT解析エラー:', error);
      throw error;
    }
  }

  /**
   * ChatGPTレスポンスからテキストを抽出
   */
  extractContentFromChatGPT(result) {
    if (!result) {
      return '';
    }

    if (typeof result.content === 'string' && result.content.trim()) {
      return result.content;
    }

    const raw = result.raw || {};
    const choice = Array.isArray(raw.choices) ? raw.choices[0] : null;
    if (!choice) {
      return '';
    }

    const messageContent = choice?.message?.content;

    if (typeof messageContent === 'string' && messageContent.trim()) {
      return messageContent;
    }

    if (Array.isArray(messageContent)) {
      const textSegments = messageContent
        .map(segment => {
          if (!segment) return '';
          if (typeof segment === 'string') return segment;
          if (typeof segment === 'object') {
            if (typeof segment.text === 'string') return segment.text;
            if (typeof segment.value === 'string') return segment.value;
          }
          return '';
        })
        .filter(Boolean);

      if (textSegments.length > 0) {
        return textSegments.join('\n');
      }
    }

    return '';
  }

  /**
   * ChatGPT用に最適化されたプロンプトを作成
   */
  createOptimizedPrompt(extractedText) {
    return `以下のOCRで抽出したレシピテキストを解析し、厳密なJSON形式で構造化してください。

【ChatGPT高精度解析指示】
- 材料・分量・単位を正確に分離
- 価格や補足情報は price フィールドへ
- 手順は論理的な順序で整理
- 料理名と説明を推測して補完
- 必ずJSONのみを返却（追加説明禁止）

【入力テキスト】
${extractedText}

【出力形式】
{
  "title": "料理名",
  "description": "レシピの説明",
  "servings": 2,
  "ingredients": [
    {"item": "材料名", "quantity": "分量", "unit": "単位", "price": "価格"}
  ],
  "steps": ["手順1", "手順2"],
  "notes": "補足"
}`;
  }

  /**
   * ChatGPTのレスポンスを解析
   */
  parseChatGPTResponse(generatedText, originalText) {
    try {
      let cleanJson = (generatedText || '').trim();

      const fencedMatch = cleanJson.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
      if (fencedMatch) {
        cleanJson = fencedMatch[1].trim();
      }

      cleanJson = cleanJson
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}') + 1;
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleanJson = cleanJson.substring(jsonStart, jsonEnd);
      }

      cleanJson = cleanJson.replace(/:\s*(-?\d[\d\s]*\/\s*\d[\d\s]*)/g, (_, value) => {
        const normalized = value.replace(/\s+/g, ' ').trim();
        return `: "${normalized}"`;
      });

      const recipeData = JSON.parse(cleanJson);

      if (!recipeData.title && !recipeData.ingredients && !recipeData.steps) {
        throw new Error('有効なレシピデータが含まれていません');
      }

      if (Array.isArray(recipeData.ingredients)) {
        recipeData.ingredients = recipeData.ingredients.map(ingredient =>
          this.normalizeIngredient(ingredient)
        );
      }

      if (!recipeData.title || recipeData.title.trim() === '') {
        recipeData.title = this.inferRecipeTitle(originalText, recipeData.ingredients);
      }

      if (!recipeData.description || recipeData.description.trim() === '') {
        recipeData.description = this.generateDescription(recipeData.ingredients);
      }

        title: recipeData.title,
        ingredientsCount: recipeData.ingredients?.length || 0,
        stepsCount: recipeData.steps?.length || 0
      });

      return recipeData;

    } catch (error) {
      console.error('❌ ChatGPTレスポンス解析エラー:', error);
      return this.fallbackAnalysis(originalText);
    }
  }

  /**
   * 材料データの正規化
   */
  normalizeIngredient(ingredient) {
    if (!ingredient) {
      return { item: '', quantity: '', unit: '', price: '' };
    }

    if (typeof ingredient === 'string') {
      return { item: ingredient, quantity: '', unit: '', price: '' };
    }

    let item = String(ingredient.item || '').trim();
    if (item.startsWith('**') && item.endsWith('**')) {
      item = item.slice(2, -2).trim();
    }

    return {
      item,
      quantity: ingredient.quantity != null ? String(ingredient.quantity).trim() : '',
      unit: ingredient.unit != null ? String(ingredient.unit).trim() : '',
      price: ingredient.price != null ? String(ingredient.price).trim() : ''
    };
  }

  /**
   * フォールバック解析
   */
  fallbackAnalysis(extractedText) {

    const lines = extractedText.split('\n').filter(line => line.trim());
    const ingredients = [];

    for (const line of lines) {
      if (this.isIngredientLine(line)) {
        const ingredient = this.parseIngredientLine(line);
        if (ingredient) {
          ingredients.push(ingredient);
        }
      }
    }

    return {
      title: 'ChatGPT解析レシピ',
      description: 'ChatGPT AIで解析されたレシピです',
      servings: 2,
      ingredients,
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
    const pattern1 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s+(\d+)円$/);
    if (pattern1) {
      return {
        item: pattern1[1].trim(),
        quantity: pattern1[2].trim(),
        unit: pattern1[3].trim(),
        price: pattern1[4].trim()
      };
    }

    const pattern2 = line.match(/^(.+?)\s+(\d+)円$/);
    if (pattern2) {
      return {
        item: pattern2[1].trim(),
        quantity: '',
        unit: '',
        price: pattern2[2].trim()
      };
    }

    const pattern3 = line.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/);
    if (pattern3) {
      return {
        item: pattern3[1].trim(),
        quantity: pattern3[2].trim(),
        unit: pattern3[3].trim(),
        price: ''
      };
    }

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
   * 料理名を推測
   */
  inferRecipeTitle(originalText, ingredients) {
    if (ingredients && ingredients.length > 0) {
      const items = ingredients.map(ing => ing.item).join(' ');

      if (items.includes('牛乳') && items.includes('コンデンスミルク')) {
        return 'プリン';
      }
      if (items.includes('粉ゼラチン')) {
        return 'ゼリー';
      }
      if (items.includes('小麦粉') && items.includes('卵') && items.includes('砂糖')) {
        return 'ケーキ';
      }
    }

    const textSample = (originalText || '').split('\n')[0] || '';
    return textSample.length > 0 ? textSample.substring(0, 20) : 'レシピ';
  }

  /**
   * 説明文を生成
   */
  generateDescription(ingredients) {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return 'OCRで抽出されたレシピです。';
    }

    const mainIngredients = ingredients
      .map(ing => ing.item)
      .filter(Boolean)
      .slice(0, 3);

    return `${mainIngredients.join('、')}などを使ったレシピです。`;
  }

  /**
   * 解析統計を取得
   */
  getAnalysisStats(recipeData) {
    return {
      ingredients: Array.isArray(recipeData?.ingredients) ? recipeData.ingredients.length : 0,
      steps: Array.isArray(recipeData?.steps) ? recipeData.steps.length : 0,
      hasDescription: !!recipeData?.description,
      provider: this.provider,
      model: this.model
    };
  }
}
