// Simplified Recipe Editor - Consolidated from 2098 lines to ~800 lines
const CONFIG = {
  GEMINI_API_KEY: 'AIzaSyAUsJcsyFY1vcBlrDNn1DYLRor_oqLErx4',
  SUPABASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q',
  STORAGE_BUCKET: 'images'
};

let sb, selectedCategory = '', selectedTags = [], currentRecipeType = 'normal';
let originalIngredients = [], baseServings = 1, finalRecipeData = null;
let customCategories = [], customTags = [], allCategories = [], allTags = [];

// Utility functions
const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// API Functions
async function callGeminiAPI(text, url) {
  await sleep(1000); // Rate limiting
  
  const prompt = `以下のレシピページからレシピ情報を抽出し、日本語に翻訳してください。
ページURL: ${url || '不明'}
ページ内容: ${text.substring(0, 8000)}

以下のJSON形式で回答してください：
{
  "title": "レシピのタイトル（日本語）",
  "description": "レシピの説明（日本語）",
  "servings": "人数",
  "ingredients": [{"item": "材料名（日本語）", "quantity": "分量", "unit": "単位"}],
  "steps": ["手順1（日本語）", "手順2（日本語）"]
}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${CONFIG.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) throw new Error(`Gemini API エラー: ${response.statusText}`);

  const result = await response.json();
  if (result.candidates?.[0]?.content) {
    const content = result.candidates[0].content.parts[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  }
  throw new Error('Gemini APIから有効なレスポンスを取得できませんでした');
}

async function fetchHTMLViaProxy(url) {
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://cors-anywhere.herokuapp.com/${url}`,
    `https://thingproxy.freeboard.io/fetch/${url}`
  ];

  for (const proxy of proxies) {
    try {
      const response = await fetch(proxy);
      if (response.ok) {
        let html = proxy.includes('allorigins.win') 
          ? (await response.json()).contents 
          : await response.text();
        if (html && html.length > 100) return html;
      }
    } catch (error) {
      continue;
    }
  }
  throw new Error('すべてのプロキシサービスが失敗しました');
}

// URL Import Function
window.runImport = async function(url) {
  try {
    const html = await fetchHTMLViaProxy(url);
    const recipeData = await callGeminiAPI(html, url);
    
    // Fill form fields
    if (recipeData.title) document.getElementById('title').value = recipeData.title;
    if (recipeData.description) document.getElementById('notes').value = recipeData.description;
    if (recipeData.servings) document.getElementById('servings').value = recipeData.servings;
    
    // Fill ingredients using the canonical editor row (.ingredient-row with .ing-item/.ing-qty/.ing-unit)
    const ingredientsContainer = document.getElementById('ingredientsEditor');
    if (ingredientsContainer) {
      ingredientsContainer.innerHTML = '';
      const list = Array.isArray(recipeData.ingredients) ? recipeData.ingredients : [];
      if (list.length > 0) {
        list.forEach(ing => {
          addIngredientRow({ item: ing.item || '', quantity: ing.quantity || '', unit: ing.unit || '' });
        });
      } else {
        addIngredientRow();
      }
    }

    // Fill steps using the canonical editor row (.step-row with .step-text)
    const stepsContainer = document.getElementById('stepsEditor');
    if (stepsContainer) {
      stepsContainer.innerHTML = '';
      const steps = Array.isArray(recipeData.steps) ? recipeData.steps : [];
      if (steps.length > 0) {
        steps.forEach(step => addStepRow({ instruction: step }));
      } else {
        addStepRow();
      }
    }

    // Try to extract primary image from HTML (og:image > first <img>) and display inline + preview block
    (function attachImageFromHTML(){
      try{
        // 1) prefer JSON from AI if provided
        let imgUrl = (recipeData && recipeData.image_url) ? String(recipeData.image_url).trim() : '';
        // 2) parse HTML for og:image or first img
        if (!imgUrl && typeof DOMParser !== 'undefined'){
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const meta = doc.querySelector('meta[property="og:image"], meta[name="og:image"]');
          const firstImg = doc.querySelector('img');
          const raw = meta?.getAttribute('content') || firstImg?.getAttribute('src') || '';
          if (raw) {
            try { imgUrl = new URL(raw, url).href; } catch { imgUrl = raw; }
          }
        }
        if (imgUrl){
          window.currentImageData = imgUrl;
          // インライン（人数横）
          const inlineImg = document.getElementById('inlineRecipeImageImg');
          if (inlineImg){ inlineImg.src = imgUrl; inlineImg.style.display = 'inline-block'; }
          // プレビュー枠
          const cont = document.getElementById('uploadedImagePreviewContainer');
          const prev = document.getElementById('uploadedImagePreview');
          if (prev){ prev.src = imgUrl; }
          if (cont){ cont.style.display = 'flex'; }
        }
      }catch(_){ /* ignore */ }
    })();
    
    alert('レシピの読み込みが完了しました！');
  } catch (error) {
    throw error;
  }
};

// DOM Helper Functions
const addIngredientRow = (data = {}) => {
  const container = document.getElementById('ingredientsEditor');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'ingredient-row';
  div.innerHTML = `
    <input type="text" placeholder="材料名 *" value="${escapeHtml(data.item || '')}" class="ing-item">
    <input type="text" placeholder="分量" value="${escapeHtml(data.quantity || '')}" class="ing-qty">
    <input type="text" placeholder="単位" value="${escapeHtml(data.unit || '')}" class="ing-unit">
    <input type="number" placeholder="単価" value="${escapeHtml(data.price || '')}" class="ing-price" min="0" step="0.01">
    <button type="button" class="btn danger small js-remove-row">削除</button>
  `;
  container.appendChild(div);
};

const addStepRow = (data = {}) => {
  const container = document.getElementById('stepsEditor');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'step-row';
  div.innerHTML = `
    <input type="text" placeholder="手順 *" value="${escapeHtml(data.instruction || '')}" class="step-text">
    <button type="button" class="btn danger small js-remove-row">削除</button>
  `;
  container.appendChild(div);
};

// Category and Tag Management
const updateCategorySelect = () => {
  const text = document.getElementById('selectedCategoryText');
  if (text) text.textContent = selectedCategory || 'カテゴリーを選択';
  updateRecipeTypeByCategory();
};

const updateTagSelect = () => {
  const text = document.getElementById('selectedTagsText');
  if (!text) return;
  
  if (selectedTags.length === 0) {
    text.textContent = 'タグを選択';
  } else if (selectedTags.length <= 2) {
    text.textContent = selectedTags.join('、');
  } else {
    text.textContent = `${selectedTags[0]} 他${selectedTags.length - 1}個`;
  }
};

const updateRecipeTypeByCategory = () => {
  const elements = {
    label: document.querySelector('.servings-field label[for="servings"]'),
    input: document.querySelector('#servings'),
    unit: document.querySelector('.servings-unit'),
    button: document.querySelector('#adjustServingsBtn')
  };
  
  if (!Object.values(elements).every(el => el)) return;
  
  const category = selectedCategory.toLowerCase();
  
  if (category.includes('パン') || category.includes('bread')) {
    currentRecipeType = 'bread';
    elements.label.textContent = '出来上がり総量';
    elements.input.placeholder = '例: 500';
    elements.unit.textContent = 'g';
    elements.button.textContent = '総量に応じて材料量を調整';
  } else if (category.includes('ケーキ') || category.includes('cake')) {
    currentRecipeType = 'cake';
    elements.label.textContent = '出来上がりサイズ';
    elements.input.placeholder = '例: 18cm';
    elements.unit.textContent = '型';
    elements.button.textContent = 'サイズに応じて材料量を調整';
  } else {
    currentRecipeType = 'normal';
    elements.label.textContent = '出来上がり人数';
    elements.input.placeholder = '例: 4';
    elements.unit.textContent = '人前';
    elements.button.textContent = '人数に応じて材料量を調整';
  }
};

// Modal Management
const toggleModal = (modalId, show) => {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = show ? 'flex' : 'none';
};

const setupModalEvents = () => {
  // URL Import Modal
  document.getElementById('urlImportBtn')?.addEventListener('click', () => {
    toggleModal('url-import-modal', true);
    document.getElementById('urlInput')?.focus();
  });
  
  document.getElementById('url-import-modal-close-btn')?.addEventListener('click', () => toggleModal('url-import-modal', false));
  document.getElementById('urlImportCancelBtn')?.addEventListener('click', () => toggleModal('url-import-modal', false));
  
  document.getElementById('urlImportConfirmBtn')?.addEventListener('click', async () => {
    const url = document.getElementById('urlInput')?.value?.trim();
    if (!url) return alert('URLを入力してください。');
    if (!url.startsWith('http')) return alert('有効なURLを入力してください。');
    
    const btn = document.getElementById('urlImportConfirmBtn');
    btn.disabled = true;
    btn.textContent = '読み込み中...';
    
    try {
      await window.runImport(url);
      toggleModal('url-import-modal', false);
    } catch (error) {
      alert(`レシピの読み込みに失敗しました: ${error.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '読み込み';
    }
  });
  
  // Category Modal
  document.getElementById('categorySelectBtn')?.addEventListener('click', () => {
    toggleModal('category-modal', true);
  });
  
  // Tag Modal  
  document.getElementById('tagSelectBtn')?.addEventListener('click', () => {
    toggleModal('tag-modal', true);
  });
  
  // AI Modal
  document.getElementById('ai-wizard-btn')?.addEventListener('click', () => {
    toggleModal('ai-modal', true);
  });

  // Image Analysis Modal
  document.getElementById('imageImportBtn')?.addEventListener('click', () => {
    toggleModal('image-import-modal', true);
  });
  
  document.getElementById('image-import-modal-close-btn')?.addEventListener('click', () => toggleModal('image-import-modal', false));
  document.getElementById('imageImportCancelBtn')?.addEventListener('click', () => toggleModal('image-import-modal', false));
  
  // Image upload buttons
  document.getElementById('fileSelectBtn')?.addEventListener('click', () => {
    document.getElementById('imageInput')?.click();
  });
  
  document.getElementById('cameraBtn')?.addEventListener('click', () => {
    document.getElementById('cameraInput')?.click();
  });

  // Simple image upload to Supabase Storage
  const imageUploadBtn = document.getElementById('imageUploadBtn');
  const imageFileInput = document.getElementById('recipeImageFile');
  if (imageUploadBtn && imageFileInput) {
    imageUploadBtn.addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto?.randomUUID?.() || Date.now()}.${fileExt}`;
        const filePath = `recipes/${fileName}`;
        // Upload to storage bucket 'images' (create if not exists in dashboard)
        const bucket = CONFIG.STORAGE_BUCKET || 'images';
        const { error: upErr } = await sb.storage.from(bucket).upload(filePath, file, { upsert: true, cacheControl: '3600' });
        if (upErr) throw upErr;
        const { data } = sb.storage.from(bucket).getPublicUrl(filePath);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) throw new Error('公開URLの取得に失敗しました');
        // Preview
        const cont = document.getElementById('uploadedImagePreviewContainer');
        const img = document.getElementById('uploadedImagePreview');
        if (img) img.src = publicUrl;
        if (cont) cont.style.display = 'flex';
        // keep to window for save()
        window.currentImageData = publicUrl;
        // inline preview in servings row
        const inlineImg = document.getElementById('inlineRecipeImageImg');
        if (inlineImg) {
          inlineImg.src = publicUrl;
          inlineImg.style.display = 'inline-block';
        }
      } catch (err) {
        alert('画像アップロードに失敗しました: ' + (err.message || err));
      } finally {
        e.target.value = '';
      }
    });
  }
  
  document.getElementById('analyzeButton')?.addEventListener('click', () => {
    // Call the analyzeImage function from recipe_edit.html
    if (typeof analyzeImage === 'function') {
      analyzeImage();
    }
  });
  
  document.getElementById('clearImageButton')?.addEventListener('click', () => {
    // Call the clearImage function from recipe_edit.html  
    if (typeof clearImage === 'function') {
      clearImage();
    }
  });

  // Servings adjustment button
  document.getElementById('adjustServingsBtn')?.addEventListener('click', () => {
    const newServings = prompt('何人分に調整しますか？', baseServings || 2);
    if (newServings && !isNaN(newServings)) {
      adjustIngredientQuantities(parseInt(newServings));
    }
  });

  // Category Modal buttons
  document.getElementById('category-ok-btn')?.addEventListener('click', () => {
    // Handle category selection
    const selectedCategoryEl = document.querySelector('.category-options .selected');
    if (selectedCategoryEl) {
      selectedCategory = selectedCategoryEl.textContent;
      document.getElementById('selectedCategoryText').textContent = selectedCategory;
    }
    toggleModal('category-modal', false);
  });

  document.getElementById('category-cancel-btn')?.addEventListener('click', () => {
    toggleModal('category-modal', false);
  });

  // Tag Modal buttons  
  document.getElementById('tag-ok-btn')?.addEventListener('click', () => {
    // Handle tag selection
    const selectedTags = Array.from(document.querySelectorAll('.tag-options .selected')).map(el => el.textContent);
    const tagText = selectedTags.length > 0 ? selectedTags.join(', ') : 'タグを選択';
    document.getElementById('selectedTagsText').textContent = tagText;
    toggleModal('tag-modal', false);
  });

  document.getElementById('tag-cancel-btn')?.addEventListener('click', () => {
    toggleModal('tag-modal', false);
  });

  // AI Modal buttons
  document.getElementById('get-suggestions-btn')?.addEventListener('click', async () => {
    await generateMenuSuggestions();
  });

  document.getElementById('generate-full-recipe-btn')?.addEventListener('click', async () => {
    await generateFullRecipe();
  });

  document.getElementById('apply-recipe-btn')?.addEventListener('click', async () => {
    await applyAIRecipeToForm();
    toggleModal('ai-modal', false);
  });

  // Modal close buttons
  document.getElementById('category-modal-close-btn')?.addEventListener('click', () => toggleModal('category-modal', false));
  document.getElementById('tag-modal-close-btn')?.addEventListener('click', () => toggleModal('tag-modal', false));
  document.getElementById('modal-close-btn')?.addEventListener('click', () => toggleModal('ai-modal', false));

  // Category and Tag selection clicks
  document.addEventListener('click', (e) => {
    // Category selection
    if (e.target.classList.contains('category-option')) {
      document.querySelectorAll('.category-option').forEach(el => el.classList.remove('selected'));
      e.target.classList.add('selected');
    }
    
    // Tag selection (multiple selection)
    if (e.target.classList.contains('tag-option')) {
      e.target.classList.toggle('selected');
    }
    
    // Genre selection in AI modal
    if (e.target.classList.contains('genre-btn')) {
      document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('selected'));
      e.target.classList.add('selected');
      document.getElementById('get-suggestions-btn').disabled = false;
    }
  });
};

// Recipe Save Function
const saveRecipe = async () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const recipeId = params.get('id');
    
    const title = document.getElementById('title')?.value?.trim();
    if (!title) return alert('料理名を入力してください。');
    
    // Debug: Log ingredient rows found
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    console.log('Found ingredient rows:', ingredientRows.length);
    
    const ingredients = Array.from(ingredientRows).map((row, index) => {
      const item = row.querySelector('.ing-item')?.value?.trim();
      const quantityRaw = row.querySelector('.ing-qty')?.value?.trim();
      const unit = row.querySelector('.ing-unit')?.value?.trim();
      const price = row.querySelector('.ing-price')?.value?.trim();
      const quantity = quantityRaw !== '' ? quantityRaw : null; // quantity は text 型
      console.log(`Ingredient ${index + 1}:`, { item, quantity, unit, price });
      return item ? { 
        position: index + 1, 
        item, 
        quantity, 
        unit: unit || null,
        price: price ? parseFloat(price) : null
      } : null;
    }).filter(Boolean);
    
    // Debug: Log step rows found
    const stepRows = document.querySelectorAll('.step-row');
    console.log('Found step rows:', stepRows.length);
    
    const steps = Array.from(stepRows).map((row, index) => {
      const instruction = row.querySelector('.step-text')?.value?.trim();
      console.log(`Step ${index + 1}:`, { instruction });
      return instruction ? { position: index + 1, instruction } : null;
    }).filter(Boolean);
    
    console.log('Final ingredients:', ingredients);
    console.log('Final steps:', steps);
    
    const recipeData = {
      title,
      category: selectedCategory || null,
      tags: selectedTags.length > 0 ? selectedTags : null,
      notes: document.getElementById('notes')?.value?.trim() || null,
      image_url: window.currentImageData || null
    };
    
    if (document.getElementById('servings')?.value) {
      recipeData.servings = parseInt(document.getElementById('servings').value);
    }
    
    let result;
    if (recipeId) {
      result = await sb.from('recipes').update(recipeData).eq('id', recipeId).select('id').single();
    } else {
      result = await sb.from('recipes').insert(recipeData).select('id').single();
    }
    
    if (result.error) throw new Error(result.error.message);
    
    const savedId = result.data.id;
    
    // Delete and re-insert ingredients/steps
    await sb.from('recipe_ingredients').delete().eq('recipe_id', savedId);
    await sb.from('recipe_steps').delete().eq('recipe_id', savedId);
    
    // Insert ingredients with fallback for column mismatches
    if (ingredients.length > 0) {
      // テーブルに存在するカラムのみ送信
      const payload = ingredients.map(ing => ({
        recipe_id: savedId,
        position: ing.position,
        item: ing.item,
        quantity: ing.quantity,
        unit: ing.unit,
        price: ing.price
      }));
      let { error: ingError } = await sb.from('recipe_ingredients').insert(payload);
      if (ingError) {
        console.error('Insert ingredients failed (with whitelist):', ingError);
        const message = (ingError.message || '').toLowerCase();
        if (message.includes('column')) {
          // さらに厳密に position/unit/price を除外して再試行
          const trimmed = payload.map(({ position, unit, price, ...rest }) => rest);
          let { error: retryErr } = await sb.from('recipe_ingredients').insert(trimmed);
          if (retryErr) {
            console.error('Retry insert ingredients (minimal columns) failed:', retryErr);
            throw retryErr;
          }
        } else {
          throw ingError;
        }
      }
    }
    
    if (steps.length > 0) {
      const stepPayload = steps.map(step => ({
        recipe_id: savedId,
        position: step.position,
        instruction: step.instruction
      }));
      const { error: stepError } = await sb.from('recipe_steps').insert(stepPayload);
      if (stepError) {
        console.error('Insert steps failed:', stepError);
        throw stepError;
      }
    }
    
    alert('レシピを保存しました！');
    window.location.href = `recipe_view.html?id=${encodeURIComponent(savedId)}`;
    
  } catch (error) {
    alert('保存に失敗しました: ' + (error.message || error));
  }
};

// AI Recipe Generation
const generateRecipeSuggestions = async (genre, customRequest = '') => {
  const ingredients = Array.from(document.querySelectorAll('.ing-item'))
    .map(input => input.value.trim())
    .filter(Boolean);
  
  let prompt = `${genre}料理のメニューを5つ提案してください。`;
  if (ingredients.length > 0) {
    prompt += `\n主材料: ${ingredients.join('、')}`;
  }
  if (customRequest) {
    prompt += `\n追加要望: ${customRequest}`;
  }
  
  prompt += `\n必ず以下のJSON形式で返してください：
{"suggestions": [{"name": "メニュー名1", "intent": "メニューの意図1"}, {"name": "メニュー名2", "intent": "メニューの意図2"}]}`;
  
  const result = await callGeminiAPI(prompt, '');
  return result;
};


// Debug function for testing ingredient insertion
const testIngredientInsertion = () => {
  console.log('=== TESTING INGREDIENT INSERTION ===');
  
  // Test data
  const testRecipe = {
    title: "テスト料理",
    description: "テスト用の説明",
    servings: 2,
    ingredients: [
      { item: "玉ねぎ", quantity: "1", unit: "個" },
      { item: "豚肉", quantity: "200", unit: "g" },
      { item: "塩", quantity: "適量", unit: "" }
    ],
    steps: ["手順1", "手順2", "手順3"]
  };
  
  // Set the test recipe as the AI generated recipe
  window.aiGeneratedRecipe = testRecipe;
  
  // Call the apply function
  applyAIRecipeToForm();
};

// Add test button (remove this in production)
window.testIngredientInsertion = testIngredientInsertion;

// Initialize App
const initializeApp = () => {
  console.log('Starting initializeApp...');
  if (typeof supabase === 'undefined') {
    console.error('Supabase not loaded');
    return;
  }
  console.log('Supabase loaded successfully');
  
  // Initialize Supabase
  sb = window.sb || supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  window.sb = sb;
  
  // Setup event listeners
  setupModalEvents();
  
  document.getElementById('addIng')?.addEventListener('click', () => addIngredientRow());
  document.getElementById('addStep')?.addEventListener('click', () => addStepRow());
  document.querySelector('.js-save')?.addEventListener('click', saveRecipe);
  
  // Form delegation for remove buttons
  document.querySelector('form')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('js-remove-row')) {
      e.target.closest('.ingredient-row, .step-row')?.remove();
    }
  });
  
  // Load existing recipe or add empty rows
  const params = new URLSearchParams(window.location.search);
  const recipeId = params.get('id');
  
  if (recipeId) {
    loadExistingRecipe(recipeId);
  } else {
    // If opened with AI-generated new recipe, apply it
    try {
      const params = new URLSearchParams(window.location.search);
      const newRecipeParam = params.get('newRecipe');
      let incoming = null;
      if (newRecipeParam) {
        // URLSearchParams.get は既にデコード済み文字列を返す
        incoming = JSON.parse(newRecipeParam);
      } else if (localStorage.getItem('ai_generated_recipe')) {
        incoming = JSON.parse(localStorage.getItem('ai_generated_recipe'));
        // keep for later sessions? remove to avoid confusion
        localStorage.removeItem('ai_generated_recipe');
      }

      if (incoming) {
        const recipeObj = incoming.recipe || incoming; // support {recipe: {...}}
        window.aiGeneratedRecipe = recipeObj;
        aiGeneratedRecipe = recipeObj;
        // 非同期だが待たずに適用開始（initializeApp は async ではないため）
        applyAIRecipeToForm();
      } else {
        addIngredientRow();
        addStepRow();
      }
    } catch (e) {
      console.error('Failed to apply incoming AI recipe:', e);
      addIngredientRow();
      addStepRow();
    }
    // show inline image preview if already selected via upload
    try {
      const imgEl = document.getElementById('inlineRecipeImageImg');
      if (imgEl && window.currentImageData) {
        imgEl.src = window.currentImageData;
        imgEl.style.display = 'inline-block';
      }
    } catch (e) {}
  }
};

// Load existing recipe
const loadExistingRecipe = async (id) => {
  try {
    const { data: recipe, error } = await sb.from('recipes').select('*').eq('id', id).single();
    if (error) throw error;
    
    document.getElementById('title').value = recipe.title || '';
    selectedCategory = recipe.category || '';
    selectedTags = Array.isArray(recipe.tags) ? recipe.tags : [];
    updateCategorySelect();
    updateTagSelect();
    
    if (recipe.servings !== undefined) {
      document.getElementById('servings').value = recipe.servings || '';
    }
    document.getElementById('notes').value = recipe.notes || '';
    // Inline image preview if available
    if (recipe.image_url) {
      window.currentImageData = recipe.image_url;
      const imgEl = document.getElementById('inlineRecipeImageImg');
      if (imgEl) {
        imgEl.src = recipe.image_url;
        imgEl.style.display = 'inline-block';
      }
    }
    
    // Load ingredients
    const { data: ingredients } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position');
    document.getElementById('ingredientsEditor').innerHTML = '';
    if (ingredients?.length > 0) {
      ingredients.forEach(ing => addIngredientRow(ing));
    } else {
      addIngredientRow();
    }
    
    // Load steps
    const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position');
    document.getElementById('stepsEditor').innerHTML = '';
    if (steps?.length > 0) {
      steps.forEach(step => addStepRow({ instruction: step.instruction || '' }));
    } else {
      addStepRow();
    }
  } catch (error) {
    addIngredientRow();
    addStepRow();
  }
};

// Adjust ingredient quantities based on servings
const adjustIngredientQuantities = (newServings) => {
  const currentServings = document.getElementById('servings')?.value || baseServings || 2;
  const ratio = newServings / currentServings;
  
  document.querySelectorAll('.ingredient-row .ing-qty').forEach(qtyInput => {
    const currentQty = parseFloat(qtyInput.value);
    if (!isNaN(currentQty)) {
      qtyInput.value = (currentQty * ratio).toFixed(2).replace(/\.?0+$/, '');
    }
  });
  
  document.getElementById('servings').value = newServings;
  baseServings = newServings;
};

// AI Recipe Generation Functions
let selectedGenre = '';
let aiGeneratedRecipe = null;
window.aiGeneratedRecipe = null;

// Unit normalization helpers (convert Japanese cooking units to ml/g)
const parseNumericLike = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // handle formats like '1 1/2'
  const mixed = s.match(/^(\d+)\s+(\d+)[\/](\d+)$/);
  if (mixed) {
    const whole = parseFloat(mixed[1]);
    const num = parseFloat(mixed[2]);
    const den = parseFloat(mixed[3]);
    if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) return whole + num / den;
  }
  // simple fraction like '1/2'
  const frac = s.match(/^(\d+)[\/](\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
  }
  // extract leading number e.g., '1.5個'
  const numMatch = s.match(/[-+]?\d*\.?\d+/);
  if (numMatch) {
    const n = parseFloat(numMatch[0]);
    if (!isNaN(n)) return n;
  }
  return null;
};

const normalizeQuantityUnit = (quantityRaw, unitRaw) => {
  let quantityText = quantityRaw == null ? '' : String(quantityRaw).trim();
  let unitText = unitRaw == null ? '' : String(unitRaw).trim();

  // Detect unit embedded in quantity
  if (!unitText) {
    const m = quantityText.match(/(小さじ|大さじ|カップ|tsp|tbsp|cup)\s*([\d\.\/]*)/i);
    if (m) {
      unitText = m[1];
      if (m[2]) quantityText = m[2];
    }
  }

  // Skip non-numeric/uncertain amounts
  if (/(少々|適量|ひとつまみ|お好み|少量)/.test(quantityText)) {
    return { quantity: quantityRaw, unit: unitRaw };
  }

  // Standardize ml-related units
  const unitLower = unitText.toLowerCase();
  const n = parseNumericLike(quantityText);
  if (n != null) {
    // Spoon and cup conversions to ml
    if (/^小さじ|tsp$/.test(unitText) || unitLower === 'tsp') {
      return { quantity: String(n * 5), unit: 'ml' };
    }
    if (/^大さじ|tbsp$/.test(unitText) || unitLower === 'tbsp') {
      return { quantity: String(n * 15), unit: 'ml' };
    }
    if (/カップ|cup/.test(unitText) || unitLower === 'cup') {
      return { quantity: String(n * 200), unit: 'ml' }; // Japanese cup ≈ 200ml
    }
    if (/(ml|ミリリットル|cc)/i.test(unitText)) {
      return { quantity: String(n), unit: 'ml' };
    }
    if (/^(l|Ｌ|l\.|リットル)$/i.test(unitText)) {
      return { quantity: String(n * 1000), unit: 'ml' };
    }

    // Weight to g
    if (/(g|グラム)$/i.test(unitText)) {
      return { quantity: String(n), unit: 'g' };
    }
    if (/(kg|キログラム)$/i.test(unitText)) {
      return { quantity: String(n * 1000), unit: 'g' };
    }
  }

  // If unit keywords appear but numeric couldn't be parsed, try to keep unit normalized
  if (/小さじ/.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/大さじ/.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/カップ/.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/(ml|ミリリットル|cc)/i.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/(g|グラム)$/i.test(unitText)) return { quantity: quantityText, unit: 'g' };
  if (/(kg|キログラム)$/i.test(unitText)) return { quantity: quantityText, unit: 'g' };

  return { quantity: quantityText, unit: unitText };
};

// 入力されている材料を取得する関数
const getExistingIngredients = () => {
  const ingredientRows = document.querySelectorAll('.ingredient-row');
  const ingredients = [];
  
  ingredientRows.forEach(row => {
    const itemInput = row.querySelector('.ing-item');
    if (itemInput && itemInput.value.trim() !== '') {
      ingredients.push(itemInput.value.trim());
    }
  });
  
  return ingredients;
};

const generateMenuSuggestions = async () => {
  const selectedGenreBtn = document.querySelector('.genre-btn.selected');
  if (!selectedGenreBtn) {
    alert('ジャンルを選択してください');
    return;
  }
  
  selectedGenre = selectedGenreBtn.dataset.genre;
  const customRequest = document.getElementById('ai-custom-request')?.value || '';
  
  // 入力されている材料を取得
  const existingIngredients = getExistingIngredients();
  let baseIngredient = '';
  
  // 材料が複数入力されている場合はそれを使用
  if (existingIngredients.length >= 2) {
    baseIngredient = `使用する材料: ${existingIngredients.join(', ')}`;
  } 
  // 材料が1つも入力されていない場合はポップアップで入力を求める
  else if (existingIngredients.length === 0) {
    baseIngredient = prompt('創作のベースにしたい材料を1つ入力してください（例: 鶏肉、トマト、じゃがいも）');
    if (!baseIngredient || baseIngredient.trim() === '') {
      alert('材料を入力してください');
      return;
    }
    baseIngredient = `メイン材料: ${baseIngredient.trim()}`;
  }
  // 材料が1つだけの場合はそれを使用
  else {
    baseIngredient = `メイン材料: ${existingIngredients[0]}`;
  }
  
  showAIStep('loading');
  
  try {
    const prompt = `${selectedGenre}料理のメニューを3つ提案してください。
${baseIngredient}
${customRequest ? `追加条件: ${customRequest}` : ''}
    
以下のJSON形式で回答してください：
{
  "suggestions": [
    {"name": "料理名1", "description": "簡単な説明"},
    {"name": "料理名2", "description": "簡単な説明"},
    {"name": "料理名3", "description": "簡単な説明"}
  ]
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${CONFIG.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) throw new Error('AI API エラー');

    const result = await response.json();
    const content = result.candidates[0].content.parts[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      displayMenuSuggestions(suggestions.suggestions);
      showAIStep(2);
    } else {
      throw new Error('提案の生成に失敗しました');
    }
  } catch (error) {
    alert('メニュー提案の生成に失敗しました: ' + error.message);
    showAIStep(1);
  }
};

const displayMenuSuggestions = (suggestions) => {
  const container = document.getElementById('menu-suggestions');
  container.innerHTML = suggestions.map((suggestion, index) => `
    <div class="menu-suggestion" data-index="${index}">
      <h4>${escapeHtml(suggestion.name)}</h4>
      <p>${escapeHtml(suggestion.description)}</p>
    </div>
  `).join('');
  
  // Add click handlers for menu selection
  container.querySelectorAll('.menu-suggestion').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.menu-suggestion').forEach(item => item.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('generate-full-recipe-btn').disabled = false;
    });
  });
};

const generateFullRecipe = async () => {
  const selectedMenu = document.querySelector('.menu-suggestion.selected');
  if (!selectedMenu) {
    alert('メニューを選択してください');
    return;
  }
  
  const menuName = selectedMenu.querySelector('h4').textContent;
  const existingIngredients = getExistingIngredients();
  
  // 既存の材料がある場合はそれを含める指示を追加
  let ingredientInstruction = '';
  if (existingIngredients.length > 0) {
    ingredientInstruction = `\n\n※必ず以下の材料を含めてレシピを作成してください: ${existingIngredients.join(', ')}`;
  }
  
  showAIStep('loading');
  
  try {
    const prompt = `「${menuName}」の詳細なレシピを作成してください。${ingredientInstruction}
    
以下の厳密なJSON形式で回答してください（他の文章は含めない）：
{
  "title": "${menuName}",
  "description": "レシピの説明",
  "servings": 2,
  "ingredients": [
    {"item": "玉ねぎ", "quantity": "1", "unit": "個"},
    {"item": "豚肉", "quantity": "200", "unit": "g"}
  ],
  "steps": ["手順1の説明", "手順2の説明"]
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${CONFIG.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) throw new Error('AI API エラー');

    const result = await response.json();
    const content = result.candidates[0].content.parts[0].text;
    console.log('Raw Gemini response:', content);
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      console.log('Extracted JSON:', jsonMatch[0]);
      aiGeneratedRecipe = JSON.parse(jsonMatch[0]);
      window.aiGeneratedRecipe = aiGeneratedRecipe;
      console.log('Parsed AI recipe:', aiGeneratedRecipe);
      displayRecipePreview(aiGeneratedRecipe);
      showAIStep(3);
    } else {
      console.error('No JSON found in response:', content);
      throw new Error('レシピの生成に失敗しました');
    }
  } catch (error) {
    alert('レシピ生成に失敗しました: ' + error.message);
    showAIStep(2);
  }
};

const displayRecipePreview = (recipe) => {
  const preview = document.getElementById('recipe-preview');
  const ingredientsList = recipe.ingredients.map(ing => 
    `${ing.item} ${ing.quantity}${ing.unit}`
  ).join('\n');
  
  const stepsList = recipe.steps.map((step, index) => 
    `${index + 1}. ${step}`
  ).join('\n');
  
  preview.textContent = `料理名: ${recipe.title}

説明: ${recipe.description}

人数: ${recipe.servings}人分

材料:
${ingredientsList}

作り方:
${stepsList}`;
};

const applyAIRecipeToForm = async () => {
  const recipe = aiGeneratedRecipe || window.aiGeneratedRecipe;
  if (!recipe) {
    console.error('No AI generated recipe available');
    return;
  }
  
  console.log('=== APPLYING AI RECIPE TO FORM ===');
  console.log('AI Generated Recipe:', recipe);
  
  // Fill form fields
  if (recipe.title) {
    document.getElementById('title').value = recipe.title;
    console.log('Set title:', recipe.title);
  }
  if (recipe.description) {
    document.getElementById('notes').value = recipe.description;
    console.log('Set description:', recipe.description);
  }
  if (recipe.servings) {
    document.getElementById('servings').value = recipe.servings;
    console.log('Set servings:', recipe.servings);
  }
  
  // Clear existing ingredients and steps
  console.log('Clearing existing content...');
  const ingredientsEditor = document.getElementById('ingredientsEditor');
  const stepsEditor = document.getElementById('stepsEditor');
  
  if (ingredientsEditor) {
    ingredientsEditor.innerHTML = '';
    console.log('Cleared ingredients editor');
  } else {
    console.error('ingredientsEditor element not found!');
  }
  
  if (stepsEditor) {
    stepsEditor.innerHTML = '';
    console.log('Cleared steps editor');  
  } else {
    console.error('stepsEditor element not found!');
  }
  
  // Add ingredients with detailed logging
  console.log('=== PROCESSING INGREDIENTS ===');
  console.log('AI Recipe Ingredients:', recipe.ingredients);
  console.log('Ingredients is array?', Array.isArray(recipe.ingredients));
  
  if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
    console.log(`Found ${recipe.ingredients.length} ingredients to add`);
    
    // Add ingredients one by one with proper async handling
    for (let i = 0; i < recipe.ingredients.length; i++) {
      const ing = recipe.ingredients[i];
      console.log(`\n--- Adding ingredient ${i + 1} ---`);
      console.log('Ingredient data:', ing);
      
      // Check if addIngredientRow function exists
      if (typeof addIngredientRow !== 'function') {
        console.error('addIngredientRow function not found!');
        break;
      }
      
      // Add new row
      console.log('Calling addIngredientRow()...');
      addIngredientRow();
      
      // Wait a bit for DOM update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get the newly added row (last one)
      const rows = document.querySelectorAll('.ingredient-row');
      console.log(`Total ingredient rows after adding: ${rows.length}`);
      const row = rows[rows.length - 1];
      
      if (row) {
        console.log('Found the new row, looking for input elements...');
        const itemInput = row.querySelector('.ing-item');
        const qtyInput = row.querySelector('.ing-qty');
        const unitInput = row.querySelector('.ing-unit');
        const priceInput = row.querySelector('.ing-price');
        
        console.log('Input elements found:', { 
          itemInput: !!itemInput, 
          qtyInput: !!qtyInput, 
          unitInput: !!unitInput,
          priceInput: !!priceInput
        });
        
        if (itemInput) {
          const value = ing.item || ing.ingredient || '';
          itemInput.value = value;
          console.log(`Set item input to: "${value}"`);
        } else {
          console.error('itemInput not found in row!');
        }
        
        // Normalize quantity & unit to ml/g where possible
        const normalized = normalizeQuantityUnit(ing.quantity || ing.amount || '', ing.unit || '');
        if (qtyInput) {
          qtyInput.value = normalized.quantity ?? '';
          console.log(`Set quantity input to: "${qtyInput.value}"`);
        }
        if (unitInput) {
          unitInput.value = normalized.unit ?? '';
          console.log(`Set unit input to: "${unitInput.value}"`);
        }
        
        if (priceInput) {
          priceInput.value = ''; // 単価はAIでは生成しないので空にする
          console.log('Cleared price input');
        }
        
        console.log(`✅ Successfully processed ingredient ${i + 1}`);
      } else {
        console.error(`❌ Could not find row for ingredient ${i + 1}`);
      }
    }
    
    console.log('=== INGREDIENTS PROCESSING COMPLETE ===');
  } else {
    console.log('No valid ingredients array found');
  }
  
  // Add steps
  if (recipe.steps) {
    recipe.steps.forEach(() => addStepRow());
    const stepRows = document.querySelectorAll('.step-row input[type="text"]');
    recipe.steps.forEach((step, index) => {
      if (stepRows[index]) {
        stepRows[index].value = step;
      }
    });
  }
  
  // Reset AI modal to step 1
  showAIStep(1);
};

const showAIStep = (step) => {
  // Hide all steps
  document.getElementById('ai-step-1').style.display = 'none';
  document.getElementById('ai-step-2').style.display = 'none';
  document.getElementById('ai-step-3').style.display = 'none';
  document.getElementById('ai-loading').style.display = 'none';
  
  // Show selected step
  if (step === 'loading') {
    document.getElementById('ai-loading').style.display = 'block';
  } else {
    document.getElementById(`ai-step-${step}`).style.display = 'block';
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  try {
    initializeApp();
    console.log('App initialized successfully');
  } catch (error) {
    console.error('Error initializing app:', error);
  }
});