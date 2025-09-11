// レシピ表示画面専用の機能

// レシピ表示の初期化
async function initRecipeView() {
  const id = getRecipeId();
  if (!id) {
    alert('レシピIDが見つかりません');
    return;
  }

  debugLog('レシピ表示を初期化中 - ID:', id);
  
  try {
    // レシピデータを取得
    const recipe = await getRecipe(id);
    if (!recipe) {
      alert('レシピが見つかりません');
      return;
    }

    // 元のレシピIDを保存（翻訳データ保存時に使用）
    window.originalRecipeId = id;
    debugLog('元のレシピIDを保存:', id);

    // タイトルを設定
    setElementText('recipeTitle', recipe.title || '無題のレシピ');
    
    // 言語タグを確認して自動翻訳
    const languageTag = recipe.tags?.find(tag => tag.startsWith('翻訳:'));
    if (languageTag) {
      const targetLanguage = languageTag.replace('翻訳:', '');
      debugLog('言語タグを検出:', languageTag, '対象言語:', targetLanguage);
      // 自動翻訳を実行
      await autoTranslateRecipe(targetLanguage);
      return; // 自動翻訳の場合は早期リターン
    }
    
    // HTML形式のレシピかどうかチェック
    if (recipe.display_format === 'html') {
      debugLog('HTML形式のレシピを読み込み中...');
      await loadHTMLFormatRecipe(recipe);
      return; // HTML形式の場合は早期リターン
    }
    
    // 通常のレシピ表示
    await displayNormalRecipe(recipe, id);
    
  } catch (error) {
    errorLog('レシピ表示初期化エラー:', error);
    alert('レシピの読み込みに失敗しました');
  }
}

// 通常のレシピ表示
async function displayNormalRecipe(recipe, id) {
  // メタ情報の表示
  const metaEl = getElement('meta');
  if (metaEl) {
    const dt = recipe.updated_at || recipe.created_at;
    metaEl.textContent = dt ? `更新: ${formatDate(dt)}` : '';
  }

  // カテゴリーとタグの表示
  displayCategoryAndTags(recipe);
  
  // 画像の表示
  displayRecipeImage(recipe);
  
  // 翻訳データの取得・表示
  await displayTranslationData(id);
  
  // 通常の材料・手順表示（翻訳データがない場合）
  await displayNormalIngredientsAndSteps(id);
}

// カテゴリーとタグの表示
function displayCategoryAndTags(recipe) {
  const categoryDisplay = getElement('categoryDisplay');
  const categoryText = getElement('categoryText');
  const tagsDisplay = getElement('tagsDisplay');
  const tagsContainer = getElement('tagsContainer');
  
  // カテゴリー表示
  if (recipe.category && recipe.category.trim()) {
    categoryText.textContent = recipe.category;
    categoryDisplay.style.display = 'block';
  } else {
    categoryDisplay.style.display = 'none';
  }
  
  // タグ表示
  if (recipe.tags && recipe.tags.length > 0) {
    tagsContainer.innerHTML = recipe.tags.map(tag => 
      `<span class="tag">${escapeHtml(tag)}</span>`
    ).join('');
    tagsDisplay.style.display = 'block';
  } else {
    tagsDisplay.style.display = 'none';
  }
}

// レシピ画像の表示
function displayRecipeImage(recipe) {
  const recipeImage = getElement('recipeImage');
  const recipeImageContainer = getElement('recipeImageContainer');
  
  if (recipe.image_url && recipe.image_url.trim()) {
    recipeImage.src = recipe.image_url;
    recipeImageContainer.style.display = 'flex';
    debugLog('📸 レシピ画像を表示しました');
  } else {
    recipeImageContainer.style.display = 'none';
    console.warn('⚠️ 画像データがありません');
  }
}

// 翻訳データの表示
async function displayTranslationData(id) {
  let translationRecipes = null;
  try {
    debugLog('翻訳データを取得中... recipe_id:', id);
    
    // 翻訳レシピテーブルから翻訳データを取得
    translationRecipes = await getTranslationRecipes(id);
    debugLog('翻訳レシピ取得結果:', translationRecipes);
    
    if (translationRecipes && translationRecipes.length > 0) {
      debugLog('翻訳データが見つかりました:', translationRecipes[0]);
      await displayTranslatedRecipe(translationRecipes[0]);
      return true; // 翻訳データが表示された
    } else {
      debugLog('翻訳データが見つかりませんでした');
    }
  } catch (error) {
    errorLog('翻訳データ取得エラー:', error);
  }
  
  return false; // 翻訳データが表示されなかった
}

// 通常の材料・手順表示
async function displayNormalIngredientsAndSteps(id) {
  // 材料の表示
  await displayIngredients(id);
  
  // 手順の表示
  await displaySteps(id);
}

// 材料の表示
async function displayIngredients(id) {
  const ingredientsEl = getElement('ingredients');
  if (!ingredientsEl) return;
  
  try {
    debugLog('材料データを取得中 - ID:', id);
    const ingredients = await getRecipeIngredients(id);
    debugLog('取得した材料データ:', ingredients);
    if (ingredients && ingredients.length > 0) {
      const columnMapping = {
        'position': '番号',
        'item': '材料名',
        'quantity': '分量',
        'unit': '単位',
        'price': '価格',
        'html_content': 'HTML形式'
      };
      
      const cols = ['position', 'item', 'quantity', 'unit'].filter(k => ingredients[0].hasOwnProperty(k));
      const thead = `<thead><tr>${cols.map(c=>`<th>${escapeHtml(columnMapping[c] || c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${ingredients.map(row=>`<tr>${cols.map(c=>`<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
      ingredientsEl.innerHTML = `<div style="overflow-x: auto; width: 100%;"><table class="table">${thead}${tbody}</table></div>`;
    } else {
      debugLog('材料データが空です');
      ingredientsEl.innerHTML = '<div class="muted">未登録</div>';
    }
  } catch (error) {
    errorLog('材料表示エラー:', error);
    ingredientsEl.innerHTML = '<div class="muted">エラーが発生しました</div>';
  }
}

// 手順の表示
async function displaySteps(id) {
  const stepsEl = getElement('steps');
  if (!stepsEl) return;
  
  try {
    debugLog('手順データを取得中 - ID:', id);
    const steps = await getRecipeSteps(id);
    debugLog('取得した手順データ:', steps);
    if (steps && steps.length > 0) {
      const stepsHTML = steps.map((step, index) => `
        <li>
          <span class="step-number">${index + 1}</span>
          <span class="step-text">${escapeHtml(step.instruction || step.step || step.description || step.body || '')}</span>
        </li>
      `).join('');
      stepsEl.innerHTML = `<ol>${stepsHTML}</ol>`;
    } else {
      debugLog('手順データが空です');
      stepsEl.innerHTML = '<div class="muted">未登録</div>';
    }
  } catch (error) {
    errorLog('手順表示エラー:', error);
    stepsEl.innerHTML = '<div class="muted">エラーが発生しました</div>';
  }
}

// HTML形式レシピの読み込み
async function loadHTMLFormatRecipe(recipe) {
  debugLog('HTML形式のレシピを読み込み中...');
  
  // タイトル
  setElementText('recipeTitle', recipe.title || '無題のレシピ');
  
  // 説明（HTML形式）
  const notesEl = getElement('notes');
  if (notesEl && recipe.notes) {
    notesEl.innerHTML = recipe.notes;
  }
  
  // 材料（HTML形式）
  const ingredientsEl = getElement('ingredients');
  if (ingredientsEl && recipe.ingredients) {
    ingredientsEl.innerHTML = recipe.ingredients;
  }
  
  // 手順（HTML形式）
  const stepsEl = getElement('steps');
  if (stepsEl && recipe.steps) {
    stepsEl.innerHTML = recipe.steps;
  }
  
  // メタ情報
  const metaEl = getElement('meta');
  if (metaEl) {
    const dt = recipe.updated_at || recipe.created_at;
    metaEl.textContent = dt ? `更新: ${formatDate(dt)}` : '';
  }
  
  // カテゴリーとタグ
  displayCategoryAndTags(recipe);
  
  // 画像
  displayRecipeImage(recipe);
}

// 翻訳ポップアップの表示
function showTranslatePopup() {
  const popup = getElement('translatePopup');
  if (popup) popup.style.display = 'block';
}

// 翻訳ポップアップの非表示
function closeTranslatePopup() {
  const popup = getElement('translatePopup');
  if (popup) popup.style.display = 'none';
}

// 翻訳ローディングの表示
function showTranslateLoading() {
  const loading = getElement('translateLoading');
  if (loading) loading.style.display = 'block';
}

// 翻訳ローディングの非表示
function hideTranslateLoading() {
  const loading = getElement('translateLoading');
  if (loading) loading.style.display = 'none';
}

// 翻訳開始
async function startTranslation(language) {
  debugLog('翻訳開始:', language);
  
  showTranslateLoading();
  
  try {
    // レシピデータを取得
    const recipe = await getRecipe(window.originalRecipeId);
    if (!recipe) {
      throw new Error('レシピデータが見つかりません');
    }
    
    // 材料と手順を取得
    const ingredients = await getRecipeIngredients(window.originalRecipeId);
    const steps = await getRecipeSteps(window.originalRecipeId);
    
    // 翻訳データを作成
    const recipeData = {
      title: recipe.title,
      description: recipe.notes,
      ingredients: ingredients.map(ing => ({
        item: ing.item,
        quantity: ing.quantity,
        unit: ing.unit
      })),
      steps: steps.map(step => step.instruction || step.step || step.description || step.body || '')
    };
    
    // 翻訳実行
    await translateRecipe(recipeData, language);
    
  } catch (error) {
    errorLog('翻訳エラー:', error);
    alert('翻訳に失敗しました: ' + error.message);
  } finally {
    hideTranslateLoading();
    closeTranslatePopup();
  }
}

// レシピの翻訳
async function translateRecipe(recipeData, targetLanguage) {
  debugLog('レシピ翻訳開始:', { recipeData, targetLanguage });
  
  try {
    // APIキーを取得
    const { data: apiKeys, error: apiError } = await sb.functions.invoke('get-api-keys', {
      body: { service: 'gemini' }
    });
    
    if (apiError || !apiKeys?.gemini_api_key) {
      throw new Error('APIキーの取得に失敗しました');
    }
    
    // 翻訳プロンプトを作成
    const prompt = createTranslationPrompt(recipeData, targetLanguage);
    
    // Gemini APIを呼び出し
    const response = await invokeGeminiAPI(prompt, apiKeys.gemini_api_key);
    
    // 翻訳結果を解析
    const translatedData = parseTranslatedResponse(response);
    
    // 翻訳結果を表示
    await showTranslatedResult(translatedData, targetLanguage);
    
  } catch (error) {
    errorLog('翻訳処理エラー:', error);
    throw error;
  }
}

// 翻訳プロンプトの作成
function createTranslationPrompt(recipeData, targetLanguage) {
  const languageNames = {
    'en': '英語',
    'fr': 'フランス語',
    'de': 'ドイツ語',
    'it': 'イタリア語',
    'es': 'スペイン語',
    'zh': '中国語'
  };
  
  const targetLanguageName = languageNames[targetLanguage] || targetLanguage;
  
  return `
以下のレシピを${targetLanguageName}に翻訳してください。

タイトル: ${recipeData.title}
説明: ${recipeData.description}

材料:
${recipeData.ingredients.map(ing => `- ${ing.item}: ${ing.quantity} ${ing.unit}`).join('\n')}

手順:
${recipeData.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

翻訳結果は以下のJSON形式で返してください:
{
  "title": "翻訳されたタイトル",
  "description": "翻訳された説明",
  "ingredients": [
    {"item": "翻訳された材料名", "quantity": "分量", "unit": "単位"}
  ],
  "steps": ["翻訳された手順1", "翻訳された手順2", ...]
}
`;
}

// Gemini APIの呼び出し
async function invokeGeminiAPI(prompt, apiKey) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    })
  });
  
  if (!response.ok) {
    throw new Error(`API呼び出しエラー: ${response.status}`);
  }
  
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// 翻訳レスポンスの解析
function parseTranslatedResponse(responseText) {
  try {
    // JSON部分を抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON形式のレスポンスが見つかりません');
    }
    
    const translatedData = JSON.parse(jsonMatch[0]);
    
    // 必須フィールドのチェック
    if (!translatedData.title || !translatedData.ingredients || !translatedData.steps) {
      throw new Error('翻訳データが不完全です');
    }
    
    return translatedData;
  } catch (error) {
    errorLog('翻訳レスポンス解析エラー:', error);
    throw new Error('翻訳結果の解析に失敗しました');
  }
}

// 翻訳結果の表示
async function showTranslatedResult(translatedData, language) {
  debugLog('翻訳結果を表示中:', translatedData);
  
  // タイトルを翻訳版に変更
  const titleEl = getElement('recipeTitle');
  if (titleEl) {
    titleEl.textContent = translatedData.title;
    
    // 翻訳タイトル要素に元のタイトルを表示
    const translatedTitleEl = getElement('translatedTitle');
    if (translatedTitleEl) {
      const flagEmoji = getFlagEmoji(language);
      translatedTitleEl.innerHTML = `
        <span class="original-text">（${translatedData.originalTitle || ''}）</span>
        <span class="flag-emoji">${flagEmoji}</span>
      `;
      translatedTitleEl.style.display = 'block';
    }
  }
  
  // 説明を翻訳版に変更
  if (translatedData.description) {
    const notesEl = getElement('notes');
    if (notesEl) {
      notesEl.innerHTML = `
        <div class="translated-description">
          <div class="translated-text">${escapeHtml(translatedData.description)}</div>
          <div class="original-text">（${escapeHtml(translatedData.originalDescription || '')}）</div>
        </div>
      `;
    }
  }
  
  // 翻訳された材料を表示
  if (translatedData.ingredients && translatedData.ingredients.length > 0) {
    const ingredientsEl = getElement('ingredients');
    if (ingredientsEl) {
      const translations = uiTranslations[language] || {};
      const translatedIngredientsHTML = `
        <div class="translated-section">
          <h4>${translations.ingredients || 'Ingredients'}</h4>
          <div style="overflow-x: auto; width: 100%;">
            <table class="table">
              <thead>
                <tr>
                  <th>${translations.number || '番号'}</th>
                  <th>${translations.ingredient_name || '材料名'}</th>
                  <th>${translations.quantity || '分量'}</th>
                  <th>${translations.unit || '単位'}</th>
                </tr>
              </thead>
              <tbody>
                ${translatedData.ingredients.map((ing, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(ing.item || '')}</td>
                    <td>${escapeHtml(ing.quantity || '')}</td>
                    <td>${escapeHtml(ing.unit || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      ingredientsEl.innerHTML = translatedIngredientsHTML;
    }
  }
  
  // 翻訳された手順を表示
  if (translatedData.steps && translatedData.steps.length > 0) {
    const stepsEl = getElement('steps');
    if (stepsEl) {
      const translations = uiTranslations[language] || {};
      const translatedStepsHTML = `
        <div class="translated-section">
          <h4>${translations.instructions || 'Instructions'}</h4>
          <ol>
            ${translatedData.steps.map(step => `
              <li>${escapeHtml(step)}</li>
            `).join('')}
          </ol>
        </div>
      `;
      stepsEl.innerHTML = translatedStepsHTML;
    }
  }
  
  // UI要素を翻訳
  translateUI(language);
  
  // 翻訳完了 - 自動的に翻訳版を保存
  debugLog('翻訳表示完了。自動的に翻訳版を保存します。');
  
  // 自動的に翻訳版を保存
  try {
    await saveCombinedRecipe(translatedData, language);
    debugLog('翻訳版を自動保存しました');
  } catch (error) {
    errorLog('翻訳版自動保存エラー:', error);
    alert('翻訳版の自動保存に失敗しました: ' + error.message);
  }
}

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initRecipeView,
    displayNormalRecipe,
    displayCategoryAndTags,
    displayRecipeImage,
    displayTranslationData,
    displayNormalIngredientsAndSteps,
    displayIngredients,
    displaySteps,
    loadHTMLFormatRecipe,
    showTranslatePopup,
    closeTranslatePopup,
    showTranslateLoading,
    hideTranslateLoading,
    startTranslation,
    translateRecipe,
    createTranslationPrompt,
    invokeGeminiAPI,
    parseTranslatedResponse,
    showTranslatedResult
  };
}
