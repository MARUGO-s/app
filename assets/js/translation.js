// 翻訳関連の機能

// Supabaseクライアントの取得は utils.js で定義済み

// UI翻訳辞書
const uiTranslations = {
  'fr': {
    'ingredients': 'Ingrédients',
    'steps': 'Instructions',
    'instructions': 'Instructions',
    'original_ingredients': 'Ingrédients originaux',
    'original_instructions': 'Instructions originales',
    'notes': 'Notes',
    'category': 'Catégorie',
    'servings': 'Portions',
    'cooking_time': 'Temps de cuisson',
    'preparation_time': 'Temps de préparation',
    'number': 'N°',
    'ingredient_name': 'Ingrédient',
    'quantity': 'Quantité',
    'unit': 'Unité'
  },
  'it': {
    'ingredients': 'Ingredienti',
    'steps': 'Istruzioni',
    'instructions': 'Istruzioni',
    'original_ingredients': 'Ingredienti originali',
    'original_instructions': 'Istruzioni originali',
    'notes': 'Note',
    'category': 'Categoria',
    'servings': 'Porzioni',
    'cooking_time': 'Tempo di cottura',
    'preparation_time': 'Tempo di preparazione',
    'number': 'N°',
    'ingredient_name': 'Ingrediente',
    'quantity': 'Quantità',
    'unit': 'Unità'
  },
  'es': {
    'ingredients': 'Ingredientes',
    'steps': 'Instrucciones',
    'instructions': 'Instrucciones',
    'original_ingredients': 'Ingredientes originales',
    'original_instructions': 'Instrucciones originales',
    'notes': 'Notas',
    'category': 'Categoría',
    'servings': 'Porciones',
    'cooking_time': 'Tiempo de cocción',
    'preparation_time': 'Tiempo de preparación',
    'number': 'N°',
    'ingredient_name': 'Ingrediente',
    'quantity': 'Cantidad',
    'unit': 'Unidad'
  },
  'de': {
    'ingredients': 'Zutaten',
    'steps': 'Anweisungen',
    'instructions': 'Anweisungen',
    'original_ingredients': 'Originale Zutaten',
    'original_instructions': 'Originale Anweisungen',
    'notes': 'Notizen',
    'category': 'Kategorie',
    'servings': 'Portionen',
    'cooking_time': 'Kochzeit',
    'preparation_time': 'Vorbereitungszeit',
    'number': 'Nr.',
    'ingredient_name': 'Zutat',
    'quantity': 'Menge',
    'unit': 'Einheit'
  },
  'en': {
    'ingredients': 'Ingredients',
    'steps': 'Instructions',
    'instructions': 'Instructions',
    'original_ingredients': 'Original Ingredients',
    'original_instructions': 'Original Instructions',
    'notes': 'Notes',
    'category': 'Category',
    'servings': 'Servings',
    'cooking_time': 'Cooking Time',
    'preparation_time': 'Preparation Time',
    'number': 'No.',
    'ingredient_name': 'Ingredient',
    'quantity': 'Quantity',
    'unit': 'Unit'
  },
  'zh': {
    'ingredients': '食材',
    'steps': '步骤',
    'instructions': '步骤',
    'original_ingredients': '原始食材',
    'original_instructions': '原始步骤',
    'notes': '备注',
    'category': '类别',
    'servings': '份量',
    'cooking_time': '烹饪时间',
    'preparation_time': '准备时间',
    'number': '编号',
    'ingredient_name': '食材名称',
    'quantity': '数量',
    'unit': '单位'
  }
};

// UI要素を翻訳
function translateUI(language) {
  const translations = uiTranslations[language];
  if (!translations) return;
  
  // セクションヘッダーを翻訳
  const asideH3 = document.querySelector('aside h3');
  if (asideH3) {
    const text = asideH3.textContent.trim();
    if (text === '材料') {
      asideH3.textContent = translations.ingredients || '材料';
    } else if (text === '手順') {
      asideH3.textContent = translations.steps || '手順';
    }
  }
  
  // 翻訳セクションのヘッダーを翻訳
  const translatedSections = document.querySelectorAll('.translated-section h4');
  translatedSections.forEach(section => {
    const text = section.textContent.trim();
    if (text === '材料' || text === 'Ingredients') {
      section.textContent = translations.ingredients || 'Ingredients';
    } else if (text === '手順' || text === 'Instructions') {
      section.textContent = translations.instructions || 'Instructions';
    }
  });
  
  // 元のセクションのヘッダーを翻訳
  const originalSections = document.querySelectorAll('.original-section h5');
  originalSections.forEach(section => {
    const text = section.textContent.trim();
    if (text === '元の材料' || text === 'Original Ingredients') {
      section.textContent = translations.original_ingredients || '元の材料';
    } else if (text === '元の作り方' || text === 'Original Instructions') {
      section.textContent = translations.original_instructions || '元の作り方';
    }
  });
  
  // テーブルヘッダーを翻訳
  const tableHeaders = document.querySelectorAll('table thead th');
  tableHeaders.forEach(header => {
    const text = header.textContent.trim();
    if (text === '番号') {
      header.textContent = translations.number || '番号';
    } else if (text === '材料名') {
      header.textContent = translations.ingredient_name || '材料名';
    } else if (text === '分量') {
      header.textContent = translations.quantity || '分量';
    } else if (text === '単位') {
      header.textContent = translations.unit || '単位';
    }
  });
}

// 翻訳データを保存
async function saveCombinedRecipe(translatedData, language) {
  const originalRecipeId = window.originalRecipeId || getUrlParam('i');
  debugLog('翻訳データ保存中 - 元のレシピID:', originalRecipeId);
  
  if (!originalRecipeId) {
    errorLog('翻訳データ保存: originalRecipeIdが取得できません');
    return;
  }
  
  // 元のレシピデータを取得
  const originalTitle = getElement('recipeTitle')?.textContent?.trim() || '';
  const originalDescription = getElement('notes')?.textContent?.trim() || '';
  
  // 元の材料データを取得
  const originalIngredients = Array.from(document.querySelectorAll('#ingredients .table tbody tr')).map(row => {
    const cells = row.querySelectorAll('td');
    return {
      position: cells[0]?.textContent || '',
      item: cells[1]?.textContent || '',
      quantity: cells[2]?.textContent || '',
      unit: cells[3]?.textContent || ''
    };
  });
  
  // 元の手順データを取得
  const originalSteps = Array.from(document.querySelectorAll('#steps ol li')).map(step => {
    const number = step.querySelector('.step-number')?.textContent || '';
    const text = step.querySelector('.step-text')?.textContent || '';
    return { number, text };
  });
  
  // 元のレシピのカテゴリーとタグを取得
  debugLog('元のレシピデータを取得中 - ID:', originalRecipeId);
  const sb = getSupabaseClient();
  const { data: originalRecipe } = await sb.from('recipes').select('category, tags').eq('id', originalRecipeId).single();
  
  // 翻訳レシピメインデータを作成
  const translationRecipeData = {
    original_recipe_id: originalRecipeId,
    translated_title: translatedData.title,
    original_title: originalTitle,
    translated_description: translatedData.description,
    original_description: originalDescription,
    language_code: language,
    category: originalRecipe?.category || '翻訳レシピ',
    tags: [...(originalRecipe?.tags || []), '翻訳', '多言語'],
    servings: 4
  };
  
  debugLog('翻訳レシピデータを保存中:', translationRecipeData);
  const { data: translationResult, error: translationError } = await sb
    .from('translation_recipes')
    .insert(translationRecipeData)
    .select()
    .single();
    
  if (translationError) {
    errorLog('翻訳レシピ保存エラー:', translationError);
    return;
  }
  
  debugLog('翻訳レシピ保存成功:', translationResult);
  
  const translationRecipeId = translationResult.id;
  
  // 元のレシピに翻訳言語タグを追加
  try {
    debugLog('言語タグ追加中 - ID:', originalRecipeId);
    const sb = getSupabaseClient();
    const { data: originalRecipe } = await sb.from('recipes').select('tags').eq('id', originalRecipeId).single();
    const currentTags = originalRecipe?.tags || [];
    const languageTag = `翻訳:${language}`;
    
    // 既存の翻訳タグを削除して新しいタグを追加
    const filteredTags = currentTags.filter(tag => !tag.startsWith('翻訳:'));
    const newTags = [...filteredTags, languageTag];
    
    await sb.from('recipes')
      .update({ tags: newTags })
      .eq('id', originalRecipeId);
    
    debugLog('元のレシピに言語タグを追加:', languageTag);
  } catch (error) {
    errorLog('言語タグ追加エラー:', error);
  }
  
  // 翻訳材料を保存
  if (translatedData.ingredients && translatedData.ingredients.length > 0) {
    try {
      const translationIngredients = translatedData.ingredients.map((ing, index) => ({
        translation_recipe_id: translationRecipeId,
        position: index + 1,
        translated_item: ing.item,
        original_item: originalIngredients[index]?.item || '',
        quantity: ing.quantity,
        unit: ing.unit
      }));
      
      const { error: ingredientsError } = await sb
        .from('translation_recipe_ingredients')
        .insert(translationIngredients);
        
      if (ingredientsError) {
        errorLog('翻訳材料保存エラー（スキップ）:', ingredientsError.message);
      }
    } catch (error) {
      errorLog('翻訳材料保存でエラー（スキップ）:', error);
    }
  }
  
  // 翻訳手順を保存
  if (translatedData.steps && translatedData.steps.length > 0) {
    try {
      const translationSteps = translatedData.steps.map((step, index) => ({
        translation_recipe_id: translationRecipeId,
        position: index + 1,
        translated_instruction: step,
        original_instruction: originalSteps[index]?.text || ''
      }));
      
      const { error: stepsError } = await sb
        .from('translation_recipe_steps')
        .insert(translationSteps);
        
      if (stepsError) {
        errorLog('翻訳手順保存エラー（スキップ）:', stepsError.message);
      }
    } catch (error) {
      errorLog('翻訳手順保存でエラー（スキップ）:', error);
    }
  }
}

// 自動翻訳関数（言語タグから翻訳を実行）
async function autoTranslateRecipe(targetLanguage) {
  debugLog('自動翻訳を開始:', targetLanguage);
  
  try {
    // 翻訳データを取得
    const { data: translationRecipes, error } = await sb
      .from('translation_recipes')
      .select('*')
      .eq('original_recipe_id', window.originalRecipeId)
      .eq('language_code', targetLanguage)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      errorLog('翻訳データ取得エラー:', error);
      return;
    }
    
    if (!translationRecipes || translationRecipes.length === 0) {
      debugLog('翻訳データが見つかりません。通常表示に切り替えます。');
      return;
    }
    
    const translationRecipe = translationRecipes[0];
    debugLog('翻訳データを発見:', translationRecipe);
    
    // 翻訳材料と手順データを取得
    const { data: translationIngredients } = await sb
      .from('translation_recipe_ingredients')
      .select('*')
      .eq('translation_recipe_id', translationRecipe.id)
      .order('position', { ascending: true });
    
    const { data: translationSteps } = await sb
      .from('translation_recipe_steps')
      .select('*')
      .eq('translation_recipe_id', translationRecipe.id)
      .order('position', { ascending: true });
    
    // 翻訳データを統合
    translationRecipe.translation_recipe_ingredients = translationIngredients || [];
    translationRecipe.translation_recipe_steps = translationSteps || [];
    
    // 翻訳表示を実行
    await displayTranslatedRecipe(translationRecipe);
    
  } catch (error) {
    errorLog('自動翻訳エラー:', error);
  }
}

// 翻訳レシピの表示関数
async function displayTranslatedRecipe(translationRecipe) {
  debugLog('翻訳レシピを表示中:', translationRecipe);
  
  // タイトルを翻訳版に変更
  const titleEl = getElement('recipeTitle');
  if (titleEl && translationRecipe.translated_title) {
    titleEl.textContent = translationRecipe.translated_title;
    
    // 翻訳タイトル要素に元のタイトルを表示
    const translatedTitleEl = getElement('translatedTitle');
    if (translatedTitleEl) {
      const flagEmoji = getFlagEmoji(translationRecipe.language_code);
      translatedTitleEl.innerHTML = `
        <span class="original-text">（${translationRecipe.original_title}）</span>
        <span class="flag-emoji">${flagEmoji}</span>
      `;
      translatedTitleEl.style.display = 'block';
    }
  }
  
  // 説明を翻訳版に変更
  if (translationRecipe.translated_description) {
    const notesEl = getElement('notes');
    if (notesEl) {
      notesEl.innerHTML = `
        <div class="translated-description">
          <div class="translated-text">${translationRecipe.translated_description}</div>
          <div class="original-text">（${translationRecipe.original_description}）</div>
        </div>
      `;
    }
  }
  
  // 翻訳された材料を表示
  if (translationRecipe.translation_recipe_ingredients && translationRecipe.translation_recipe_ingredients.length > 0) {
    const ingredientsEl = getElement('ingredients');
    if (ingredientsEl) {
      // 元の材料データを取得（翻訳版と併記するため）
      let originalIngredientsHTML = '';
      try {
        const { data: originalIngredients } = await sb
          .from('recipe_ingredients')
          .select('*')
          .eq('recipe_id', window.originalRecipeId)
          .order('position', { ascending: true });
        
        if (originalIngredients && originalIngredients.length > 0) {
          const translations = uiTranslations[translationRecipe.language_code] || {};
          originalIngredientsHTML = `
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
                  ${originalIngredients.map(ing => `
                    <tr>
                      <td>${ing.position}</td>
                      <td>${ing.item}</td>
                      <td>${ing.quantity}</td>
                      <td>${ing.unit}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        }
      } catch (error) {
        errorLog('元の材料データ取得エラー:', error);
      }
      
      const translations = uiTranslations[translationRecipe.language_code] || {};
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
                ${translationRecipe.translation_recipe_ingredients.map(ing => `
                  <tr>
                    <td>${ing.position}</td>
                    <td>${ing.translated_item || ''}</td>
                    <td>${ing.quantity || ''}</td>
                    <td>${ing.unit || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${originalIngredientsHTML ? `
            <div class="original-section">
              <h5>${translations.original_ingredients || '元の材料'}</h5>
              ${originalIngredientsHTML}
            </div>
          ` : ''}
        </div>
      `;
      ingredientsEl.innerHTML = translatedIngredientsHTML;
    }
  }
  
  // 翻訳された手順を表示
  if (translationRecipe.translation_recipe_steps && translationRecipe.translation_recipe_steps.length > 0) {
    const stepsEl = getElement('steps');
    if (stepsEl) {
      // 元の手順データを取得（翻訳版と併記するため）
      let originalStepsHTML = '';
      try {
        const { data: originalSteps } = await sb
          .from('recipe_steps')
          .select('*')
          .eq('recipe_id', window.originalRecipeId)
          .order('position', { ascending: true });
        
        if (originalSteps && originalSteps.length > 0) {
          originalStepsHTML = `
            <ol>
              ${originalSteps.map(step => `
                <li>${step.instruction || step.step || step.description || step.body || ''}</li>
              `).join('')}
            </ol>
          `;
        }
      } catch (error) {
        errorLog('元の手順データ取得エラー:', error);
      }
      
      const translations = uiTranslations[translationRecipe.language_code] || {};
      const translatedStepsHTML = `
        <div class="translated-section">
          <h4>${translations.instructions || 'Instructions'}</h4>
          <ol>
            ${translationRecipe.translation_recipe_steps.map(step => `
              <li>${step.translated_instruction || ''}</li>
            `).join('')}
          </ol>
          ${originalStepsHTML ? `
            <div class="original-section">
              <h5>${translations.original_instructions || '元の作り方'}</h5>
              ${originalStepsHTML}
            </div>
          ` : ''}
        </div>
      `;
      stepsEl.innerHTML = translatedStepsHTML;
    }
  }
  
  // UI要素を翻訳
  if (translationRecipe.language_code) {
    debugLog('UI要素を翻訳中:', translationRecipe.language_code);
    translateUI(translationRecipe.language_code);
  }
  
  debugLog('自動翻訳表示完了');
}

// 言語タグを削除して通常表示に戻す関数
async function resetToOriginalLanguage() {
  try {
    const currentRecipeId = window.originalRecipeId || getUrlParam('i');
    const sb = getSupabaseClient();
    const { data: originalRecipe } = await sb.from('recipes').select('tags').eq('id', currentRecipeId).single();
    
    if (originalRecipe?.tags) {
      // 翻訳タグを削除
      const filteredTags = originalRecipe.tags.filter(tag => !tag.startsWith('翻訳:'));
      
      await sb.from('recipes')
        .update({ tags: filteredTags })
        .eq('id', currentRecipeId);
      
      debugLog('言語タグを削除しました');
      
      // ページを再読み込みして通常表示に戻す
      location.reload();
    }
  } catch (error) {
    errorLog('言語タグ削除エラー:', error);
  }
}

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    uiTranslations,
    translateUI,
    saveCombinedRecipe,
    autoTranslateRecipe,
    displayTranslatedRecipe,
    resetToOriginalLanguage
  };
}
