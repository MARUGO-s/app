// Gemini API設定
const GEMINI_API_KEY = 'AIzaSyAUsJcsyFY1vcBlrDNn1DYLRor_oqLErx4';

// Gemini API呼び出し関数
async function callGeminiAPI(text, url) {
  console.log('🌟 Gemini API呼び出し開始');
  
  try {
    const prompt = `以下のレシピページからレシピ情報を抽出し、日本語に翻訳してください。

ページURL: ${url || '不明'}
ページ内容: ${text.substring(0, 8000)}

以下のJSON形式で回答してください（必ず有効なJSON形式で返してください）：

{
  "title": "レシピのタイトル（日本語）",
  "description": "レシピの説明（日本語）",
  "servings": "人数",
  "ingredients": [
    {
      "item": "材料名（日本語）",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    "手順1（日本語）",
    "手順2（日本語）"
  ]
}

**重要**: 必ず材料（ingredients）と手順（steps）を抽出してください。空の配列にしないでください。
必ず有効なJSON形式で返してください。コメントや説明は含めず、JSONのみを返してください。`;

    // レート制限対策
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
      const errorData = await response.json();
      throw new Error(`Gemini API エラー: ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();

    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const content = result.candidates[0].content.parts[0].text;
      console.log('📝 Gemini応答テキスト:', content);
      
      // JSONを抽出
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Gemini APIから有効なJSONが返されませんでした');
      }

      const recipeData = JSON.parse(jsonMatch[0]);
      console.log('✅ Gemini API レシピデータ抽出成功:', recipeData);
      return recipeData;
    }

    throw new Error('Gemini APIから有効なレスポンスを取得できませんでした');
  } catch (error) {
    console.error('❌ Gemini API エラー:', error);
    throw error;
  }
}

// HTML取得関数（プロキシ使用）
async function fetchHTMLViaProxy(url) {
  console.log('🌐 HTML取得開始:', url);
  
  const proxyServices = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://cors-anywhere.herokuapp.com/${url}`,
    `https://thingproxy.freeboard.io/fetch/${url}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (const proxy of proxyServices) {
    try {
      console.log('🔄 プロキシ試行:', proxy.split('/')[2]);
      const response = await fetch(proxy);
      
      if (response.ok) {
        let html;
        if (proxy.includes('allorigins.win')) {
          const data = await response.json();
          html = data.contents;
        } else {
          html = await response.text();
        }
        
        if (html && html.length > 100) {
          console.log('✅ プロキシ成功:', proxy.split('/')[2]);
          return html;
        }
      }
    } catch (error) {
      console.log('❌ プロキシ失敗:', proxy.split('/')[2], error.message);
    }
  }
  
  throw new Error('すべてのプロキシサービスが失敗しました');
}

// URLインポート関数（Gemini API使用）
window.runImport = async function(url) {
  console.log('🔗 URLインポート開始:', url);
  
  try {
    // HTML取得
    console.log('📥 HTML取得中...');
    const html = await fetchHTMLViaProxy(url);
    console.log('✅ HTML取得成功:', html.length, '文字');
    
    // Gemini APIでレシピ抽出
    console.log('🤖 Gemini APIでレシピ抽出中...');
    const recipeData = await callGeminiAPI(html, url);
    console.log('✅ レシピ抽出成功:', recipeData);
    
    // フォームにデータを設定
    if (recipeData.title) {
      const titleInput = document.getElementById('title');
      if (titleInput) {
        titleInput.value = recipeData.title;
      }
    }
    
    if (recipeData.description) {
      const descriptionInput = document.getElementById('description');
      if (descriptionInput) {
        descriptionInput.value = recipeData.description;
      }
    }
    
    if (recipeData.servings) {
      const servingsInput = document.getElementById('servings');
      if (servingsInput) {
        servingsInput.value = recipeData.servings;
      }
    }
    
    // 材料を設定
    if (recipeData.ingredients && recipeData.ingredients.length > 0) {
      const ingredientsContainer = document.getElementById('ingredientsEditor');
      if (ingredientsContainer) {
        // 既存の材料をクリア
        ingredientsContainer.innerHTML = '';
        
        recipeData.ingredients.forEach((ingredient, index) => {
          const ingredientDiv = document.createElement('div');
          ingredientDiv.className = 'ingredient-item';
          ingredientDiv.innerHTML = `
            <input type="text" placeholder="材料名" value="${ingredient.item || ''}" class="ingredient-name">
            <input type="text" placeholder="分量" value="${ingredient.quantity || ''}" class="ingredient-quantity">
            <input type="text" placeholder="単位" value="${ingredient.unit || ''}" class="ingredient-unit">
            <button type="button" class="remove-ingredient" onclick="removeIngredient(this)">削除</button>
          `;
          ingredientsContainer.appendChild(ingredientDiv);
        });
      }
    }
    
    // 手順を設定
    if (recipeData.steps && recipeData.steps.length > 0) {
      const stepsContainer = document.getElementById('stepsEditor');
      if (stepsContainer) {
        // 既存の手順をクリア
        stepsContainer.innerHTML = '';
        
        recipeData.steps.forEach((step, index) => {
          const stepDiv = document.createElement('div');
          stepDiv.className = 'step-item';
          stepDiv.innerHTML = `
            <label>手順 ${index + 1}:</label>
            <textarea placeholder="手順を入力してください" class="step-description">${step}</textarea>
            <button type="button" class="remove-step" onclick="removeStep(this)">削除</button>
          `;
          stepsContainer.appendChild(stepDiv);
        });
      }
    }
    
    console.log('✅ フォームへのデータ設定完了');
    alert('レシピの読み込みが完了しました！');
    
  } catch (error) {
    console.error('❌ URLインポートエラー:', error);
    throw error;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoadedイベントが発生しました');
  
  // URLインポートボタンを取得
  const urlImportBtn = document.getElementById('urlImportBtn');
  const urlImportModal = document.getElementById('url-import-modal');
  const urlImportModalCloseBtn = document.getElementById('url-import-modal-close-btn');
  const urlInput = document.getElementById('urlInput');
  const urlImportCancelBtn = document.getElementById('urlImportCancelBtn');
  const urlImportConfirmBtn = document.getElementById('urlImportConfirmBtn');
  
  // 初期化時点のデバッグログ（スコープ外の変数参照は行わない）
  console.log('🔧 initializeApp: base elements mounted');
  
  // URLインポートボタンのイベントリスナー
  if (urlImportBtn) {
    console.log('✅ URLインポートボタンが見つかりました');
    urlImportBtn.addEventListener('click', () => {
      console.log('🔗 URLインポートボタンがクリックされました');
      if (urlImportModal) {
        console.log('✅ URLインポートモーダルを開きます');
        urlImportModal.style.display = 'block';
        if (urlInput) {
          urlInput.focus();
        }
      } else {
        console.error('❌ URLインポートモーダルが見つかりません');
        alert('URLインポート機能が利用できません。ページを再読み込みしてください。');
      }
    });
    console.log('✅ URLインポートボタンのイベントリスナーを設定しました');
  } else {
    console.error('❌ URLインポートボタンが見つかりません');
  }
  
  // URLインポートモーダルを閉じる
  if (urlImportModalCloseBtn) {
    urlImportModalCloseBtn.addEventListener('click', () => {
      if (urlImportModal) {
        urlImportModal.style.display = 'none';
      }
    });
  }
  
  // URLインポートキャンセルボタン
  if (urlImportCancelBtn) {
    urlImportCancelBtn.addEventListener('click', () => {
      if (urlImportModal) {
        urlImportModal.style.display = 'none';
      }
    });
  }
  
  // URLインポート確認ボタン
  if (urlImportConfirmBtn) {
    urlImportConfirmBtn.addEventListener('click', async () => {
      const url = urlInput?.value?.trim();
      if (!url) {
        alert('URLを入力してください。');
        return;
      }
      
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert('有効なURLを入力してください。');
        return;
      }
      
      try {
        // ボタンを無効化
        urlImportConfirmBtn.disabled = true;
        urlImportConfirmBtn.textContent = '読み込み中...';
        
        // runImport関数の存在を確認してから実行
        if (typeof window.runImport === 'function') {
          console.log('✅ runImport関数が見つかりました');
          await window.runImport(url);
          if (urlImportModal) {
            urlImportModal.style.display = 'none';
          }
        } else {
          console.error('❌ runImport関数が見つかりません');
          console.log('🔍 window.runImport:', typeof window.runImport);
          
          // runImport関数が利用できない場合は、少し待ってから再試行
          console.log('🔄 runImport関数を待機中...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (typeof window.runImport === 'function') {
            console.log('✅ runImport関数が見つかりました（再試行成功）');
            await window.runImport(url);
            if (urlImportModal) {
              urlImportModal.style.display = 'none';
            }
          } else {
            console.error('❌ runImport関数が見つかりません（再試行失敗）');
            throw new Error('URL読み込み機能が利用できません。ページを再読み込みしてください。');
          }
        }
        
      } catch (error) {
        console.error('URLインポートエラー:', error);
        alert(`レシピの読み込みに失敗しました: ${error.message}`);
      } finally {
        // ボタンを有効化
        urlImportConfirmBtn.disabled = false;
        urlImportConfirmBtn.textContent = '読み込み';
      }
    });
  }
  
  // 既存のapp-edit.jsの機能を初期化
  initializeApp();
});

// 既存のapp-edit.jsの機能を初期化する関数
function initializeApp() {
  console.log('🎯 initializeApp関数を開始します');
  
  if (typeof supabase === 'undefined') {
    console.error('❌ Supabaseライブラリが読み込まれていません');
    return;
  }

  // 修正点1: APIキーを最新化（重複初期化を避ける）
  let sb;
  if (window.sb) {
    console.log('✅ 既存のSupabaseクライアントを再利用');
    sb = window.sb;
  } else {
    console.log('🆕 新しいSupabaseクライアントを作成');
    sb = supabase.createClient(
      "https://ctxyawinblwcbkovfsyj.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q"
    );
    window.sb = sb; // グローバルに保存
  }

  // --- Elements ---
  // 状態管理用の変数（未定義エラー防止のため初期化）
  let selectedCategory = '';
  let tempSelectedCategory = '';
  let selectedTags = [];
  let tempSelectedTags = [];
  let currentRecipeType = 'normal';
  let originalIngredients = [];
  let baseServings = 1;

  const titleEl = document.getElementById('title');
  const categoryEl = document.getElementById('category');
  const tagsEl = document.getElementById('tags');
  const servingsEl = document.getElementById('servings');
  const notesEl = document.getElementById('notes');
  const ingredientsEditor = document.getElementById('ingredientsEditor');
  const stepsEditor = document.getElementById('stepsEditor');
  const addIngBtn = document.getElementById('addIng');
  const addStepBtn = document.getElementById('addStep');
  const saveBtn = document.querySelector('.js-save');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const customCategoriesContainer = document.getElementById('customCategories');
  
  // カテゴリー選択モーダル要素
  const categorySelectBtn = document.getElementById('categorySelectBtn');
  const selectedCategoryText = document.getElementById('selectedCategoryText');
  const categoryModal = document.getElementById('category-modal');
  const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
  const categoryOptionsContainer = document.getElementById('category-options');
  const customCategoryGroup = document.getElementById('custom-category-group');
  const customCategoryOptions = document.getElementById('custom-category-options');
  const categoryOkBtn = document.getElementById('category-ok-btn');
  const categoryCancelBtn = document.getElementById('category-cancel-btn');
  
  // タグ選択モーダル要素
  const tagSelectBtn = document.getElementById('tagSelectBtn');
  const selectedTagsText = document.getElementById('selectedTagsText');
  const tagModal = document.getElementById('tag-modal');
  const tagModalCloseBtn = document.getElementById('tag-modal-close-btn');
  const tagOptionsContainer = document.getElementById('tag-options');
  const tagOkBtn = document.getElementById('tag-ok-btn');
  const tagCancelBtn = document.getElementById('tag-cancel-btn');

  // AIモーダル一式（既存UI）
  const aiModal = document.getElementById('ai-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const aiStep1 = document.getElementById('ai-step-1');
  const aiStep2 = document.getElementById('ai-step-2');
  const aiStep3 = document.getElementById('ai-step-3');
  const aiLoading = document.getElementById('ai-loading');
  const genreBtns = document.querySelectorAll('.genre-btn');
  const getSuggestionsBtn = document.getElementById('get-suggestions-btn');
  const menuSuggestionsContainer = document.getElementById('menu-suggestions');
  const generateFullRecipeBtn = document.getElementById('generate-full-recipe-btn');
  const aiCustomRequestEl = document.getElementById('ai-custom-request');
  const recipePreview = document.getElementById('recipe-preview');
  const applyRecipeBtn = document.getElementById('apply-recipe-btn');
  const aiWizardBtn = document.getElementById('ai-wizard-btn');
  
  // 参照スコープの差異により未定義例外が発生しないよう、安全な存在確認ログにする
  try {
    console.log('🔧 要素の存在確認:', {
      urlImportBtn: !!document.getElementById('urlImportBtn'),
      urlImportModal: !!document.getElementById('url-import-modal'),
      urlInput: !!document.getElementById('urlInput'),
      urlImportConfirmBtn: !!document.getElementById('urlImportConfirmBtn')
    });
  } catch (_) {}
  
  // --- Helpers ---
  const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));

  // レシピタイプに応じて材料量を調整する関数
  const adjustIngredientsByServings = () => {
    const newValue = servingsEl?.value || '';
    
    if (!newValue) {
      alert('値を入力してください。');
      return;
    }
    
    let newServings, maxValue, errorMessage;
    
    // レシピタイプに応じて検証条件を設定
    switch (currentRecipeType) {
      case 'bread':
        newServings = parseFloat(newValue);
        maxValue = 2000;
        errorMessage = '総量は1〜2000gで入力してください。';
        break;
      case 'cake':
        newServings = parseFloat(newValue);
        maxValue = 50;
        errorMessage = 'サイズは1〜50cmで入力してください。';
        break;
      default: // normal
        newServings = parseInt(newValue);
        maxValue = 20;
        errorMessage = '人数は1〜20人前で入力してください。';
        break;
    }
    
    if (newServings < 1 || newServings > maxValue) {
      alert(errorMessage);
      return;
    }
    
    if (originalIngredients.length === 0) {
      // 現在の材料を基準として保存
      const currentIngredients = [];
      const ingredientRows = document.querySelectorAll('.ingredient-row');
      ingredientRows.forEach(row => {
        const itemInput = row.querySelector('.ing-item');
        const quantityInput = row.querySelector('.ing-qty');
        const unitInput = row.querySelector('.ing-unit');
        const priceInput = row.querySelector('.ing-price');
        
        if (itemInput && itemInput.value.trim()) {
          currentIngredients.push({
            item: itemInput.value.trim(),
            quantity: quantityInput?.value?.trim() || '',
            unit: unitInput?.value?.trim() || '',
            price: priceInput?.value?.trim() || ''
          });
        }
      });
      
      if (currentIngredients.length === 0) {
        alert('材料が入力されていません。');
        return;
      }
      
      originalIngredients = [...currentIngredients];
      baseServings = newServings;
    }
    
    // レシピタイプに応じた調整ロジック
    let ratio, successMessage;
    
    switch (currentRecipeType) {
      case 'bread':
        // パンの場合：粉の量を基準に他の材料を比例調整
        const flourIngredient = originalIngredients.find(ing => 
          ing.item.toLowerCase().includes('粉') || 
          ing.item.toLowerCase().includes('小麦粉') ||
          ing.item.toLowerCase().includes('強力粉') ||
          ing.item.toLowerCase().includes('薄力粉')
        );
        
        if (flourIngredient && flourIngredient.quantity) {
          const targetFlourWeight = newServings;
          const currentFlourWeight = parseFloat(flourIngredient.quantity);
          ratio = targetFlourWeight / currentFlourWeight;
          successMessage = `材料量を${currentFlourWeight}gから${targetFlourWeight}gに調整しました。`;
        } else {
          // 粉が見つからない場合は通常の比例調整
          ratio = newServings / baseServings;
          successMessage = `材料量を${baseServings}gから${newServings}gに調整しました。`;
        }
        break;
        
      case 'cake':
        // ケーキの場合：型のサイズに応じて比例調整
        ratio = newServings / baseServings;
        successMessage = `材料量を${baseServings}cm型から${newServings}cm型に調整しました。`;
        break;
        
      default: // normal
        // 通常の料理：人数に応じて比例調整
        ratio = newServings / baseServings;
        successMessage = `材料量を${baseServings}人前から${newServings}人前に調整しました。`;
        break;
    }
    
    // 材料量を調整
    const adjustedIngredients = originalIngredients.map(ing => {
      const adjusted = { ...ing };
      
      if (ing.quantity && !isNaN(parseFloat(ing.quantity))) {
        const originalQuantity = parseFloat(ing.quantity);
        const newQuantity = originalQuantity * ratio;
        
        // 小数点以下を適切に処理
        if (newQuantity < 1) {
          adjusted.quantity = newQuantity.toFixed(2);
        } else if (newQuantity < 10) {
          adjusted.quantity = newQuantity.toFixed(1);
        } else {
          adjusted.quantity = Math.round(newQuantity).toString();
        }
      }
      
      return adjusted;
    });
    
    // 材料エディターを更新
    if (ingredientsEditor) {
      ingredientsEditor.innerHTML = '';
      adjustedIngredients.forEach(ing => addIngredientRow(ing));
    }
    
    console.log(successMessage);
  };

  const addIngredientRow = (data = {}) => {
    console.log('addIngredientRow呼び出し:', data);
    if (!ingredientsEditor) {
      console.error('ingredientsEditorが見つかりません');
      return;
    }
    const div = document.createElement('div');
    div.className = 'ingredient-row';
    const quantityValue = data.quantity !== null && data.quantity !== undefined ? data.quantity : '';
    const itemValue = data.item || '';
    const unitValue = data.unit || '';
    
    console.log('材料行を作成:', { item: itemValue, quantity: quantityValue, unit: unitValue });
    
    const priceValue = data.price !== null && data.price !== undefined ? data.price : '';
    
    div.innerHTML = `
      <input type="text" placeholder="材料名 *" value="${escapeHtml(itemValue)}" data-field="item" class="ing-item">
      <input type="text" placeholder="分量" value="${escapeHtml(quantityValue)}" data-field="quantity" class="ing-qty">
      <input type="text" placeholder="単位" value="${escapeHtml(unitValue)}" data-field="unit" class="ing-unit">
      <input type="number" placeholder="単価" value="${escapeHtml(priceValue)}" data-field="price" class="ing-price" min="0" step="0.01">
      <button type="button" class="btn danger small js-remove-row">削除</button>`;
    ingredientsEditor.appendChild(div);
    console.log('材料行を追加完了');
  };

  const addStepRow = (data = {}) => {
    console.log('addStepRow呼び出し:', data);
    if (!stepsEditor) {
      console.error('stepsEditorが見つかりません');
      return;
    }
    const instructionValue = data.instruction || '';
    console.log('手順行を作成:', { instruction: instructionValue });
    
    const div = document.createElement('div');
    div.className = 'step-row';
    div.innerHTML = `
      <input type="text" placeholder="手順 *" value="${escapeHtml(instructionValue)}" data-field="instruction" class="step-text">
      <button type="button" class="btn danger small js-remove-row">削除</button>`;
    stepsEditor.appendChild(div);
    console.log('手順行を追加完了');
  };

  // --- Category Management ---
  const loadCustomCategories = () => {
    const saved = localStorage.getItem('customCategories');
    if (saved) {
      customCategories = JSON.parse(saved);
      updateCategorySelect();
    }
  };

  const saveCustomCategories = () => {
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
  };

  const loadCustomTags = () => {
    const saved = localStorage.getItem('customTags');
    if (saved) {
      customTags = JSON.parse(saved);
      updateTagSelect();
    }
  };

  const saveCustomTags = () => {
    localStorage.setItem('customTags', JSON.stringify(customTags));
  };

  const addCustomCategory = (categoryName) => {
    if (!categoryName || categoryName.trim() === '') return;
    
    const trimmedName = categoryName.trim();
    if (!customCategories.includes(trimmedName)) {
      customCategories.push(trimmedName);
      saveCustomCategories();
      updateCategorySelect();
    }
  };

  const addCustomTag = (tagName) => {
    if (!tagName || tagName.trim() === '') return;
    
    const trimmedName = tagName.trim();
    if (!customTags.includes(trimmedName)) {
      customTags.push(trimmedName);
      saveCustomTags();
      updateTagSelect();
    }
  };

  const openCategoryModal = () => {
    if (categoryModal) {
      tempSelectedCategory = selectedCategory;
      updateCategoryModalSelection();
      categoryModal.style.display = 'flex';
    }
  };

  const closeCategoryModal = () => {
    if (categoryModal) {
      categoryModal.style.display = 'none';
    }
  };

  const updateCategoryModalSelection = () => {
    // 基本カテゴリーの選択状態を更新
    const categoryOptions = categoryOptionsContainer?.querySelectorAll('.category-option');
    categoryOptions?.forEach(option => {
      option.classList.toggle('selected', option.dataset.category === tempSelectedCategory);
    });
    
    // カスタムカテゴリーの表示を更新
    if (customCategories.length > 0) {
      customCategoryGroup.style.display = 'block';
      customCategoryOptions.innerHTML = '';
      
      customCategories.forEach(category => {
        const option = document.createElement('button');
        option.className = 'category-option custom';
        option.dataset.category = category;
        option.innerHTML = `
          ${escapeHtml(category)}
          <button type="button" class="remove-custom-item" data-category="${escapeHtml(category)}">
            <i class="fas fa-times"></i>
          </button>
        `;
        option.classList.toggle('selected', category === tempSelectedCategory);
        customCategoryOptions.appendChild(option);
      });
    } else {
      customCategoryGroup.style.display = 'none';
    }
  };

  const openTagModal = () => {
    if (tagModal) {
      tempSelectedTags = [...selectedTags];
      updateTagModalSelection();
      tagModal.style.display = 'flex';
    }
  };

  const closeTagModal = () => {
    if (tagModal) {
      tagModal.style.display = 'none';
    }
  };

  const updateTagModalSelection = () => {
    // 基本タグの選択状態を更新
    const tagOptions = tagOptionsContainer?.querySelectorAll('.tag-option');
    tagOptions?.forEach(option => {
      option.classList.toggle('selected', tempSelectedTags.includes(option.dataset.tag));
    });
    
    // カスタムタグの表示を更新
    if (customTags.length > 0) {
      const customTagGroup = document.getElementById('custom-tag-group');
      const customTagOptions = document.getElementById('custom-tag-options');
      
      if (customTagGroup && customTagOptions) {
        customTagGroup.style.display = 'block';
        customTagOptions.innerHTML = '';
        
        customTags.forEach(tag => {
          const option = document.createElement('button');
          option.className = 'tag-option custom';
          option.dataset.tag = tag;
          option.innerHTML = `
            ${escapeHtml(tag)}
            <button type="button" class="remove-custom-item" data-tag="${escapeHtml(tag)}">
              <i class="fas fa-times"></i>
            </button>
          `;
          option.classList.toggle('selected', tempSelectedTags.includes(tag));
          customTagOptions.appendChild(option);
        });
      }
    } else {
      const customTagGroup = document.getElementById('custom-tag-group');
      if (customTagGroup) {
        customTagGroup.style.display = 'none';
      }
    }
  };

  const removeCustomCategory = (categoryName) => {
    customCategories = customCategories.filter(cat => cat !== categoryName);
    saveCustomCategories();
    updateCategorySelect();
    
    // 削除されたカテゴリーが現在選択されている場合は選択をクリア
    if (selectedCategory === categoryName) {
      selectedCategory = '';
      updateCategorySelect();
    }
  };

  const removeCustomTag = (tagName) => {
    customTags = customTags.filter(tag => tag !== tagName);
    saveCustomTags();
    updateTagSelect();
    
    // 削除されたタグが現在選択されている場合は選択から削除
    selectedTags = selectedTags.filter(tag => tag !== tagName);
    updateTagSelect();
  };



  const updateCategorySelect = () => {
    // カテゴリー選択ボタンのテキストを更新
    if (selectedCategoryText) {
      selectedCategoryText.textContent = selectedCategory || 'カテゴリーを選択';
    }
    
    // カテゴリに応じてレシピタイプとUIを更新
    updateRecipeTypeByCategory();
  };
  
  const updateRecipeTypeByCategory = () => {
    const servingsField = document.querySelector('.servings-field');
    const servingsLabel = servingsField?.querySelector('label[for="servings"]');
    const servingsInput = servingsField?.querySelector('#servings');
    const servingsUnit = servingsField?.querySelector('.servings-unit');
    const adjustButton = servingsField?.querySelector('#adjustServingsBtn');
    
    if (!servingsField || !servingsLabel || !servingsInput || !servingsUnit || !adjustButton) return;
    
    // カテゴリに応じてレシピタイプを判定
    const category = selectedCategory.toLowerCase();
    
    if (category.includes('パン') || category.includes('bread')) {
      currentRecipeType = 'bread';
      servingsLabel.textContent = '出来上がり総量';
      servingsInput.placeholder = '例: 500';
      servingsUnit.textContent = 'g';
      adjustButton.textContent = '総量に応じて材料量を調整';
    } else if (category.includes('ケーキ') || category.includes('cake') || category.includes('デザート') || category.includes('dessert')) {
      currentRecipeType = 'cake';
      servingsLabel.textContent = '出来上がりサイズ';
      servingsInput.placeholder = '例: 18cm';
      servingsUnit.textContent = '型';
      adjustButton.textContent = 'サイズに応じて材料量を調整';
    } else {
      currentRecipeType = 'normal';
      servingsLabel.textContent = '出来上がり人数';
      servingsInput.placeholder = '例: 4';
      servingsUnit.textContent = '人前';
      adjustButton.textContent = '人数に応じて材料量を調整';
    }
    
    console.log(`レシピタイプを${currentRecipeType}に変更しました`);
  };

  const updateTagSelect = () => {
    // タグ選択ボタンのテキストを更新
    if (selectedTagsText) {
      if (selectedTags.length === 0) {
        selectedTagsText.textContent = 'タグを選択';
      } else if (selectedTags.length === 1) {
        selectedTagsText.textContent = selectedTags[0];
      } else if (selectedTags.length === 2) {
        selectedTagsText.textContent = selectedTags.join('、');
      } else {
        // 3つ以上のタグがある場合は、最初のタグと残りの数を表示
        selectedTagsText.textContent = `${selectedTags[0]} 他${selectedTags.length - 1}個`;
      }
    }
  };

  const loadCategoriesFromDB = async () => {
    try {
      const { data, error } = await sb.from('recipes').select('category').not('category', 'is', null);
      if (error) throw error;
      
      // ユニークなカテゴリーを取得
      const uniqueCategories = [...new Set(data.map(r => r.category).filter(Boolean))];
      allCategories = uniqueCategories.sort();
      
      // カテゴリーオプションを生成
      if (categoryOptionsContainer) {
        categoryOptionsContainer.innerHTML = '';
        allCategories.forEach(category => {
          const option = document.createElement('button');
          option.className = 'category-option';
          option.dataset.category = category;
          option.textContent = category;
          categoryOptionsContainer.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadTagsFromDB = async () => {
    try {
      const { data, error } = await sb.from('recipes').select('tags').not('tags', 'is', null);
      if (error) throw error;
      
      // すべてのタグをフラット化してユニークを取得
      const allTagsFromDB = data.flatMap(r => r.tags || []).filter(Boolean);
      const uniqueTags = [...new Set(allTagsFromDB)];
      allTags = uniqueTags.sort();
      
      // タグオプションを生成
      if (tagOptionsContainer) {
        tagOptionsContainer.innerHTML = '';
        allTags.forEach(tag => {
          const option = document.createElement('button');
          option.className = 'tag-option';
          option.dataset.tag = tag;
          option.textContent = tag;
          tagOptionsContainer.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  // --- フォーム保存機能 ---
  const saveRecipe = async () => {
    try {
      console.log('💾 レシピ保存を開始します...');
      console.log('🔍 保存開始時の画像データ確認:', {
        hasCurrentImageData: !!window.currentImageData,
        imageDataLength: window.currentImageData ? window.currentImageData.length : 0,
        imageDataStart: window.currentImageData ? window.currentImageData.substring(0, 50) + '...' : 'none'
      });
      
      const params = new URLSearchParams(window.location.search);
      const recipeId = params.get('id');
      
      const title = titleEl?.value?.trim() || '';
      const category = selectedCategory || '';
      const tags = selectedTags || [];
      const notes = notesEl?.value?.trim() || '';

      if (!title) {
        alert('料理名を入力してください。');
        return;
      }

      const ingredientRows = Array.from(ingredientsEditor?.querySelectorAll('.ingredient-row') || []);
      const ingredients = ingredientRows.map((row, index) => {
        const item = row.querySelector('[data-field="item"]')?.value?.trim() || '';
        const quantity = row.querySelector('[data-field="quantity"]')?.value?.trim() || '';
        const unit = row.querySelector('[data-field="unit"]')?.value?.trim() || '';
        if (!item) return null;
        return { 
          position: index + 1, 
          item, 
          quantity: quantity || null, 
          unit: unit || null
        };
      }).filter(Boolean);

      const stepRows = Array.from(stepsEditor?.querySelectorAll('.step-row') || []);
      const steps = stepRows.map((row, index) => {
        const instruction = row.querySelector('[data-field="instruction"]')?.value?.trim() || '';
        if (!instruction) return null;
        return { position: index + 1, instruction };
      }).filter(Boolean);

      // 画像データを取得
      const imageData = window.currentImageData || null;
      console.log('🔍 保存時の画像データ確認:', {
        hasCurrentImageData: !!window.currentImageData,
        imageDataLength: imageData ? imageData.length : 0,
        imageDataStart: imageData ? imageData.substring(0, 50) + '...' : 'none'
      });
      
      const recipeData = { 
        title, 
        category: category || null, 
        tags: tags.length > 0 ? tags : null, 
        notes: notes || null,
        image_url: imageData // 画像データをBase64で保存
      };
      
      // servingsカラムが存在する場合のみ追加
      if (servingsEl?.value) {
        recipeData.servings = parseInt(servingsEl.value);
      }

      let recipeResult;
      try {
        if (recipeId) {
          recipeResult = await sb.from('recipes').update(recipeData).eq('id', recipeId).select('id').single();
        } else {
          recipeResult = await sb.from('recipes').insert(recipeData).select('id').single();
        }

        if (recipeResult.error) {
          console.error('レシピ保存エラーの詳細:', recipeResult.error);
          throw new Error('レシピの保存に失敗しました: ' + recipeResult.error.message);
        }
      } catch (error) {
        // servingsカラムが存在しない場合の回避策
        if (error.message.includes('servings') || error.message.includes('column')) {
          console.log('servingsカラムが存在しないため、servingsを除外して保存を試行します');
          
          // servingsを除外して再試行
          const { servings, ...recipeDataWithoutServings } = recipeData;
          
          if (recipeId) {
            recipeResult = await sb.from('recipes').update(recipeDataWithoutServings).eq('id', recipeId).select('id').single();
          } else {
            recipeResult = await sb.from('recipes').insert(recipeDataWithoutServings).select('id').single();
          }
          
          if (recipeResult.error) {
            throw new Error('レシピの保存に失敗しました: ' + recipeResult.error.message);
          }
          
          console.log('servingsを除外してレシピを保存しました');
        } else {
          throw error;
        }
      }
      const savedRecipeId = recipeResult.data.id;

      await sb.from('recipe_ingredients').delete().eq('recipe_id', savedRecipeId);
      await sb.from('recipe_steps').delete().eq('recipe_id', savedRecipeId);

      if (ingredients.length > 0) {
        const ingredientsToInsert = ingredients.map(ing => ({ ...ing, recipe_id: savedRecipeId }));
        const ingredientsResult = await sb.from('recipe_ingredients').insert(ingredientsToInsert);
        if (ingredientsResult.error) { throw new Error('材料の保存に失敗しました: ' + ingredientsResult.error.message); }
      }

      if (steps.length > 0) {
        const stepsToInsert = steps.map(step => ({ ...step, recipe_id: savedRecipeId }));
        const stepsResult = await sb.from('recipe_steps').insert(stepsToInsert);
        if (stepsResult.error) { throw new Error('手順の保存に失敗しました: ' + stepsResult.error.message); }
      }

      console.log('✅ レシピ保存成功！保存されたデータ:', {
        recipeId: savedRecipeId,
        hasImageUrl: !!recipeData.image_url,
        imageUrlLength: recipeData.image_url ? recipeData.image_url.length : 0
      });
      
      alert('レシピを保存しました！');
      window.location.href = `recipe_view.html?id=${encodeURIComponent(savedRecipeId)}`;

    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + (error.message || error));
    }
  };

  // --- AIモーダル制御（既存ロジック） ---
  const openModal = () => { 
    console.log('AIモーダルを開こうとしています...');
    
    // 材料の入力状況をチェック
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    const validIngredients = [];
    
    ingredientRows.forEach(row => {
      const itemInput = row.querySelector('.ing-item');
      const item = itemInput ? itemInput.value.trim() : '';
      if (item) {
        validIngredients.push(item);
      }
    });
    
    console.log('入力された材料:', validIngredients);
    
    if (validIngredients.length === 0) {
      // 材料が何も入力されていない場合
      const baseIngredient = prompt('何をベースに創作しますか？\n例: 鶏肉、トマト、卵 など');
      if (!baseIngredient || baseIngredient.trim() === '') {
        console.log('材料入力がキャンセルされました');
        return; // キャンセルされた場合
      }
      // 入力された材料を最初の行に追加
      if (ingredientRows.length > 0) {
        const firstRow = ingredientRows[0];
        const itemInput = firstRow.querySelector('.ing-item');
        if (itemInput) {
          itemInput.value = baseIngredient.trim();
        }
      }
      console.log('材料が追加されました:', baseIngredient);
    } else if (validIngredients.length === 1) {
      // 材料が1種類の場合、その材料をベースに創作
      console.log(`材料「${validIngredients[0]}」をベースにAI創作を開始します`);
    } else {
      // 材料が複数の場合、全ての材料を使った創作
      console.log(`材料「${validIngredients.join('、')}」を全て使ったAI創作を開始します`);
    }
    
    // モーダルの状態をリセット
    if (aiStep1) aiStep1.style.display = 'block';
    if (aiStep2) aiStep2.style.display = 'none';
    if (aiStep3) aiStep3.style.display = 'none';
    if (aiLoading) aiLoading.style.display = 'none';
    
    // ボタンの状態をリセット
    if (getSuggestionsBtn) getSuggestionsBtn.disabled = true;
    if (generateFullRecipeBtn) generateFullRecipeBtn.disabled = true;
    
    // 選択状態をリセット
    genreBtns.forEach(b => b.classList.remove('selected'));
    selectedGenre = '';
    selectedMenu = '';
    finalRecipeData = null;
    
    // 入力フィールドをクリア
    if (aiCustomRequestEl) aiCustomRequestEl.value = '';
    if (menuSuggestionsContainer) menuSuggestionsContainer.innerHTML = '';
    if (recipePreview) recipePreview.innerHTML = '';
    
    console.log('AIモーダルを表示します');
    if(aiModal) {
      aiModal.style.display = 'flex';
      console.log('AIモーダルが表示されました');
    } else {
      console.error('AIモーダル要素が見つかりません');
    }
  };
  const closeModal = () => { if(aiModal) aiModal.style.display = 'none'; resetModal(); };
  const resetModal = () => {
    if (!aiStep1 || !aiStep2 || !aiStep3 || !aiLoading) return;
    aiStep1.style.display = 'block';
    aiStep2.style.display = 'none';
    aiStep3.style.display = 'none';
    aiLoading.style.display = 'none';
    genreBtns.forEach(b => b.classList.remove('selected'));
    if (getSuggestionsBtn) getSuggestionsBtn.disabled = true;
    if (generateFullRecipeBtn) generateFullRecipeBtn.disabled = true;
    if (aiCustomRequestEl) aiCustomRequestEl.value = '';
    if (menuSuggestionsContainer) menuSuggestionsContainer.innerHTML = '';
    if (recipePreview) recipePreview.innerHTML = '';
    selectedGenre = ''; selectedMenu = ''; finalRecipeData = null;
  };

  // 修正点2: AIとの通信部分を安定化
  function extractLLMText(r) {
    try {
      if (!r) return '';
      let text = '';
      if (typeof r === 'string') { text = r; }
      else if (Array.isArray(r.candidates) && r.candidates.length) {
        const cand = r.candidates[0];
        if (cand && cand.content && Array.isArray(cand.content.parts)) {
          text = cand.content.parts.map(p => (p && p.text) ? p.text : '').join('\n');
        }
      }
      if (!text) return '';
      
      console.log('AIからの生テキスト:', text);
      
      // JSONの開始と終了を探す
      const startIndex = text.indexOf('{');
      const endIndex = text.lastIndexOf('}');
      
      if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
        const jsonText = text.substring(startIndex, endIndex + 1);
        console.log('抽出されたJSON:', jsonText);
        
        // JSONの妥当性をチェック
        try {
          JSON.parse(jsonText);
          return jsonText;
        } catch (parseError) {
          console.error('JSON解析エラー:', parseError);
          console.error('問題のあるJSON:', jsonText);
          return jsonText; // 解析できなくても返す
        }
      }
      
      console.error('JSONが見つかりませんでした');
      return text;
    } catch (e) {
      console.error('extractLLMText error', e, r);
      return '';
    }
  }

  async function callGemini(prompt, responseSchema) {
    try {
      console.log('🤖 Gemini API呼び出し開始:', { prompt: prompt.substring(0, 100) + '...', responseSchema });
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 直接Gemini APIを呼び出し
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
        const errorData = await response.json();
        throw new Error(`Gemini API エラー: ${errorData.error?.message || response.statusText}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        const content = result.candidates[0].content.parts[0].text;
        console.log('📝 Gemini応答テキスト:', content);
        
        window._debug_ai_response = content;
        
        // JSONを抽出
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('❌ JSON抽出失敗 - 応答内容:', content);
          throw new Error('Gemini APIから有効なJSONが返されませんでした');
        }

        try {
          const jsonData = JSON.parse(jsonMatch[0]);
          console.log('✅ Gemini API データ抽出成功:', jsonData);
          return jsonData;
        } catch (parseError) {
          console.error('❌ JSON解析エラー:', parseError);
          console.error('❌ 解析対象JSON:', jsonMatch[0]);
          throw new Error('Gemini APIからのJSON解析に失敗しました');
        }
      }

      console.error('❌ Gemini API応答構造エラー:', result);
      throw new Error('Gemini APIから有効なレスポンスを取得できませんでした');
      
    } catch (error) {
      console.error('❌ callGemini関数エラー:', error);
      throw error;
    }
  }

  // --- クリックハンドラ ---
  if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
  if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
  if (saveBtn) saveBtn.addEventListener('click', saveRecipe);
  
  // 人数調整ボタン
  const adjustServingsBtn = document.getElementById('adjustServingsBtn');
  if (adjustServingsBtn) {
    adjustServingsBtn.addEventListener('click', adjustIngredientsByServings);
  }
  
  // カテゴリー選択ボタン
  if (categorySelectBtn) {
    categorySelectBtn.addEventListener('click', () => {
      openCategoryModal();
    });
  }

  // カテゴリー選択モーダルの閉じるボタン
  if (categoryModalCloseBtn) {
    categoryModalCloseBtn.addEventListener('click', closeCategoryModal);
  }

  // カテゴリー選択モーダルの背景クリックで閉じる
  if (categoryModal) {
    categoryModal.addEventListener('click', (e) => {
      if (e.target === categoryModal) {
        closeCategoryModal();
      }
    });
  }

  // カテゴリーオプションのクリック
  if (categoryOptionsContainer) {
    categoryOptionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.category-option');
      if (option) {
        tempSelectedCategory = option.dataset.category;
        updateCategoryModalSelection();
      }
    });
  }

  // カスタムカテゴリーオプションのクリック
  if (customCategoryOptions) {
    customCategoryOptions.addEventListener('click', (e) => {
      const option = e.target.closest('.category-option');
      if (option && !e.target.closest('.remove-custom-item')) {
        tempSelectedCategory = option.dataset.category;
        updateCategoryModalSelection();
      }
    });
  }

  // カスタムカテゴリーの削除
  if (customCategoryOptions) {
    customCategoryOptions.addEventListener('click', (e) => {
      if (e.target.closest('.remove-custom-item')) {
        e.stopPropagation();
        const category = e.target.closest('.remove-custom-item').dataset.category;
        removeCustomCategory(category);
        updateCategoryModalSelection();
      }
    });
  }

  // カテゴリーOKボタン
  if (categoryOkBtn) {
    categoryOkBtn.addEventListener('click', () => {
      selectedCategory = tempSelectedCategory;
      updateCategorySelect();
      closeCategoryModal();
    });
  }

  // カテゴリーキャンセルボタン
  if (categoryCancelBtn) {
    categoryCancelBtn.addEventListener('click', closeCategoryModal);
  }

  // タグ選択ボタン
  if (tagSelectBtn) {
    tagSelectBtn.addEventListener('click', () => {
      openTagModal();
    });
  }

  // タグ選択モーダルの閉じるボタン
  if (tagModalCloseBtn) {
    tagModalCloseBtn.addEventListener('click', closeTagModal);
  }

  // タグ選択モーダルの背景クリックで閉じる
  if (tagModal) {
    tagModal.addEventListener('click', (e) => {
      if (e.target === tagModal) {
        closeTagModal();
      }
    });
  }

  // タグオプションのクリック
  if (tagOptionsContainer) {
    tagOptionsContainer.addEventListener('click', (e) => {
      const option = e.target.closest('.tag-option');
      if (option && !e.target.closest('.remove-custom-item')) {
        const tag = option.dataset.tag;
        if (tempSelectedTags.includes(tag)) {
          tempSelectedTags = tempSelectedTags.filter(t => t !== tag);
        } else {
          tempSelectedTags.push(tag);
        }
        updateTagModalSelection();
      }
    });
  }

  // カスタムタグの削除
  const customTagOptions = document.getElementById('custom-tag-options');
  if (customTagOptions) {
    customTagOptions.addEventListener('click', (e) => {
      if (e.target.closest('.remove-custom-item')) {
        e.stopPropagation();
        const tag = e.target.closest('.remove-custom-item').dataset.tag;
        removeCustomTag(tag);
        updateTagModalSelection();
      }
    });
  }

  // カスタムタグオプションのクリック
  if (customTagOptions) {
    customTagOptions.addEventListener('click', (e) => {
      const option = e.target.closest('.tag-option');
      if (option && !e.target.closest('.remove-custom-item')) {
        const tag = option.dataset.tag;
        if (tempSelectedTags.includes(tag)) {
          tempSelectedTags = tempSelectedTags.filter(t => t !== tag);
        } else {
          tempSelectedTags.push(tag);
        }
        updateTagModalSelection();
      }
    });
  }

  // タグOKボタン
  if (tagOkBtn) {
    tagOkBtn.addEventListener('click', () => {
      selectedTags = [...tempSelectedTags];
      updateTagSelect();
      closeTagModal();
    });
  }

  // タグキャンセルボタン
  if (tagCancelBtn) {
    tagCancelBtn.addEventListener('click', closeTagModal);
  }

  // 新規カテゴリー追加ボタン
  const addNewCategoryBtn = document.getElementById('add-new-category-btn');
  if (addNewCategoryBtn) {
    addNewCategoryBtn.addEventListener('click', () => {
      const newCategory = prompt('新しいカテゴリ名を入力してください:');
      if (newCategory) {
        addCustomCategory(newCategory);
        updateCategoryModalSelection();
      }
    });
  }

  // 新規タグ追加ボタン
  const addNewTagBtn = document.getElementById('add-new-tag-btn');
  if (addNewTagBtn) {
    addNewTagBtn.addEventListener('click', () => {
      const newTag = prompt('新しいタグ名を入力してください:');
      if (newTag) {
        addCustomTag(newTag);
        updateTagModalSelection();
      }
    });
  }


  
  // カスタムカテゴリ削除
  if (customCategoriesContainer) {
    customCategoriesContainer.addEventListener('click', (e) => {
      if (e.target.closest('.remove-category')) {
        const category = e.target.closest('.remove-category').dataset.category;
        removeCustomCategory(category);
      }
    });
  }
  
  if (document.querySelector('form')) {
    document.querySelector('form').addEventListener('click', (e) => {
      if (e.target.classList.contains('js-remove-row')) {
        const row = e.target.closest('.ingredient-row, .step-row');
        if (row) row.remove();
      }
    });
  }

  if (aiWizardBtn) {
    console.log('AI創作ボタンが見つかりました');
    aiWizardBtn.addEventListener('click', openModal);
  } else {
    console.error('AI創作ボタンが見つかりません');
  }
  
  if (modalCloseBtn) {
    console.log('モーダル閉じるボタンが見つかりました');
    modalCloseBtn.addEventListener('click', closeModal);
  } else {
    console.error('モーダル閉じるボタンが見つかりません');
  }
  
  // AIモーダルの背景クリックで閉じる
  if (aiModal) {
    aiModal.addEventListener('click', (e) => {
      if (e.target === aiModal) {
        closeModal();
      }
    });
  }

  if (genreBtns) genreBtns.forEach(btn => btn.addEventListener('click', () => {
    genreBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedGenre = btn.dataset.genre;
    if (getSuggestionsBtn) getSuggestionsBtn.disabled = false;
  }));

  // AIワザード機能
  if (getSuggestionsBtn) {
    getSuggestionsBtn.addEventListener('click', async () => {
      if (!selectedGenre) return;
      aiStep1.style.display = 'none';
      aiLoading.style.display = 'block';
      try {
        // 材料の入力状況を取得
        const ingredientRows = document.querySelectorAll('.ingredient-row');
        const validIngredients = [];
        
        ingredientRows.forEach(row => {
          const itemInput = row.querySelector('.ing-item');
          const item = itemInput ? itemInput.value.trim() : '';
          if (item) {
            validIngredients.push(item);
          }
        });
        
        const customRequest = aiCustomRequestEl?.value?.trim() || '';
        let prompt = `${selectedGenre}料理のメニューを5つ提案してください。`;
        
        // 材料に応じてプロンプトを調整
        if (validIngredients.length === 1) {
          prompt += `\n\n主材料として「${validIngredients[0]}」を使用した料理を提案してください。`;
          
          // 材料に応じたタグのヒントを追加
          const ingredient = validIngredients[0].toLowerCase();
          if (ingredient.includes('肉') || ingredient.includes('牛') || ingredient.includes('豚') || ingredient.includes('鶏')) {
            prompt += `\n\nタグのヒント: 肉料理、メイン、本格 など`;
          } else if (ingredient.includes('魚') || ingredient.includes('鮭') || ingredient.includes('マグロ')) {
            prompt += `\n\nタグのヒント: 魚料理、和食、ヘルシー など`;
          } else if (ingredient.includes('野菜') || ingredient.includes('トマト') || ingredient.includes('キャベツ')) {
            prompt += `\n\nタグのヒント: 野菜料理、ヘルシー、簡単 など`;
          } else if (ingredient.includes('りんご') || ingredient.includes('バナナ') || ingredient.includes('イチゴ')) {
            prompt += `\n\nタグのヒント: デザート、スイーツ、簡単 など`;
          }
        } else if (validIngredients.length > 1) {
          prompt += `\n\n以下の材料を全て使用した料理を提案してください：${validIngredients.join('、')}`;
          
          // 複数材料の場合のタグヒント
          const hasMeat = validIngredients.some(ing => ing.toLowerCase().includes('肉') || ing.toLowerCase().includes('牛') || ing.toLowerCase().includes('豚') || ing.toLowerCase().includes('鶏'));
          const hasFish = validIngredients.some(ing => ing.toLowerCase().includes('魚') || ing.toLowerCase().includes('鮭') || ing.toLowerCase().includes('マグロ'));
          const hasVegetable = validIngredients.some(ing => ing.toLowerCase().includes('野菜') || ing.toLowerCase().includes('トマト') || ing.toLowerCase().includes('キャベツ'));
          
          if (hasMeat) {
            prompt += `\n\nタグのヒント: 肉料理、メイン、本格 など`;
          } else if (hasFish) {
            prompt += `\n\nタグのヒント: 魚料理、和食、ヘルシー など`;
          } else if (hasVegetable) {
            prompt += `\n\nタグのヒント: 野菜料理、ヘルシー、簡単 など`;
          }
        }
        
        if (customRequest) {
          prompt += `\n\n追加要望: ${customRequest}`;
        }
        
        prompt += `\n\n---
各メニューには、そのメニューのコンセプトや意図を30字程度の短い文章で添えてください。
必ず以下のJSON形式で、JSONオブジェクトのみを返してください。解説や前置き、Markdownのコードブロックなどは一切不要です。
{"suggestions": [{"name": "メニュー名1", "intent": "メニューの意図1"}, {"name": "メニュー名2", "intent": "メニューの意図2"}]}`;
        
        console.log('🚀 AI創作プロンプト送信:', prompt);
        const result = await callGemini(prompt, { type: "OBJECT", properties: { suggestions: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, intent: { type: "STRING" } }, required: ["name", "intent"] } } }, required: ["suggestions"] });
        
        console.log('✅ AI創作結果受信:', result);
        
        aiLoading.style.display = 'none';
        aiStep2.style.display = 'block';
        
        if (menuSuggestionsContainer && result && result.suggestions && Array.isArray(result.suggestions)) {
          console.log('📋 メニュー提案を表示:', result.suggestions);
          menuSuggestionsContainer.innerHTML = '';
          result.suggestions.forEach((menu, index) => {
            console.log(`メニュー ${index + 1}:`, menu);
            const item = document.createElement('div');
            item.className = 'menu-suggestions-item';
            item.innerHTML = `<div class="menu-name">${escapeHtml(menu.name || 'メニュー名なし')}</div><div class="menu-intent">${escapeHtml(menu.intent || '説明なし')}</div>`;
            item.addEventListener('click', () => {
              menuSuggestionsContainer.querySelectorAll('.menu-suggestions-item').forEach(i => i.classList.remove('selected'));
              item.classList.add('selected');
              selectedMenu = menu.name;
              console.log('選択されたメニュー:', selectedMenu);
              if (generateFullRecipeBtn) generateFullRecipeBtn.disabled = false;
            });
            menuSuggestionsContainer.appendChild(item);
          });
        } else {
          console.error('❌ メニュー提案データが無効:', { result, hasContainer: !!menuSuggestionsContainer });
          alert('メニュー提案の取得に失敗しました。AIからの応答が無効です。');
        }
      } catch (error) {
        console.error('メニュー提案エラー:', error);
        aiLoading.style.display = 'none';
        aiStep1.style.display = 'block';
        alert(`メニュー提案の取得に失敗しました: ${error.message}\n\nAIからの応答:\n${window._debug_ai_response || '(取得できず)'}`);
      }
    });
  }

  if (generateFullRecipeBtn) {
    generateFullRecipeBtn.addEventListener('click', async () => {
      if (!selectedMenu) {
        console.error('❌ メニューが選択されていません');
        alert('メニューを選択してください');
        return;
      }
      
      console.log('🚀 レシピ生成開始 - 選択されたメニュー:', selectedMenu);
      aiStep2.style.display = 'none';
      aiLoading.style.display = 'block';
      try {
        // 材料の入力状況を取得
        const ingredientRows = document.querySelectorAll('.ingredient-row');
        const validIngredients = [];
        
        ingredientRows.forEach(row => {
          const itemInput = row.querySelector('.ing-item');
          const item = itemInput ? itemInput.value.trim() : '';
          if (item) {
            validIngredients.push(item);
          }
        });
        
        let prompt = `「${selectedMenu}」の詳細なレシピを作成してください。プロの料理人レベルの正確な分量と手順でお願いします。`;
        
        // 材料に応じてプロンプトを調整
        if (validIngredients.length === 1) {
          prompt += `\n\n主材料として「${validIngredients[0]}」を使用したレシピを作成してください。`;
        } else if (validIngredients.length > 1) {
          prompt += `\n\n以下の材料を全て使用したレシピを作成してください：${validIngredients.join('、')}`;
        }
        
        prompt += `\n\n---
重要: 必ず以下のJSON形式で、JSONオブジェクトのみを返してください。解説や前置き、Markdownのコードブロック、改行、余分な文字は一切不要です。

材料の単位は以下の標準単位のみを使用してください：
- 重量: g（グラム）、kg（キログラム）
- 容量: ml（ミリリットル）、L（リットル）
- 個数: 個、枚、本、束
- その他: 適量、少々

小さじ、大さじ、カップなどの表記は禁止です。

メモ部分は、超一流のプロの料理人が他のプロの料理人と考察するような専門的な内容にしてください。調理技術、火加減、タイミング、食材の特性、味のバランス、見た目の美しさなどについて、具体的で実践的なアドバイスを含めてください。

材料と分量は、実際のレシピサイトや料理本を参考にして、正確で実現可能な分量にしてください。出来上がりの数（何人前）も明確にしてください。

タグは料理の特徴を表す適切なタグを2-4個選んでください。例：
- 肉料理、魚料理、野菜料理、デザート
- 和食、洋食、中華、エスニック
- 定番、創作、簡単、本格
- 前菜、メイン、サイド、スープ

JSONレスポンス例:
{"title":"ビーフステーキ","category":"メイン","tags":["肉料理","洋食","本格"],"notes":"火加減のコントロールが重要。肉の表面をしっかり焼いてから中火でじっくりと。","servings":"2人前","ingredients":[{"item":"牛もも肉","quantity":"200","unit":"g"},{"item":"塩","quantity":"3","unit":"g"}],"steps":["肉を室温に戻す","塩胡椒を振る","強火で表面を焼く"]}`;
        
        console.log('🚀 レシピ生成プロンプト送信:', prompt);
        const result = await callGemini(prompt, { 
          type: "OBJECT", 
          properties: { 
            title: { type: "STRING" }, 
            category: { type: "STRING" }, 
            tags: { type: "ARRAY", items: { type: "STRING" } }, 
            notes: { type: "STRING" }, 
            servings: { type: "STRING" }, 
            ingredients: { 
              type: "ARRAY", 
              items: { 
                type: "OBJECT", 
                properties: { 
                  item: { type: "STRING" }, 
                  quantity: { type: "STRING" }, 
                  unit: { type: "STRING" } 
                }, 
                required: ["item"] 
              } 
            }, 
            steps: { type: "ARRAY", items: { type: "STRING" } } 
          }, 
          required: ["title", "ingredients", "steps"] 
        });
        
        console.log('✅ レシピ生成結果受信:', result);
        
        if (!result || !result.title || !result.ingredients || !result.steps) {
          console.error('❌ レシピ生成データが不完全:', result);
          throw new Error('AIから不完全なレシピデータが返されました');
        }
        
        // 材料の単位を標準化
        if (result.ingredients && Array.isArray(result.ingredients)) {
          result.ingredients.forEach(ing => {
            if (ing.unit) {
              // 小さじ・大さじ・カップなどの表記を標準単位に変換
              const unit = ing.unit.trim();
              if (unit.includes('小さじ') || unit.includes('小匙')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 5).toString();
                }
              } else if (unit.includes('大さじ') || unit.includes('大匙')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 15).toString();
                }
              } else if (unit.includes('カップ') || unit.includes('cup')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 200).toString();
                }
              } else if (unit.includes('合')) {
                ing.unit = 'ml';
                if (ing.quantity) {
                  ing.quantity = (parseFloat(ing.quantity) * 180).toString();
                }
              }
            }
          });
        }
        
        finalRecipeData = result;
        aiLoading.style.display = 'none';
        aiStep3.style.display = 'block';
        
        console.log('✅ AI分析完了 - ステップ3を表示します');
        console.log('📊 生成されたレシピデータ:', result);
        if (recipePreview) {
          console.log('レシピプレビュー用データ（単位変換後）:', result);
          
          let preview = `📝 タイトル: ${result.title || '(タイトルなし)'}\n\n`;
          preview += `🏷️ カテゴリ: ${result.category || '(カテゴリなし)'}\n`;
          preview += `🏷️ タグ: ${(result.tags || []).length > 0 ? result.tags.join(', ') : '(タグなし)'}\n`;
          if (result.servings) {
            preview += `👥 出来上がり: ${result.servings}\n`;
          }
          if (result.notes) {
            preview += `\n📝 プロの技術解説:\n${result.notes}\n`;
          }
          
          preview += `\n🥘 材料 (${(result.ingredients || []).length}個):\n`;
          if (result.ingredients && result.ingredients.length > 0) {
            // シンプルなリスト形式で表示
            result.ingredients.forEach((ing, index) => {
              const item = ing.item || '(材料名なし)';
              const quantity = ing.quantity || '';
              const unit = ing.unit || '';
              const quantityText = quantity && unit ? `${quantity}${unit}` : quantity || unit || '';
              preview += `• ${item}${quantityText ? ` - ${quantityText}` : ''}\n`;
            });
          } else {
            preview += `(材料なし)\n`;
          }
          
          preview += `\n👨‍🍳 手順 (${(result.steps || []).length}個):\n`;
          if (result.steps && result.steps.length > 0) {
            result.steps.forEach((step, index) => {
              preview += `${index + 1}. ${step || '(手順なし)'}\n`;
            });
          } else {
            preview += `(手順なし)\n`;
          }
          
          recipePreview.textContent = preview;
          console.log('レシピプレビューを更新:', preview);
        }
      } catch (error) {
        console.error('❌ レシピ生成エラー:', error);
        console.error('AIからの生レスポンス:', window._debug_ai_response);
        aiLoading.style.display = 'none';
        aiStep2.style.display = 'block';
        
        let errorMessage = 'レシピ生成に失敗しました: ' + (error.message || error);
        if (window._debug_ai_response) {
          errorMessage += '\n\nAIからの応答:\n' + window._debug_ai_response.substring(0, 500) + '...';
        }
        
        alert(errorMessage);
      }
    });
  }

  if (applyRecipeBtn) {
    applyRecipeBtn.addEventListener('click', () => {
      console.log('レシピをフォームに反映します:', finalRecipeData);
      if (!finalRecipeData) {
        console.error('finalRecipeDataが存在しません');
        return;
      }
      
      // タイトルを設定
      if (titleEl) {
        titleEl.value = finalRecipeData.title || '';
        console.log('タイトルを設定:', finalRecipeData.title);
      }
      
      // カテゴリーを設定
      if (finalRecipeData.category) {
        selectedCategory = finalRecipeData.category;
        updateCategorySelect();
        console.log('カテゴリーを設定:', finalRecipeData.category);
      }
      
      // タグを設定
      if (finalRecipeData.tags && Array.isArray(finalRecipeData.tags)) {
        selectedTags = finalRecipeData.tags;
        updateTagSelect();
        console.log('タグを設定:', finalRecipeData.tags);
      }
      
      // 出来上がり人数を設定
      if (servingsEl && finalRecipeData.servings) {
        // "4人前"のような文字列から数字を抽出
        const servingsMatch = finalRecipeData.servings.match(/(\d+)/);
        if (servingsMatch) {
          servingsEl.value = servingsMatch[1];
          console.log('出来上がり人数を設定:', servingsMatch[1]);
        }
      }
      
      // メモを設定（servings情報は除外）
      if (notesEl) {
        notesEl.value = finalRecipeData.notes || '';
        console.log('メモを設定:', finalRecipeData.notes);
      }
      
      // 材料を設定
      if (ingredientsEditor) {
        ingredientsEditor.innerHTML = '';
        console.log('材料を設定:', finalRecipeData.ingredients);
        if (finalRecipeData.ingredients && Array.isArray(finalRecipeData.ingredients) && finalRecipeData.ingredients.length > 0) {
          finalRecipeData.ingredients.forEach((ing, index) => {
            console.log(`材料${index + 1}を追加:`, ing);
            // 材料データの正規化
            const normalizedIng = {
              item: ing.item || '',
              quantity: ing.quantity || '',
              unit: ing.unit || ''
            };
            addIngredientRow(normalizedIng);
          });
        } else {
          console.log('材料データが空または無効です');
          addIngredientRow(); // 空の行を追加
        }
      }
      
      // 手順を設定
      if (stepsEditor) {
        stepsEditor.innerHTML = '';
        console.log('手順を設定:', finalRecipeData.steps);
        if (finalRecipeData.steps && Array.isArray(finalRecipeData.steps) && finalRecipeData.steps.length > 0) {
          finalRecipeData.steps.forEach((step, index) => {
            console.log(`手順${index + 1}を追加:`, step);
            addStepRow({ instruction: step || '' });
          });
        } else {
          console.log('手順データが空または無効です');
          addStepRow(); // 空の行を追加
        }
      }
      
      closeModal();
      alert('レシピデータをフォームに反映しました！');
    });
  }

  // --- 起動時：既存レシピ読み込みまたは空行追加 ---
  (function initializeForm(){
    try{
      // カスタムカテゴリとタグを読み込み
      loadCustomCategories();
      loadCustomTags();
      
      // データベースからカテゴリーとタグを読み込み
      loadCategoriesFromDB();
      loadTagsFromDB();
      
      // 初期レシピタイプを設定
      updateRecipeTypeByCategory();
      
      // URLパラメータから新規レシピデータを取得
      const params = new URLSearchParams(window.location.search);
      const newRecipeParam = params.get('newRecipe');
      if (newRecipeParam) {
        try {
          const data = JSON.parse(decodeURIComponent(newRecipeParam));
          console.log('新規レシピデータを受信:', data);
          
          if (titleEl) titleEl.value = data.title || '';
          if (data.description && notesEl) notesEl.value = data.description;
          if (data.servings && servingsEl) {
            const servingsMatch = data.servings.match(/(\d+)/);
            if (servingsMatch) servingsEl.value = servingsMatch[1];
          }
          if (data.category) {
            selectedCategory = data.category;
            updateCategorySelect();
          }
          if (data.tags && Array.isArray(data.tags)) {
            selectedTags = data.tags;
            updateTagSelect();
          }
          if (ingredientsEditor) {
            ingredientsEditor.innerHTML = '';
            (data.ingredients || []).forEach(ing => addIngredientRow(ing));
          }
          if (stepsEditor) {
            stepsEditor.innerHTML = '';
            (data.steps || []).forEach(step => addStepRow({ instruction: step }));
          }
          if (data.notes && notesEl) {
            notesEl.value = data.notes;
          }
          
          alert('AIアドバイスから新規レシピを読み込みました！');
          return;
        } catch (error) {
          console.error('新規レシピデータの解析エラー:', error);
        }
      }
      
      const aiRecipe = localStorage.getItem('ai_generated_recipe');
      if (aiRecipe) {
        const data = JSON.parse(aiRecipe);
        if (titleEl) titleEl.value = data.title || '';
        selectedCategory = data.category || '';
        selectedTags = data.tags || [];
        updateCategorySelect();
        updateTagSelect();
        if (notesEl) notesEl.value = data.notes || '';
        if (ingredientsEditor) ingredientsEditor.innerHTML = '';
        (data.ingredients || []).forEach(ing => addIngredientRow(ing));
        if (stepsEditor) stepsEditor.innerHTML = '';
        (data.steps || []).forEach(step => addStepRow({ instruction: step }));
        localStorage.removeItem('ai_generated_recipe');
        return;
      }
      const recipeId = params.get('id');
      if (recipeId) {
        loadExistingRecipe(recipeId);
      } else {
        addIngredientRow(); 
        addStepRow();
      }
    }catch(e){
      console.error('フォーム初期化エラー:', e);
      addIngredientRow(); 
      addStepRow();
    }
  })();

  // 既存レシピの読み込み
  async function loadExistingRecipe(id) {
    try {
      const { data: recipe, error } = await sb.from('recipes').select('*').eq('id', id).single();
      if (error) throw error;
      if (titleEl) titleEl.value = recipe.title || '';
      selectedCategory = recipe.category || '';
      selectedTags = Array.isArray(recipe.tags) ? recipe.tags : [];
      updateCategorySelect();
      updateTagSelect();
      if (servingsEl && recipe.servings !== undefined) {
        servingsEl.value = recipe.servings || '';
      }
      if (notesEl) notesEl.value = recipe.notes || '';
      const { data: ingredients } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position');
      if (ingredientsEditor) ingredientsEditor.innerHTML = '';
      if (ingredients && ingredients.length > 0) {
        ingredients.forEach(ing => addIngredientRow(ing));
      } else {
        addIngredientRow();
      }
      const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position');
      if (stepsEditor) stepsEditor.innerHTML = '';
      if (steps && steps.length > 0) {
        steps.forEach(step => addStepRow({ instruction: step.instruction || '' }));
      } else {
        addStepRow();
      }
    } catch (error) {
      console.error('既存レシピ読み込みエラー:', error);
      addIngredientRow();
      addStepRow();
    }
  }

  // Cloud Vision API関連の関数
  async function extractTextFromImage(imageData) {
    try {
      console.log('🔍 Cloud Vision APIでOCR実行中...');
      
      // OCR使用の通知を表示
      if (typeof window.showOCRNotification === 'function') {
        window.showOCRNotification();
      }
      
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${window.APP_CONFIG.VISION_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: {
              content: imageData.split(',')[1] // base64データ部分のみ
            },
            features: [{
              type: 'TEXT_DETECTION',
              maxResults: 1
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Cloud Vision API エラー: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Cloud Vision API結果:', result);

      if (result.responses && result.responses[0] && result.responses[0].textAnnotations) {
        const fullText = result.responses[0].textAnnotations[0].description;
        console.log('📝 抽出されたテキスト:', fullText);
        
        // OCR完了の通知を表示
        if (typeof window.showOCRCompleteNotification === 'function') {
          window.showOCRCompleteNotification();
        }
        
        return fullText;
      } else {
        console.log('⚠️ テキストが検出されませんでした');
        return '';
      }
    } catch (error) {
      console.error('❌ Cloud Vision API エラー:', error);
      throw error;
    }
  }

  async function analyzeRecipeImage(imageText) {
    try {
      console.log('🤖 Geminiで画像テキストを解析中...');
      
      const prompt = `
以下のレシピページのテキストを解析して、JSON形式で構造化データを抽出してください。

テキスト:
${imageText}

以下のJSON形式で返してください:
{
  "title": "レシピのタイトル",
  "description": "レシピの説明（あれば）",
  "ingredients": [
    {
      "item": "材料名",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    "手順1",
    "手順2",
    "手順3"
  ]
}

注意事項:
- 材料の分量と単位を正確に分離してください
- 手順は番号付きリストから抽出してください
- 日本語以外の場合は日本語に翻訳してください
- 単位は標準的な形式（g、ml、個、本など）に統一してください
`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${window.APP_CONFIG.GEMINI_API_KEY}`, {
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
        throw new Error(`Gemini API エラー: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Gemini解析結果:', result);

      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        const text = result.candidates[0].content.parts[0].text;
        console.log('📝 Gemini応答テキスト:', text);
        
        // JSONを抽出
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const recipeData = JSON.parse(jsonMatch[0]);
          console.log('✅ 解析されたレシピデータ:', recipeData);
          return recipeData;
        } else {
          throw new Error('JSONデータが見つかりませんでした');
        }
      } else {
        throw new Error('Gemini APIから有効な応答がありませんでした');
      }
    } catch (error) {
      console.error('❌ Gemini解析エラー:', error);
      throw error;
    }
  }

  async function captureAndAnalyzeRecipe(url) {
    try {
      console.log('📸 スクリーンショット方式でレシピ抽出開始...');
      
      // 新しいウィンドウでURLを開く
      const newWindow = window.open(url, '_blank', 'width=1200,height=800');
      
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            // html2canvasでスクリーンショットを取得
            const canvas = await html2canvas(newWindow.document.body, {
              scale: 1,
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#ffffff'
            });
            
            const imageData = canvas.toDataURL('image/png');
            console.log('📸 スクリーンショット取得完了');
            
            // Cloud Vision APIでOCR実行
            const imageText = await extractTextFromImage(imageData);
            
            // Geminiで解析
            const recipeData = await analyzeRecipeImage(imageText);
            
            // ウィンドウを閉じる
            newWindow.close();
            
            resolve(recipeData);
          } catch (error) {
            newWindow.close();
            reject(error);
          }
        }, 3000); // 3秒待機してページ読み込み完了を待つ
      });
    } catch (error) {
      console.error('❌ スクリーンショット解析エラー:', error);
      throw error;
    }
  }

  // グローバル関数として公開
  window.extractTextFromImage = extractTextFromImage;
  window.analyzeRecipeImage = analyzeRecipeImage;
  window.captureAndAnalyzeRecipe = captureAndAnalyzeRecipe;
}