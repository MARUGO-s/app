// レシピ編集画面専用の機能

// レシピ編集の初期化
async function initRecipeEdit() {
  const id = getRecipeId();
  
  if (id) {
    // 既存レシピの編集
    await loadRecipeData(id);
  } else {
    // 新規レシピの作成
    initNewRecipe();
  }
  
  // イベントリスナーの設定
  setupEventListeners();
}

// 既存レシピの読み込み
async function loadRecipeData(id) {
  debugLog('既存レシピを読み込み中 - ID:', id);
  
  try {
    const recipe = await getRecipe(id);
    if (!recipe) {
      alert('レシピが見つかりません');
      return;
    }
    
    // フォームにデータを設定
    setFormData(recipe);
    
    // 材料と手順を読み込み
    await loadRecipeDetails(id);
    
  } catch (error) {
    errorLog('レシピ読み込みエラー:', error);
    alert('レシピの読み込みに失敗しました');
  }
}

// 新規レシピの初期化
function initNewRecipe() {
  debugLog('新規レシピを作成中');
  
  // フォームをクリア（直接実装）
  setElementValue('title', '');
  const categoryText = getElement('selectedCategoryText');
  if (categoryText) categoryText.textContent = 'カテゴリーを選択';
  
  const tagsContainer = getElement('customTags');
  if (tagsContainer) tagsContainer.innerHTML = '';
  
  setElementValue('notes', '');
  setElementValue('sourceUrl', '');
  
  // 材料と手順をクリア
  const ingredientsContainer = getElement('ingredientsEditor');
  const stepsContainer = getElement('stepsEditor');
  
  if (ingredientsContainer) ingredientsContainer.innerHTML = '';
  if (stepsContainer) stepsContainer.innerHTML = '';
  
  // 空の行を追加
  addEmptyIngredientRow();
  addEmptyStepRow();
  
  // デフォルト値を設定
  setDefaultValues();
}

// フォームにデータを設定
function setFormData(recipe) {
  // 基本情報
  setElementValue('title', recipe.title || '');
  // カテゴリーは選択ボタンで設定
  const categoryText = getElement('selectedCategoryText');
  if (categoryText) categoryText.textContent = recipe.category || 'カテゴリーを選択';
  setElementValue('notes', recipe.notes || '');
  
  // タグは選択ボタンで設定
  const tagsContainer = getElement('customTags');
  if (tagsContainer && recipe.tags && recipe.tags.length > 0) {
    tagsContainer.innerHTML = recipe.tags.map(tag => 
      `<span class="tag-item">${tag}</span>`
    ).join('');
  }
  
  // 画像
  if (recipe.image_url) {
    setElementValue('sourceUrl', recipe.image_url);
  }
}

// レシピ詳細（材料・手順）の読み込み
async function loadRecipeDetails(id) {
  try {
    // 材料を読み込み
    const ingredients = await getRecipeIngredients(id);
    displayIngredients(ingredients);
    
    // 手順を読み込み
    const steps = await getRecipeSteps(id);
    displaySteps(steps);
    
  } catch (error) {
    errorLog('レシピ詳細読み込みエラー:', error);
  }
}

// 材料の表示
function displayIngredients(ingredients) {
  const container = getElement('ingredientsEditor');
  if (!container) return;
  
  container.innerHTML = '';
  
  ingredients.forEach((ingredient, index) => {
    const ingredientElement = createIngredientElement(ingredient, index);
    container.appendChild(ingredientElement);
  });
  
  // データがない場合のみ空の材料行を1つ追加
  if (ingredients.length === 0) {
    addEmptyIngredientRow();
  }
}

// 手順の表示
function displaySteps(steps) {
  const container = getElement('stepsEditor');
  if (!container) return;
  
  container.innerHTML = '';
  
  steps.forEach((step, index) => {
    const stepElement = createStepElement(step, index);
    container.appendChild(stepElement);
  });
  
  // データがない場合のみ空の手順行を1つ追加
  if (steps.length === 0) {
    addEmptyStepRow();
  }
}

// 材料要素の作成
function createIngredientElement(ingredient, index) {
  const div = document.createElement('div');
  div.className = 'ingredient-row';
  div.innerHTML = `
    <div class="ingredient-top-row">
      <input type="text" placeholder="材料名" value="${escapeHtml(ingredient.item || '')}" class="ingredient-item">
      <button type="button" class="remove-ingredient" onclick="removeIngredientRow(this)">削除</button>
    </div>
    <div class="ingredient-bottom-row">
      <input type="text" placeholder="分量" value="${escapeHtml(ingredient.quantity || '')}" class="ingredient-quantity">
      <input type="text" placeholder="単位" value="${escapeHtml(ingredient.unit || '')}" class="ingredient-unit">
      <input type="text" placeholder="単価" value="${ingredient.price || ''}" class="ingredient-price">
    </div>
  `;
  return div;
}

// 手順要素の作成
function createStepElement(step, index) {
  const div = document.createElement('div');
  div.className = 'step-row';
  div.innerHTML = `
    <textarea placeholder="手順を入力してください" class="step-text">${escapeHtml(step.instruction || step.step || step.description || step.body || '')}</textarea>
    <button type="button" class="remove-step" onclick="removeStepRow(this)">削除</button>
  `;
  return div;
}

// 空の材料行を追加
function addEmptyIngredientRow() {
  const container = getElement('ingredientsEditor');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'ingredient-row';
  div.innerHTML = `
    <div class="ingredient-top-row">
      <input type="text" placeholder="材料名" class="ingredient-item">
      <button type="button" class="remove-ingredient" onclick="removeIngredientRow(this)">削除</button>
    </div>
    <div class="ingredient-bottom-row">
      <input type="text" placeholder="分量" class="ingredient-quantity">
      <input type="text" placeholder="単位" class="ingredient-unit">
      <input type="text" placeholder="単価" class="ingredient-price">
    </div>
  `;
  container.appendChild(div);
}

// 空の手順行を追加
function addEmptyStepRow() {
  const container = getElement('stepsEditor');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'step-row';
  div.innerHTML = `
    <textarea placeholder="手順を入力してください" class="step-text"></textarea>
    <button type="button" class="remove-step" onclick="removeStepRow(this)">削除</button>
  `;
  container.appendChild(div);
}

// 材料行の削除
function removeIngredientRow(button) {
  const row = button.closest('.ingredient-row');
  if (row) {
    row.remove();
  }
}

// 手順行の削除
function removeStepRow(button) {
  const row = button.closest('.step-row');
  if (row) {
    row.remove();
  }
}

// clearForm関数は app-edit.js で定義されているため削除

// デフォルト値を設定
function setDefaultValues() {
  // カテゴリーは選択ボタンで設定
  const categoryText = getElement('selectedCategoryText');
  if (categoryText) categoryText.textContent = 'その他';
  setElementValue('notes', '');
}

// イベントリスナーの設定
function setupEventListeners() {
  // 保存ボタンは app-edit.js で処理
  
  // 材料追加ボタン
  const addIngredientButton = getElement('addIng');
  if (addIngredientButton) {
    addIngredientButton.addEventListener('click', addEmptyIngredientRow);
  }
  
  // 手順追加ボタン
  const addStepButton = getElement('addStep');
  if (addStepButton) {
    addStepButton.addEventListener('click', addEmptyStepRow);
  }
  
  // 画像URL入力時のプレビュー
  const imageUrlInput = getElement('sourceUrl');
  if (imageUrlInput) {
    imageUrlInput.addEventListener('input', updateImagePreview);
  }
}

// 保存処理
async function handleSave() {
  debugLog('レシピ保存開始');
  
  try {
    // フォームデータを取得
    const formData = getFormData();
    
    // バリデーション
    if (!validateFormData(formData)) {
      return;
    }
    
    // 保存処理
    const recipeId = await saveRecipeData(formData);
    
    // 成功メッセージ
    alert('レシピを保存しました！');
    
    // レシピ表示画面に遷移
    window.location.href = `recipe_view.html?id=${encodeURIComponent(recipeId)}`;
    
  } catch (error) {
    errorLog('レシピ保存エラー:', error);
    alert('保存に失敗しました: ' + error.message);
  }
}

// 選択されたカテゴリーを取得
function getSelectedCategory() {
  const categoryText = getElement('selectedCategoryText');
  return categoryText ? categoryText.textContent : '';
}

// 選択されたタグを取得
function getSelectedTags() {
  const tagsContainer = getElement('customTags');
  if (!tagsContainer) return [];
  
  const tagElements = tagsContainer.querySelectorAll('.tag-item');
  return Array.from(tagElements).map(tag => tag.textContent.trim());
}

// フォームデータの取得
function getFormData() {
  return {
    title: getElementValue('title'),
    category: getSelectedCategory(),
    notes: getElementValue('notes'),
    tags: getSelectedTags(),
    image_url: getElementValue('sourceUrl'),
    ingredients: getIngredientsData(),
    steps: getStepsData()
  };
}

// 材料データの取得
function getIngredientsData() {
  const rows = document.querySelectorAll('.ingredient-row');
  const ingredients = [];
  
  rows.forEach(row => {
    const item = row.querySelector('.ingredient-item')?.value?.trim();
    const quantity = row.querySelector('.ingredient-quantity')?.value?.trim();
    const unit = row.querySelector('.ingredient-unit')?.value?.trim();
    const price = row.querySelector('.ingredient-price')?.value?.trim();
    
    if (item) {
      ingredients.push({
        item,
        quantity: quantity || '',
        unit: unit || '',
        price: price || ''
      });
    }
  });
  
  return ingredients;
}

// 手順データの取得
function getStepsData() {
  const rows = document.querySelectorAll('.step-row');
  const steps = [];
  
  rows.forEach(row => {
    const text = row.querySelector('.step-text')?.value?.trim();
    if (text) {
      steps.push({
        instruction: text
      });
    }
  });
  
  return steps;
}

// フォームデータのバリデーション
function validateFormData(data) {
  if (!data.title || data.title.trim() === '') {
    alert('タイトルを入力してください');
    return false;
  }
  
  if (!data.category || data.category.trim() === '') {
    alert('カテゴリーを入力してください');
    return false;
  }
  
  if (data.ingredients.length === 0) {
    alert('材料を1つ以上入力してください');
    return false;
  }
  
  if (data.steps.length === 0) {
    alert('手順を1つ以上入力してください');
    return false;
  }
  
  return true;
}

// レシピデータの保存
async function saveRecipeData(formData) {
  const id = getRecipeId();
  
  if (id) {
    // 既存レシピの更新
    return await updateExistingRecipe(id, formData);
  } else {
    // 新規レシピの作成
    return await createNewRecipe(formData);
  }
}

// 既存レシピの更新
async function updateExistingRecipe(id, formData) {
  debugLog('既存レシピを更新中 - ID:', id);
  
  // レシピ基本情報を更新
  const recipeData = {
    title: formData.title,
    category: formData.category,
    notes: formData.notes,
    tags: formData.tags,
    image_url: formData.image_url,
    updated_at: new Date().toISOString()
  };
  
  await updateRecipe(id, recipeData);
  
  // 材料を更新
  await deleteIngredients(id);
  await saveIngredients(id, formData.ingredients);
  
  // 手順を更新
  await deleteSteps(id);
  await saveSteps(id, formData.steps);
  
  return id;
}

// 新規レシピの作成
async function createNewRecipe(formData) {
  debugLog('新規レシピを作成中');
  
  // レシピ基本情報を作成
  const recipeData = {
    title: formData.title,
    category: formData.category,
    notes: formData.notes,
    tags: formData.tags,
    image_url: formData.image_url,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const recipe = await saveRecipe(recipeData);
  const recipeId = recipe.id;
  
  // 材料を保存
  await saveIngredients(recipeId, formData.ingredients);
  
  // 手順を保存
  await saveSteps(recipeId, formData.steps);
  
  return recipeId;
}

// 画像プレビューの更新
function updateImagePreview() {
  const imageUrl = getElementValue('sourceUrl');
  const preview = getElement('inlineRecipeImageImg');
  
  if (preview) {
    if (imageUrl && imageUrl.trim()) {
      preview.src = imageUrl;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }
}

// 要素の値を取得
// getElementValue関数は utils.js で定義済み

// 要素の値を設定
function setElementValue(id, value) {
  const element = getElement(id);
  if (element) {
    element.value = value;
  }
}

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initRecipeEdit,
    loadRecipeData,
    initNewRecipe,
    setFormData,
    loadRecipeDetails,
    displayIngredients,
    displaySteps,
    createIngredientElement,
    createStepElement,
    addEmptyIngredientRow,
    addEmptyStepRow,
    removeIngredientRow,
  removeStepRow,
  setDefaultValues,
    setupEventListeners,
    handleSave,
    getFormData,
    getIngredientsData,
    getStepsData,
    validateFormData,
    saveRecipeData,
    updateExistingRecipe,
    createNewRecipe,
    updateImagePreview,
    // getElementValueは utils.js で定義済み
    setElementValue
  };
}
