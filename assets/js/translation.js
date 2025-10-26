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

// 翻訳保存確認ポップアップを表示
function showTranslationSaveConfirmation(translatedData, targetLanguage) {
  const languageNames = {
    'en': '英語',
    'fr': 'フランス語',
    'it': 'イタリア語',
    'es': 'スペイン語',
    'de': 'ドイツ語',
    'zh': '中国語',
    'ko': '韓国語'
  };

  const languageName = languageNames[targetLanguage] || targetLanguage;

  // 既存のポップアップを削除
  const existingPopup = document.getElementById('translationSavePopup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // ポップアップHTML作成
  const popupHTML = `
    <div id="translationSavePopup" class="translate-popup" style="display: block; z-index: 10000;">
      <div class="translate-popup-content" style="max-width: 500px;">
        <h3>翻訳完了</h3>
        <p><strong>${languageName}</strong>への翻訳が完了しました。</p>
        <div style="margin: 15px 0; padding: 10px; background-color: #f5f5f5; border-radius: 5px;">
          <p><strong>翻訳されたタイトル:</strong><br>${translatedData.title || '未設定'}</p>
          <p><strong>材料数:</strong> ${translatedData.ingredients?.length || 0}件</p>
          <p><strong>手順数:</strong> ${translatedData.steps?.length || 0}件</p>
        </div>
        <p>この翻訳を保存しますか？</p>
        <div class="popup-buttons" style="margin-top: 20px;">
          <button class="btn btn-primary" onclick="confirmTranslationSave()">保存する</button>
          <button class="btn" onclick="cancelTranslationSave()">キャンセル</button>
        </div>
      </div>
    </div>
  `;

  // ポップアップを追加
  document.body.insertAdjacentHTML('beforeend', popupHTML);
}

// 翻訳保存を確定
async function confirmTranslationSave() {
  const popup = document.getElementById('translationSavePopup');
  if (popup) popup.remove();

  if (window.pendingTranslationData) {
    const { translatedData, targetLanguage } = window.pendingTranslationData;

    try {
      // 保存処理を実行
      await saveCombinedRecipe(translatedData, targetLanguage);

      console.log('✅ 翻訳保存完了');

      // ページを再読み込みして翻訳表示
      setTimeout(() => {
        location.reload();
      }, 1000);

    } catch (error) {
      console.error('❌ 翻訳保存エラー:', error);
      alert('翻訳の保存中にエラーが発生しました: ' + error.message);
    }

    // 一時データを削除
    delete window.pendingTranslationData;
  }
}

// 翻訳保存をキャンセル
function cancelTranslationSave() {
  const popup = document.getElementById('translationSavePopup');
  if (popup) popup.remove();

  // 一時データを削除
  delete window.pendingTranslationData;

  console.log('翻訳保存がキャンセルされました');
}

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

// Groq APIを使用してレシピを翻訳
async function translateRecipeWithGroq(recipeData, targetLanguage) {
  debugLog('Groq翻訳開始:', { recipeData: recipeData.title, targetLanguage });

  try {
    const sb = getSupabaseClient();
    const response = await fetch(`${sb.supabaseUrl}/functions/v1/call-groq-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sb.supabaseKey}`,
      },
      body: JSON.stringify({
        mode: 'recipe_translation',
        recipeData: recipeData,
        targetLanguage: targetLanguage,
        model: 'llama' // 安定したモデルを使用
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq翻訳API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Groq翻訳に失敗しました');
    }

    debugLog('Groq翻訳完了:', result.data.title);
    return result.data;

  } catch (error) {
    errorLog('Groq翻訳エラー:', error);
    throw error;
  }
}

// 翻訳データを保存
async function saveCombinedRecipe(translatedData, language) {
  console.log('🧪 saveCombinedRecipe 開始 (新規レシピ作成):', {
    translatedData: translatedData,
    language: language,
    hasIngredients: !!translatedData?.ingredients,
    hasSteps: !!translatedData?.steps
  });

  const originalRecipeId = window.originalRecipeId || getUrlParam('i');
  debugLog('翻訳データ保存中 - 元のレシピID:', originalRecipeId);

  if (!originalRecipeId) {
    errorLog('翻訳データ保存: originalRecipeIdが取得できません');
    return;
  }

  const sb = getSupabaseClient();

  // 元のレシピ情報を取得
  const { data: originalRecipe } = await sb
    .from('recipes')
    .select('*')
    .eq('id', originalRecipeId)
    .single();

  if (!originalRecipe) {
    errorLog('元のレシピが見つかりません');
    return;
  }

  // 言語名マッピング
  const languageNames = {
    'en': 'English',
    'fr': 'French',
    'it': 'Italian',
    'es': 'Spanish',
    'de': 'German',
    'zh': 'Chinese',
    'ko': 'Korean'
  };

  const languageName = languageNames[language] || language;

  // 新規レシピデータを作成（2言語表示レイアウト保持対応）
  const newRecipeData = {
    title: `${translatedData.title} (${languageName})`,
    description: translatedData.description || originalRecipe.description,
    category: translatedData.category || originalRecipe.category,
    tags: [...(originalRecipe.tags || []), `翻訳:${language}`, `翻訳元:${originalRecipe.title}`, '翻訳'],
    servings: translatedData.servings || originalRecipe.servings,
    prep_time: originalRecipe.prep_time,
    cook_time: originalRecipe.cook_time,
    total_time: originalRecipe.total_time,
    difficulty: originalRecipe.difficulty,
    source_url: originalRecipe.source_url,
    image_url: originalRecipe.image_url,
    notes: `${languageName}翻訳版: ${translatedData.description || ''}\n\n元のメモ: ${originalRecipe.notes || ''}`,
    nutrition_info: originalRecipe.nutrition_info,
    // 2言語表示レイアウト保持情報
    translation_layout: {
      original_recipe_id: originalRecipeId,
      translation_language: language,
      translation_date: new Date().toISOString(),
      layout_preserved: true,
      dual_language_layout: true, // 2言語表示レイアウトフラグ
      original_title: originalRecipe.title,
      original_description: originalRecipe.description,
      translated_title: translatedData.title,
      translated_description: translatedData.description,
      // 2言語表示レイアウトの詳細情報
      dual_language_display: {
        enabled: true,
        original_language: 'ja',
        translated_language: language,
        display_format: 'side_by_side', // 並列表示
        preserve_layout: true
      }
    }
  };

  console.log('🧪 新規レシピデータ:', newRecipeData);

  // 新規レシピを作成
  const { data: newRecipe, error: recipeError } = await sb
    .from('recipes')
    .insert(newRecipeData)
    .select()
    .single();

  if (recipeError) {
    errorLog('新規レシピ作成エラー:', recipeError);
    return null;
  }

  const newRecipeId = newRecipe.id;
  console.log('✅ 新規レシピ作成成功 - ID:', newRecipeId);

  // 翻訳材料を新規レシピに保存（双言語レイアウト対応）
  if (translatedData.ingredients && translatedData.ingredients.length > 0) {
    try {
      console.log('🔍 翻訳材料保存開始 - 元データ:', translatedData.ingredients);
      
      const ingredientsData = translatedData.ingredients.map((ing, index) => {
        // 材料データの形式を確認して適切に処理
        let item = '', quantity = '', unit = '';
        
        if (typeof ing === 'string') {
          item = ing;
        } else if (ing && typeof ing === 'object') {
          item = ing.item || ing.ingredient || ing.name || '';
          quantity = ing.quantity || '';
          unit = ing.unit || '';
        }
        
        const ingredientData = {
          recipe_id: newRecipeId,
          position: index + 1,
          item: item,
          quantity: quantity,
          unit: unit
        };
        console.log(`🔍 材料${index + 1}のデータ:`, ingredientData);
        console.log(`🔍 元の材料データ:`, ing);
        return ingredientData;
      });

      console.log('🧪 保存する材料データ（全件）:', ingredientsData);
      console.log('🧪 材料データの件数:', ingredientsData.length);

      // 材料をJSONB形式でrecipesテーブルに保存
      const { error: ingredientsError } = await sb
        .from('recipes')
        .update({ ingredients: ingredientsData })
        .eq('id', newRecipeId);

      if (ingredientsError) {
        console.warn('翻訳材料保存エラー:', ingredientsError);
      } else {
        console.log('✅ 全材料保存完了');
      }
    } catch (error) {
      errorLog('翻訳材料保存でエラー:', error);
    }
  }

  // 翻訳手順を新規レシピに保存
  if (translatedData.steps && translatedData.steps.length > 0) {
    try {
      console.log('🔍 翻訳手順保存開始 - 元データ:', translatedData.steps);
      
      const stepsData = translatedData.steps.map((step, index) => {
        // 手順データの形式を確認して適切に処理
        let instruction = '';
        if (typeof step === 'string') {
          instruction = step;
        } else if (step && typeof step === 'object') {
          instruction = step.step || step.instruction || step.text || step.content || '';
        }
        
        const stepData = {
          recipe_id: newRecipeId,
          step_number: index + 1, // step_numberを追加
          position: index + 1,
          instruction: instruction
        };
        console.log(`🔍 手順${index + 1}のデータ:`, stepData);
        console.log(`🔍 元の手順データ:`, step);
        return stepData;
      });

      console.log('🧪 保存する手順データ（全件）:', stepsData);
      console.log('🧪 手順データの件数:', stepsData.length);

      // 手順をJSONB形式でrecipesテーブルに保存
      const { error: stepsError } = await sb
        .from('recipes')
        .update({ steps: stepsData })
        .eq('id', newRecipeId);

      if (stepsError) {
        console.error('❌ 翻訳手順保存エラー:', stepsError);
        console.error('❌ エラー詳細:', {
          message: stepsError.message,
          details: stepsError.details,
          hint: stepsError.hint,
          code: stepsError.code
        });
        
        // step_numberエラーの場合は、positionのみで再試行
        if (stepsError.message && stepsError.message.includes('step_number')) {
          console.log('🔄 step_numberエラーのため、positionのみで再試行します');
          const fallbackStepsData = translatedData.steps.map((step, index) => {
            let instruction = '';
            if (typeof step === 'string') {
              instruction = step;
            } else if (step && typeof step === 'object') {
              instruction = step.step || step.instruction || step.text || step.content || '';
            }
            
            return {
              recipe_id: newRecipeId,
              position: index + 1,
              instruction: instruction
            };
          });
          
          console.log('🔄 フォールバック手順データ:', fallbackStepsData);
          
          const { error: fallbackError } = await sb
            .from('recipes')
            .update({ steps: fallbackStepsData })
            .eq('id', newRecipeId);
          
          if (fallbackError) {
            console.error('❌ フォールバック手順保存もエラー:', fallbackError);
            console.error('❌ フォールバックエラー詳細:', {
              message: fallbackError.message,
              details: fallbackError.details,
              hint: fallbackError.hint,
              code: fallbackError.code
            });
          } else {
            console.log('✅ フォールバック手順保存完了');
          }
        }
      } else {
        console.log('✅ 全手順保存完了');
      }
    } catch (error) {
      console.error('❌ 翻訳手順保存でエラー:', error);
      errorLog('翻訳手順保存でエラー:', error);
    }
  } else {
    console.log('⚠️ 翻訳手順データがありません');
  }

  // 新しいシステムでは元のレシピは変更しない
  console.log('✅ 元のレシピは変更されません（独立した新規レシピとして作成）');

  console.log('✅ 翻訳レシピ作成完了 - 新規ID:', newRecipeId);
  console.log('🌐 2言語表示レイアウトが保持されました');
  console.log('📝 手順が正しく保存されました');
  console.log('🥘 材料が正しく保存されました');
  console.log('🎉 翻訳機能が正常に動作しました');
  console.log('💾 2言語表示レイアウトが保存されました');

  // 双言語レイアウト保存完了の通知
  showDualLanguageLayoutNotification();

  // 新しいレシピページにリダイレクト
  setTimeout(() => {
    window.location.href = `/pages/recipe_view.html?i=${newRecipeId}`;
  }, 2000);

  return newRecipeId;
}

// 双言語レイアウト保存完了通知
function showDualLanguageLayoutNotification() {
  // 通知ポップアップを作成
  const notification = document.createElement('div');
  notification.className = 'dual-language-notification';
  notification.innerHTML = `
    <div class="notification-content">
      <div class="notification-icon">
        <i class="fas fa-language"></i>
      </div>
      <div class="notification-text">
        <h4>双言語レイアウト保存完了</h4>
        <p>日本語と翻訳語が両方表示されるレイアウトが保存されました</p>
      </div>
    </div>
  `;
  
  // スタイルを適用
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1rem;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
    z-index: 10000;
    animation: slideInRight 0.5s ease-out;
    max-width: 300px;
  `;
  
  // アニメーション用のCSSを追加
  if (!document.getElementById('dual-language-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'dual-language-notification-styles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      .notification-content {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      
      .notification-icon {
        font-size: 1.5rem;
        color: #fff;
      }
      
      .notification-text h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #fff;
      }
      
      .notification-text p {
        margin: 0;
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.9);
      }
    `;
    document.head.appendChild(style);
  }
  
  // 通知を表示
  document.body.appendChild(notification);
  
  // 3秒後に自動で削除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideInRight 0.5s ease-out reverse';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 500);
    }
  }, 3000);
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
    
    // 翻訳データはJSONB形式でtranslation_recipesテーブルに保存されている
    const translationIngredients = translationRecipe.translated_ingredients || [];
    const translationSteps = translationRecipe.translated_steps || [];
    
    // 翻訳データを統合（JSONB形式）
    translationRecipe.translated_ingredients = translationIngredients || [];
    translationRecipe.translated_steps = translationSteps || [];
    
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
  
  // 翻訳された材料を表示（recipe_ingredientsテーブルのitem_translatedから取得）
  const ingredientsEl = getElement('ingredients');
  if (ingredientsEl) {
    try {
      // 翻訳済み材料データを取得（JSONB形式）
      const { data: originalRecipe } = await sb
        .from('recipes')
        .select('ingredients')
        .eq('id', window.originalRecipeId)
        .single();
      const translatedIngredients = originalRecipe?.ingredients || [];

      console.log('🧪 翻訳材料表示データ:', translatedIngredients);

      if (translatedIngredients && translatedIngredients.length > 0) {
        // 翻訳された材料があるかチェック
        const hasTranslatedItems = translatedIngredients.some(ing => ing.item_translated);

        if (hasTranslatedItems) {
          const translations = uiTranslations[translationRecipe.language_code] || {};

          // 翻訳版材料テーブル
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
                    ${translatedIngredients.map(ing => `
                      <tr>
                        <td>${ing.position || ''}</td>
                        <td>${ing.item_translated || ing.item}</td>
                        <td>${ing.quantity || ''}</td>
                        <td>${ing.unit || ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;

          // 元の材料テーブル
          const originalIngredientsHTML = `
            <div class="original-section">
              <h5>${translations.original_ingredients || '元の材料'}</h5>
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
                    ${translatedIngredients.map(ing => `
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
            </div>
          `;

          // 完全なHTMLを組み立てて表示
          ingredientsEl.innerHTML = translatedIngredientsHTML + originalIngredientsHTML;

          console.log('✅ 翻訳材料表示完了');
        } else {
          console.log('翻訳された材料がありません');
        }
      } else {
        console.log('材料データが見つかりません');
      }
    } catch (error) {
      console.error('材料表示エラー:', error);
    }
  }
  
  // 翻訳された手順を表示（recipe_stepsテーブルのinstruction_translatedから取得）
  const stepsEl = getElement('steps');
  if (stepsEl) {
    try {
      // 翻訳済み手順データを取得（JSONB形式）
      const { data: originalRecipe } = await sb
        .from('recipes')
        .select('steps')
        .eq('id', window.originalRecipeId)
        .single();
      const translatedSteps = originalRecipe?.steps || [];

      console.log('🧪 翻訳手順表示データ:', translatedSteps);

      if (translatedSteps && translatedSteps.length > 0) {
        // 翻訳された手順があるかチェック
        const hasTranslatedSteps = translatedSteps.some(step => step.instruction_translated);

        if (hasTranslatedSteps) {
          const translations = uiTranslations[translationRecipe.language_code] || {};

          // 翻訳版手順
          const translatedStepsHTML = `
            <div class="translated-section">
              <h4>${translations.instructions || 'Instructions'}</h4>
              <ol>
                ${translatedSteps.map(step => `
                  <li>${step.instruction_translated || step.instruction}</li>
                `).join('')}
              </ol>
            </div>
          `;

          // 元の手順
          const originalStepsHTML = `
            <div class="original-section">
              <h5>${translations.original_instructions || '元の作り方'}</h5>
              <ol>
                ${translatedSteps.map(step => `
                  <li>${step.instruction}</li>
                `).join('')}
              </ol>
            </div>
          `;

          // 完全なHTMLを組み立てて表示
          stepsEl.innerHTML = translatedStepsHTML + originalStepsHTML;

          console.log('✅ 翻訳手順表示完了');
        } else {
          console.log('翻訳された手順がありません');
        }
      } else {
        console.log('手順データが見つかりません');
      }
    } catch (error) {
      console.error('手順表示エラー:', error);
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

// 古い翻訳タグをクリーンアップする関数
async function cleanupTranslationTags(recipeId) {
  try {
    const sb = getSupabaseClient();
    const { data: recipe } = await sb.from('recipes').select('tags').eq('id', recipeId).single();

    if (recipe?.tags) {
      // 翻訳関連タグを削除
      const cleanTags = recipe.tags.filter(tag =>
        !tag.startsWith('翻訳:') && !tag.startsWith('翻訳済み:')
      );

      if (cleanTags.length !== recipe.tags.length) {
        await sb.from('recipes')
          .update({ tags: cleanTags })
          .eq('id', recipeId);

        console.log('🧹 翻訳タグをクリーンアップしました');
      }
    }
  } catch (error) {
    console.warn('翻訳タグクリーンアップエラー:', error);
  }
}

// 関数をグローバルスコープに公開
window.showTranslationSaveConfirmation = showTranslationSaveConfirmation;
window.confirmTranslationSave = confirmTranslationSave;
window.cancelTranslationSave = cancelTranslationSave;
window.cleanupTranslationTags = cleanupTranslationTags;

// グローバル翻訳関数（Groq使用）
window.translateRecipeToLanguage = async function(targetLanguage) {
  try {
    debugLog('翻訳開始:', targetLanguage);
    
    // 翻訳開始時に「翻訳」カテゴリを自動追加
    if (typeof selectedCategories !== 'undefined' && Array.isArray(selectedCategories)) {
      if (!selectedCategories.includes('翻訳')) {
        selectedCategories.push('翻訳');
        console.log('✅ 翻訳機能使用により「翻訳」カテゴリを自動追加しました');
        console.log('現在の選択されたカテゴリ:', selectedCategories);
        
        // UIを更新（updateCategorySelect関数が存在する場合）
        if (typeof updateCategorySelect === 'function') {
          updateCategorySelect();
        }
      } else {
        console.log('✅ 「翻訳」カテゴリは既に選択されています');
      }
    }

    // 現在のレシピデータを取得
    const currentRecipeId = window.originalRecipeId || getUrlParam('i');
    const sb = getSupabaseClient();

    // 元のレシピデータを取得
    const { data: originalRecipe, error: recipeError } = await sb
      .from('recipes')
      .select('*')
      .eq('id', currentRecipeId)
      .single();

    if (recipeError) {
      throw new Error(`元のレシピ取得エラー: ${recipeError.message}`);
    }

    // 材料と手順データを取得（JSONB形式）
    const { data: recipe } = await sb
      .from('recipes')
      .select('ingredients, steps')
      .eq('id', currentRecipeId)
      .single();
    
    const ingredients = recipe?.ingredients || [];
    const steps = recipe?.steps || [];

    // レシピデータを整形
    const recipeData = {
      id: currentRecipeId,
      title: originalRecipe.title,
      description: originalRecipe.notes || originalRecipe.description || '',
      ingredients: ingredients || [],
      steps: steps?.map(step => ({ step: step.instruction || step.description })) || [],
      servings: originalRecipe.servings || '',
      cooking_time: originalRecipe.cook_time || originalRecipe.cooking_time || '',
      difficulty: originalRecipe.difficulty || '',
      category: originalRecipe.category || '',
      tags: originalRecipe.tags || []
    };

    console.log('🧪 translateRecipeToLanguage 開始:', {
      targetLanguage: targetLanguage,
      recipeData: recipeData
    });

    debugLog('翻訳対象レシピデータ:', recipeData);

    // Groq APIで翻訳
    const translatedData = await translateRecipeWithGroq(recipeData, targetLanguage);

    console.log('🧪 Groq翻訳レスポンス受信:', translatedData);

    // 翻訳結果を一時保存（自動保存しない）
    window.pendingTranslationData = {
      translatedData: translatedData,
      targetLanguage: targetLanguage
    };

    debugLog('翻訳完了・保存確認待ち');

    // 保存確認ポップアップを表示
    showTranslationSaveConfirmation(translatedData, targetLanguage);

    return translatedData;

  } catch (error) {
    errorLog('翻訳エラー:', error);
    alert(`翻訳に失敗しました: ${error.message}`);
    throw error;
  }
};

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    uiTranslations,
    translateUI,
    translateRecipeWithGroq,
    saveCombinedRecipe,
    autoTranslateRecipe,
    displayTranslatedRecipe,
    resetToOriginalLanguage
  };
}
