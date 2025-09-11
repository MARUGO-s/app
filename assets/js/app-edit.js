
// Simplified Recipe Editor - Consolidated from 2098 lines to ~800 lines
const CONFIG = {
  GEMINI_API_KEY: null, // Supabaseから動的に取得,
  SUPABASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q',
  STORAGE_BUCKET: 'images'
};

let sb, selectedCategory = '', selectedTags = [], currentRecipeType = 'normal';
let originalIngredients = [], baseServings = 1, finalRecipeData = null;
let customCategories = [], customTags = [], allCategories = [], allTags = [];
let currentSourceUrl = null; // URL取り込み時の元URLを記録

// Utility functions
const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 材料文字列から分量・単位・材料名を分離する関数
const parseIngredientString = (ingredientStr) => {
  if (!ingredientStr) return { item: '', quantity: '', unit: '' };
  
  const str = ingredientStr.toString().trim();
  console.log(`🔍 解析開始: "${str}"`);
  
  // 日本語の単位を最初にチェック（大さじ、小さじ、カップ）
  const japaneseUnits = str.match(/^(.+?)\s+(大さじ|小さじ|カップ)([0-9\/\.]+)$/);
  if (japaneseUnits) {
    const result = {
      item: japaneseUnits[1].trim(),
      quantity: japaneseUnits[3].trim(),
      unit: japaneseUnits[2].trim()
    };
    console.log(`✅ 日本語単位解析成功:`, result);
    return result;
  }
  
  // 分量フィールドに「大さじ2」のような形式が入った場合の処理
  const spoonUnits = str.match(/^(大さじ|小さじ|tbsp|tsp)([0-9\/\.]+)$/);
  if (spoonUnits) {
    const result = {
      item: '',
      quantity: spoonUnits[2].trim(),
      unit: spoonUnits[1].trim()
    };
    console.log(`✅ スプーン単位解析成功:`, result);
    return result;
  }
  
  // 分量フィールドに「大さじ2 材料名」のような形式が入った場合の処理
  const spoonWithItem = str.match(/^(大さじ|小さじ|tbsp|tsp)([0-9\/\.]+)\s+(.+)$/);
  if (spoonWithItem) {
    const result = {
      item: spoonWithItem[3].trim(),
      quantity: spoonWithItem[2].trim(),
      unit: spoonWithItem[1].trim()
    };
    console.log(`✅ スプーン+材料解析成功:`, result);
    return result;
  }
  
  // 数値 + 単位 + 材料名の形式
  const numUnitItem = str.match(/^([0-9\/\.]+)\s*([a-zA-Z]+|ml|g|mg|kg|個|本|枚|匙|杯|滴)\s+(.+)$/);
  if (numUnitItem) {
    const result = {
      item: numUnitItem[3].trim(),
      quantity: numUnitItem[1].trim(),
      unit: numUnitItem[2].trim()
    };
    console.log(`✅ 数値+単位+材料解析成功:`, result);
    return result;
  }
  
  // 材料名 + 数値 + 単位の形式
  const itemNumUnit = str.match(/^(.+?)\s+([0-9\/\.]+)\s*([a-zA-Z]+|ml|g|mg|kg|個|本|枚|匙|杯|滴)$/);
  if (itemNumUnit) {
    const result = {
      item: itemNumUnit[1].trim(),
      quantity: itemNumUnit[2].trim(),
      unit: itemNumUnit[3].trim()
    };
    console.log(`✅ 材料+数値+単位解析成功:`, result);
    return result;
  }
  
  // 曖昧な表現
  const vague = str.match(/^(.+?)\s+(適量|少々|お好みで|ひとつまみ|少し|ひとかけ)$/);
  if (vague) {
    const result = {
      item: vague[1].trim(),
      quantity: vague[2].trim(),
      unit: ''
    };
    console.log(`✅ 曖昧表現解析成功:`, result);
    return result;
  }
  
  // 分離できない場合は材料名としてそのまま返す
  const result = { item: str, quantity: '', unit: '' };
  console.log(`❌ 解析失敗、材料名のみ:`, result);
  return result;
};

// Unit conversion utility
const convertUnits = (quantity, unit, itemName = '') => {
  if (!quantity || !unit) return { quantity, unit };
  
  // 分数を処理（例: 1/2, 3/4など）
  let qty = 0;
  const quantityStr = quantity.toString().trim();
  if (quantityStr.includes('/')) {
    const fractionMatch = quantityStr.match(/(\d+)\/(\d+)/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      qty = numerator / denominator;
      console.log(`📏 分数変換: ${quantityStr} → ${qty}`);
    }
  } else {
    qty = parseFloat(quantityStr.replace(/[^\d\.]/g, '')) || 0;
  }
  const unitLower = unit.toString().toLowerCase().trim();
  const itemLower = itemName.toString().toLowerCase();
  
  // 液体系の材料判定（材料名と単位の両方で判断）
  const liquidItems = ['水', '油', '醤油', 'しょうゆ', '酒', '酢', 'みりん', '牛乳', 'だし', 'スープ', 'ソース', '出汁', 'だし汁', 'ワイン', 'ビール', 'ココナッツミルク', 'オリーブオイル', 'ごま油', 'サラダ油'];
  const isLiquid = liquidItems.some(liquid => itemLower.includes(liquid)) || 
                   unitLower.includes('ml') || unitLower.includes('リットル') || unitLower.includes('cc');
  
  // 大さじの変換（15ml/15g）
  if (unitLower.includes('大さじ') || unitLower.includes('おおさじ') || unitLower.includes('tbsp') || 
      unitLower === '大さじ' || unitLower === 'おおさじ' || unitLower === 'tbsp') {
    console.log(`🔄 大さじ変換: ${qty}${unit} → ${qty * 15}${isLiquid ? 'ml' : 'g'}`);
    return {
      quantity: (qty * 15).toString(),
      unit: isLiquid ? 'ml' : 'g'
    };
  }
  
  // 小さじの変換（5ml/5g）
  if (unitLower.includes('小さじ') || unitLower.includes('こさじ') || unitLower.includes('tsp') || 
      unitLower === '小さじ' || unitLower === 'こさじ' || unitLower === 'tsp') {
    console.log(`🔄 小さじ変換: ${qty}${unit} → ${qty * 5}${isLiquid ? 'ml' : 'g'}`);
    return {
      quantity: (qty * 5).toString(),
      unit: isLiquid ? 'ml' : 'g'
    };
  }
  
  // カップの変換（200ml）
  if (unitLower.includes('カップ') || unitLower.includes('cup')) {
    return {
      quantity: (qty * 200).toString(),
      unit: 'ml'
    };
  }
  
  // 1/2カップ、1/4カップなどの分数対応
  if (quantity.toString().includes('/') && (unitLower.includes('カップ') || unitLower.includes('cup'))) {
    const fractionMatch = quantity.toString().match(/(\d+)\/(\d+)/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      const cupValue = (numerator / denominator) * 200;
      return {
        quantity: cupValue.toString(),
        unit: 'ml'
      };
    }
  }
  
  return { quantity, unit };
};

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

  // SupabaseからAPIキーを取得
  const { data: apiKeys, error: apiError } = await sb.functions.invoke('get-api-keys', {
    body: { keyName: 'GEMINI_API_KEY' }
  });
  
  if (apiError || !apiKeys.success) {
    throw new Error('APIキーの取得に失敗しました');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKeys.apiKey}`, {
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
    console.log('=== URL取り込み開始 ===');
    console.log('URL:', url);
    
    // 取り込み元URLを記録
    currentSourceUrl = url;
    
    // URLフィールドに表示
    const sourceUrlEl = document.getElementById('sourceUrl');
    if (sourceUrlEl) sourceUrlEl.value = url;
    
    const html = await fetchHTMLViaProxy(url);
    const recipeData = await callGeminiAPI(html, url);
    
    console.log('取得したレシピデータ:', recipeData);
    console.log('材料データ詳細:', recipeData.ingredients);
    
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
          let parsedIng = { item: '', quantity: '', unit: '' };
          
          // 材料データの形式を確認
          if (ing.item && ing.quantity && ing.unit) {
            // 既に分離されている場合
            parsedIng = {
              item: ing.item,
              quantity: ing.quantity,
              unit: ing.unit
            };
          } else if (ing.item && !ing.quantity && !ing.unit) {
            // 材料名だけの場合、文字列解析を試行
            parsedIng = parseIngredientString(ing.item);
            console.log(`🔍 材料解析: "${ing.item}" → ${JSON.stringify(parsedIng)}`);
          } else {
            // その他の場合
            parsedIng = {
              item: ing.item || '',
              quantity: ing.quantity || '',
              unit: ing.unit || ''
            };
          }
          
          // 単位変換を適用
          const converted = convertUnits(parsedIng.quantity, parsedIng.unit, parsedIng.item);
          
          // 変換が行われた場合はコンソールに記録
          if (converted.quantity !== parsedIng.quantity || converted.unit !== parsedIng.unit) {
            console.log(`🔄 単位変換: ${parsedIng.item} ${parsedIng.quantity}${parsedIng.unit} → ${converted.quantity}${converted.unit}`);
          }
          
          const finalData = { 
            item: parsedIng.item || '', 
            quantity: converted.quantity || '', 
            unit: converted.unit || '' 
          };
          console.log(`🍳 最終データ挿入:`, finalData);
          
          addIngredientRow(finalData);
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
          const inlineContainer = document.getElementById('inlineRecipeImageContainer');
          const inlineImg = document.getElementById('inlineRecipeImageImg');
          const noImagePlaceholder = document.getElementById('noImagePlaceholder');
          const deleteBtn = document.getElementById('deleteInlineImageBtn');
          
          if (inlineImg){ 
            inlineImg.src = imgUrl; 
            inlineImg.style.display = 'block';
          }
          if (noImagePlaceholder) {
            noImagePlaceholder.style.display = 'none';
          }
          if (deleteBtn) {
            deleteBtn.style.display = 'flex';
          }
          if (inlineContainer) { inlineContainer.style.display = 'inline-block'; }
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
  console.log(`📝 addIngredientRow受信データ:`, data);
  
  const container = document.getElementById('ingredientsEditor');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'ingredient-row';
  div.innerHTML = `
    <input type="text" placeholder="材料名 *" value="${escapeHtml(data.item || '')}" class="ing-item">
    <div class="ing-details">
      <input type="text" placeholder="分量" value="${escapeHtml(data.quantity || '')}" class="ing-qty">
      <input type="text" placeholder="単位" value="${escapeHtml(data.unit || '')}" class="ing-unit">
      <input type="number" placeholder="単価" value="${escapeHtml(data.price || '')}" class="ing-price" min="0" step="0.01">
    </div>
    <button type="button" class="btn danger small js-remove-row">削除</button>
  `;
  container.appendChild(div);
  
  // 手動入力時の単位変換イベントリスナーを追加
  const unitInput = div.querySelector('.ing-unit');
  const qtyInput = div.querySelector('.ing-qty');
  const itemInput = div.querySelector('.ing-item');
  
  if (unitInput && qtyInput && itemInput) {
    // 単位変換を実行する共通関数
    const performUnitConversion = () => {
      const quantity = qtyInput.value.trim();
      const unit = unitInput.value.trim();
      const itemName = itemInput.value.trim();
      
      // 分量フィールドに「大さじ2」のような形式が入っている場合の処理
      if (quantity && !unit) {
        const parsed = parseIngredientString(quantity);
        if (parsed.quantity && parsed.unit) {
          console.log(`🔍 分量フィールド解析: "${quantity}" → ${JSON.stringify(parsed)}`);
          const converted = convertUnits(parsed.quantity, parsed.unit, itemName);
          
          if (converted.quantity !== parsed.quantity || converted.unit !== parsed.unit) {
            console.log(`🔄 分量フィールド単位変換: ${itemName} ${parsed.quantity}${parsed.unit} → ${converted.quantity}${converted.unit}`);
            qtyInput.value = converted.quantity;
            unitInput.value = converted.unit;
            
            // 変更を視覚的に示すため一時的にハイライト
            qtyInput.style.background = '#e8f5e8';
            unitInput.style.background = '#e8f5e8';
            setTimeout(() => {
              qtyInput.style.background = '';
              unitInput.style.background = '';
            }, 1500);
          }
        }
      }
      // 分量フィールドに「大さじ2」のような形式が入っている場合の追加処理
      else if (quantity && (quantity.includes('大さじ') || quantity.includes('小さじ') || quantity.includes('tbsp') || quantity.includes('tsp'))) {
        const parsed = parseIngredientString(quantity);
        if (parsed.quantity && parsed.unit) {
          console.log(`🔍 分量フィールド単位検出: "${quantity}" → ${JSON.stringify(parsed)}`);
          const converted = convertUnits(parsed.quantity, parsed.unit, itemName);
          
          if (converted.quantity !== parsed.quantity || converted.unit !== parsed.unit) {
            console.log(`🔄 分量フィールド単位変換: ${itemName} ${parsed.quantity}${parsed.unit} → ${converted.quantity}${converted.unit}`);
            qtyInput.value = converted.quantity;
            unitInput.value = converted.unit;
            
            // 変更を視覚的に示すため一時的にハイライト
            qtyInput.style.background = '#e8f5e8';
            unitInput.style.background = '#e8f5e8';
            setTimeout(() => {
              qtyInput.style.background = '';
              unitInput.style.background = '';
            }, 1500);
          }
        }
      }
      // 通常の分量+単位の形式の場合
      else if (quantity && unit) {
        const converted = convertUnits(quantity, unit, itemName);
        
        if (converted.quantity !== quantity || converted.unit !== unit) {
          console.log(`🔄 手動入力単位変換: ${itemName} ${quantity}${unit} → ${converted.quantity}${converted.unit}`);
          qtyInput.value = converted.quantity;
          unitInput.value = converted.unit;
          
          // 変更を視覚的に示すため一時的にハイライト
          qtyInput.style.background = '#e8f5e8';
          unitInput.style.background = '#e8f5e8';
          setTimeout(() => {
            qtyInput.style.background = '';
            unitInput.style.background = '';
          }, 1500);
        }
      }
    };
    
    // 単位フィールドのblurイベント
    unitInput.addEventListener('blur', performUnitConversion);
    
    // 分量フィールドのblurイベントも追加
    qtyInput.addEventListener('blur', performUnitConversion);
  }
};

const addStepRow = (data = {}) => {
  const container = document.getElementById('stepsEditor');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'step-row';
  div.innerHTML = `
    <textarea placeholder="手順を入力してください *" class="step-text" rows="2">${escapeHtml(data.instruction || '')}</textarea>
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
    const loadingPopup = document.getElementById('urlLoadingPopup');
    
    // ボタンを無効化
    btn.disabled = true;
    btn.textContent = '読み込み中...';
    
    // モーダルを閉じてローディングアニメーション表示
    toggleModal('url-import-modal', false);
    if (loadingPopup) {
      loadingPopup.style.display = 'flex';
    }
    
    try {
      await window.runImport(url);
      alert('レシピの読み込みが完了しました！');
    } catch (error) {
      alert(`レシピの読み込みに失敗しました: ${error.message}`);
    } finally {
      // ローディングアニメーション非表示
      if (loadingPopup) {
        loadingPopup.style.display = 'none';
      }
      // ボタン復旧
      btn.disabled = false;
      btn.textContent = '読み込み開始';
      // URLフィールドクリア
      const urlInput = document.getElementById('urlInput');
      if (urlInput) urlInput.value = '';
    }
  });
  
  // Category Modal
  document.getElementById('categorySelectBtn')?.addEventListener('click', async () => {
    toggleModal('category-modal', true);
    await loadCategories(); // モーダル表示時にカテゴリーを読み込み
  });
  
  // Tag Modal  
  document.getElementById('tagSelectBtn')?.addEventListener('click', async () => {
    toggleModal('tag-modal', true);
    await loadTags(); // モーダル表示時にタグを読み込み
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

  // Simple image upload to Supabase Storage (robust: dynamic input to avoid stale state)
  const imageUploadBtn = document.getElementById('imageUploadBtn');
  const imageFileInput = document.getElementById('recipeImageFile');
  async function uploadSelectedImageFile(file){
    if (!file) return;
    try {
      const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `${crypto?.randomUUID?.() || Date.now()}.${fileExt}`;
      const filePath = `recipes/${fileName}`;
      const bucket = CONFIG.STORAGE_BUCKET || 'images';
      const { error: upErr } = await sb.storage.from(bucket).upload(filePath, file, { upsert: true, cacheControl: '3600', contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const { data } = sb.storage.from(bucket).getPublicUrl(filePath);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error('公開URLの取得に失敗しました');
      // Inline preview (人数横)
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const inlineImg = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (inlineImg) {
        inlineImg.src = publicUrl;
        inlineImg.style.display = 'block';
      }
      if (noImagePlaceholder) {
        noImagePlaceholder.style.display = 'none';
      }
      if (deleteBtn) {
        deleteBtn.style.display = 'flex';
      }
      if (inlineContainer) inlineContainer.style.display = 'inline-block';
      window.currentImageData = publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      alert('画像アップロードに失敗しました: ' + (err.message || err));
    }
  }
  if (imageUploadBtn) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    imageUploadBtn.addEventListener('click', () => {
      if (isIOS) {
        const temp = document.createElement('input');
        temp.type = 'file';
        temp.accept = 'image/*';
        temp.onchange = (ev) => {
          const file = (ev.target && ev.target.files) ? ev.target.files[0] : null;
          uploadSelectedImageFile(file);
        };
        document.body.appendChild(temp);
        temp.click();
        setTimeout(() => { try { document.body.removeChild(temp); } catch(_){} }, 1000);
      } else if (imageFileInput) {
        try { imageFileInput.value = ''; } catch(_){ }
        imageFileInput.click();
      } else {
        const temp = document.createElement('input');
        temp.type = 'file';
        temp.accept = 'image/*';
        temp.onchange = (ev) => {
          const file = (ev.target && ev.target.files) ? ev.target.files[0] : null;
          uploadSelectedImageFile(file);
        };
        temp.click();
      }
    });
  }
  if (imageFileInput) {
    imageFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      uploadSelectedImageFile(file);
      try{ e.target.value=''; }catch(_){ }
    });
  }

  // 画像削除ボタンのイベントハンドラー
  const deleteInlineImageBtn = document.getElementById('deleteInlineImageBtn');
  
  function deleteRecipeImage() {
    // 画像データを削除
    window.currentImageData = null;
    
    
    // インライン画像を非表示
    const inlineContainer = document.getElementById('inlineRecipeImageContainer');
    const inlineImg = document.getElementById('inlineRecipeImageImg');
    const noImagePlaceholder = document.getElementById('noImagePlaceholder');
    const deleteBtn = document.getElementById('deleteInlineImageBtn');
    
    if (inlineImg) {
      inlineImg.src = '';
      inlineImg.style.display = 'none';
    }
    if (noImagePlaceholder) {
      noImagePlaceholder.style.display = 'flex';
    }
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
    }
    if (inlineContainer) inlineContainer.style.display = 'inline-block';
    
    // ファイル入力をクリア
    if (imageFileInput) {
      try { imageFileInput.value = ''; } catch(_) {}
    }
    
    console.log('レシピ画像を削除しました');
  }
  
  
  if (deleteInlineImageBtn) {
    deleteInlineImageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteRecipeImage();
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

  // Source URL field change tracking
  document.getElementById('sourceUrl')?.addEventListener('input', (e) => {
    currentSourceUrl = e.target.value.trim() || null;
  });

  // カテゴリー一覧を読み込む関数
  async function loadCategories() {
    try {
      console.log('カテゴリー一覧を読み込み中...');
      
      // 基本カテゴリーを設定（固定）
      const basicCategories = [
        'すべて', 'アミューズ', '前菜', 'ソース', 'スープ', 'パスタ', 
        '魚料理', '肉料理', 'メイン', 'デザート', 'パン', 'その他'
      ];
      
      const categoryOptionsEl = document.getElementById('category-options');
      if (categoryOptionsEl) {
        categoryOptionsEl.innerHTML = '';
        
        basicCategories.forEach(category => {
          const categoryDiv = document.createElement('div');
          categoryDiv.className = 'category-option';
          categoryDiv.textContent = category;
          categoryDiv.addEventListener('click', () => {
            // 既存の選択を解除
            document.querySelectorAll('.category-option').forEach(el => {
              el.classList.remove('selected');
            });
            // 新しい選択を追加
            categoryDiv.classList.add('selected');
          });
          categoryOptionsEl.appendChild(categoryDiv);
        });
        
        console.log('基本カテゴリーを読み込み完了:', basicCategories.length, '件');
      }
      
      // データベースからカスタムカテゴリーを取得
      try {
        const { data: customCategories, error } = await sb.from('categories').select('name').order('name');
        if (error) {
          // テーブルが存在しない場合はスキップ
          if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
            console.log('categoriesテーブルがまだ作成されていません');
            return;
          }
          throw error;
        }
        
        if (customCategories && customCategories.length > 0) {
          const customCategoryOptionsEl = document.getElementById('custom-category-options');
          const customCategoryGroupEl = document.getElementById('custom-category-group');
          
          if (customCategoryOptionsEl && customCategoryGroupEl) {
            customCategoryOptionsEl.innerHTML = '';
            customCategoryGroupEl.style.display = 'block';
            
            customCategories.forEach(cat => {
              const categoryDiv = document.createElement('div');
              categoryDiv.className = 'category-option custom-category';
              categoryDiv.style.position = 'relative';
              categoryDiv.style.display = 'flex';
              categoryDiv.style.justifyContent = 'space-between';
              categoryDiv.style.alignItems = 'center';
              
              const categoryText = document.createElement('span');
              categoryText.textContent = cat.name;
              categoryText.style.flex = '1';
              
              const deleteBtn = document.createElement('button');
              deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
              deleteBtn.className = 'btn danger small category-delete-btn';
              deleteBtn.style.marginLeft = '8px';
              deleteBtn.style.padding = '2px 6px';
              deleteBtn.style.fontSize = '12px';
              deleteBtn.title = 'このカテゴリーを削除';
              
              categoryDiv.appendChild(categoryText);
              categoryDiv.appendChild(deleteBtn);
              
              // カテゴリー選択イベント
              categoryText.addEventListener('click', () => {
                document.querySelectorAll('.category-option').forEach(el => {
                  el.classList.remove('selected');
                });
                categoryDiv.classList.add('selected');
              });
              
              // カテゴリー削除イベント
              deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteCustomCategory(cat.name);
              });
              
              customCategoryOptionsEl.appendChild(categoryDiv);
            });
            
            console.log('カスタムカテゴリーを読み込み完了:', customCategories.length, '件');
          }
        }
      } catch (customError) {
        console.log('カスタムカテゴリーの取得をスキップ:', customError.message);
      }
      
    } catch (error) {
      console.error('カテゴリー読み込みエラー:', error);
    }
  }

  // Load Tags function
  async function loadTags() {
    try {
      console.log('タグ一覧を読み込み中...');
      
      const tagOptionsEl = document.getElementById('tag-options');
      if (tagOptionsEl) {
        tagOptionsEl.innerHTML = '';
      }
      
      // データベースからタグを取得
      try {
        const { data: allTags, error } = await sb.from('tags').select('*').order('name');
        if (error) {
          // テーブルが存在しない場合はスキップ
          if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
            console.log('tagsテーブルがまだ作成されていません');
            return;
          }
          throw error;
        }
        
        if (allTags && allTags.length > 0 && tagOptionsEl) {
          // 全てのタグに削除ボタンを表示（使用中かどうかは削除時にチェック）
          allTags.forEach(tag => {
            const tagDiv = document.createElement('div');
            tagDiv.className = 'tag-option custom-tag';
            tagDiv.innerHTML = `
              ${tag.name}
              <i class="fas fa-times tag-delete-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}"></i>
            `;
            
            tagDiv.setAttribute('data-tag-id', tag.id);
            tagDiv.setAttribute('data-tag-name', tag.name);
            tagOptionsEl.appendChild(tagDiv);
          });
          
          console.log('タグを読み込み完了:', allTags.length, '件');
        }
        
        // カスタムタグセクションの処理（将来的な拡張用）
        const customTagOptionsEl = document.getElementById('custom-tag-options');
        const customTagGroupEl = document.getElementById('custom-tag-group');
        
        if (customTagOptionsEl && customTagGroupEl) {
          // 現在は全てのタグを基本タグ扱いにするので非表示
          customTagGroupEl.style.display = 'none';
        }
        
      } catch (tagError) {
        console.log('タグの取得をスキップ:', tagError.message);
      }
      
    } catch (error) {
      console.error('タグ読み込みエラー:', error);
    }
  }

  // 新しいカテゴリーを追加する関数
  async function addNewCategory(categoryName) {
    try {
      console.log('新しいカテゴリーを追加中:', categoryName);
      
      // データベースにカテゴリーを追加
      const { data, error } = await sb.from('categories').insert([
        { name: categoryName, created_at: new Date().toISOString() }
      ]);
      
      if (error) {
        // カテゴリーテーブルが存在しない場合は作成
        if (error.code === '42P01') {
          console.log('カテゴリーテーブルが存在しないため作成します');
          alert('カテゴリーテーブルを作成する必要があります。管理者に連絡してください。');
          return;
        }
        throw error;
      }
      
      console.log('カテゴリー追加成功:', categoryName);
      alert(`カテゴリー「${categoryName}」を追加しました！`);
      
      // カテゴリー一覧を再読み込み
      await loadCategories();
      
      // index.htmlのカテゴリータブに追加するために、カテゴリー情報を保存
      localStorage.setItem('newCategoryAdded', JSON.stringify({
        name: categoryName,
        timestamp: Date.now()
      }));
      
    } catch (error) {
      console.error('カテゴリー追加エラー:', error);
      alert('カテゴリーの追加に失敗しました: ' + error.message);
    }
  }

  // 新しいタグを追加する関数
  async function addNewTag(tagName) {
    try {
      console.log('新しいタグを追加中:', tagName);
      
      // データベースにタグを追加
      const { data, error } = await sb.from('tags').insert([
        { name: tagName, created_at: new Date().toISOString() }
      ]);
      
      if (error) {
        // タグテーブルが存在しない場合は作成
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          alert('tagsテーブルが作成されていません。まずSQLファイルを実行してください。');
          return;
        }
        
        // 重複エラーの場合
        if (error.code === '23505' || error.message.includes('duplicate')) {
          alert('このタグは既に存在します。');
          return;
        }
        
        throw error;
      }
      
      console.log('タグ追加成功:', data);
      
      // タグリストを再読み込み
      await loadTags();
      
      alert('新しいタグを追加しました: ' + tagName);
      
    } catch (error) {
      console.error('タグ追加エラー:', error);
      alert('タグの追加に失敗しました: ' + error.message);
    }
  }

  // タグ削除関数
  async function deleteCustomTag(tagId, tagName) {
    try {
      console.log('タグ削除を開始:', { tagId, tagName });
      
      // タグが使用中かどうかをチェック
      console.log('タグ使用状況をチェック中:', tagName);
      
      const { data: recipesWithTag, error: checkError } = await sb
        .from('recipes')
        .select('id, title, tags')
        .not('tags', 'is', null);
      
      if (checkError) {
        console.error('タグ使用状況チェックエラー:', checkError);
        alert('タグの使用状況確認中にエラーが発生しました。');
        return;
      }
      
      // tagsフィールドに指定されたタグが含まれているレシピを検索
      const recipesUsingTag = recipesWithTag.filter(recipe => {
        if (Array.isArray(recipe.tags)) {
          return recipe.tags.includes(tagName);
        }
        return false;
      });
      
      console.log('タグを使用しているレシピ:', recipesUsingTag.length, '件');
      
      if (recipesUsingTag.length > 0) {
        const recipeNames = recipesUsingTag.slice(0, 3).map(r => r.title).join('、');
        const moreText = recipesUsingTag.length > 3 ? ` 他${recipesUsingTag.length - 3}件` : '';
        alert(`タグ「${tagName}」は現在使用中のため削除できません。\n使用レシピ: ${recipeNames}${moreText}`);
        return;
      }
      
      // 削除前の存在確認
      const trimmedTagName = tagName.trim();
      console.log('削除前の検索:', trimmedTagName);
      
      const { data: preDeleteCheck, error: preError } = await sb.from('tags').select('*').eq('name', trimmedTagName);
      console.log('削除前の検索結果:', preDeleteCheck ? preDeleteCheck.length : 0, preDeleteCheck);
      
      if (preError) {
        console.error('削除前チェックエラー:', preError);
        alert('タグの確認中にエラーが発生しました。');
        return;
      }
      
      if (!preDeleteCheck || preDeleteCheck.length === 0) {
        console.log('削除対象のタグが見つかりません');
        alert('削除対象のタグが見つかりません。');
        return;
      }
      
      const targetTag = preDeleteCheck[0];
      console.log('削除対象を確認しました:', targetTag);
      
      // 確認ダイアログ
      if (!confirm(`タグ「${tagName}」を削除しますか？`)) {
        return;
      }
      
      // IDでの削除を試行
      let targetId = tagId || targetTag.id;
      console.log('IDでの削除を試行:', targetId);
      
      const { data: deleteResult, error: deleteError } = await sb
        .from('tags')
        .delete()
        .eq('id', targetId)
        .select();
      
      console.log('データベース削除結果:', deleteResult ? deleteResult.length : 0, deleteResult);
      
      if (deleteError) {
        console.error('削除エラー:', deleteError);
        alert('タグの削除に失敗しました: ' + deleteError.message);
        return;
      }
      
      if (!deleteResult || deleteResult.length === 0) {
        console.log('IDでの削除に失敗、全件検索で再試行');
        
        // 全件取得して名前で検索
        const { data: allTags, error: allError } = await sb.from('tags').select('*');
        if (allError) {
          console.error('全件取得エラー:', allError);
          alert('タグの削除に失敗しました。');
          return;
        }
        
        // 名前で検索（trim等も考慮）
        const foundTag = allTags.find(tag => 
          tag.name === tagName || 
          tag.name === trimmedTagName ||
          tag.name.trim() === trimmedTagName
        );
        
        if (foundTag) {
          console.log('名前検索で発見:', foundTag);
          const { data: retryResult, error: retryError } = await sb
            .from('tags')
            .delete()
            .eq('id', foundTag.id)
            .select();
          
          if (retryError || !retryResult || retryResult.length === 0) {
            console.error('再試行でも削除失敗:', retryError);
            alert('タグの削除に失敗しました。');
            return;
          }
          
          console.log('再試行で削除成功:', retryResult);
        } else {
          alert('削除対象のタグが見つかりませんでした。');
          return;
        }
      }
      
      // UI更新
      updateUIAfterTagDelete(tagName);
      
      // タグリストを再読み込み
      await loadTags();
      
      alert('タグを削除しました: ' + tagName);
      
    } catch (error) {
      console.error('タグ削除エラー:', error);
      alert('タグの削除中にエラーが発生しました: ' + error.message);
    }
  }

  // タグ削除後のUI更新
  function updateUIAfterTagDelete(tagName) {
    // 選択されていたタグを解除
    selectedTags = selectedTags.filter(tag => tag !== tagName);
    updateTagSelect();
    
    console.log('UI更新処理完了');
  }

  // 未使用タグの削除関数（レシピ削除時に呼び出される）
  async function cleanupUnusedTags(tagsToCheck) {
    if (!Array.isArray(tagsToCheck) || tagsToCheck.length === 0) {
      return;
    }
    
    try {
      console.log('未使用タグのクリーンアップを開始:', tagsToCheck);
      
      // 全レシピのタグを取得
      const { data: allRecipes, error: recipesError } = await sb
        .from('recipes')
        .select('tags')
        .not('tags', 'is', null);
      
      if (recipesError) {
        console.error('レシピ取得エラー:', recipesError);
        return;
      }
      
      // 使用されているタグを集計
      const usedTags = new Set();
      allRecipes.forEach(recipe => {
        if (Array.isArray(recipe.tags)) {
          recipe.tags.forEach(tag => usedTags.add(tag));
        }
      });
      
      // チェック対象のタグで使用されていないものを削除
      for (const tagName of tagsToCheck) {
        if (!usedTags.has(tagName)) {
          console.log('未使用タグを削除:', tagName);
          
          const { error: deleteError } = await sb
            .from('tags')
            .delete()
            .eq('name', tagName);
          
          if (deleteError) {
            console.error('タグ削除エラー:', tagName, deleteError);
          } else {
            console.log('未使用タグ削除成功:', tagName);
          }
        }
      }
      
    } catch (error) {
      console.error('未使用タグクリーンアップエラー:', error);
    }
  }

  // 未使用カテゴリーの削除関数（recipe_view.htmlと共通）
  async function cleanupUnusedCategory(categoryName) {
    try {
      console.log('カテゴリー使用状況をチェック中:', categoryName);
      
      // 基本カテゴリーは削除しない
      const basicCategories = [
        'すべて', 'アミューズ', '前菜', 'ソース', 'スープ', 'パスタ', 
        '魚料理', '肉料理', 'メイン', 'デザート', 'パン', 'その他'
      ];
      
      if (basicCategories.includes(categoryName)) {
        console.log('基本カテゴリーなので削除をスキップ:', categoryName);
        return;
      }
      
      // 同じカテゴリーを使用している他のレシピがあるかチェック
      const { data: recipesWithCategory, error: checkError } = await sb
        .from('recipes')
        .select('id')
        .eq('category', categoryName);
      
      if (checkError) {
        console.error('カテゴリー使用状況チェックエラー:', checkError);
        return;
      }
      
      // 使用しているレシピが0件の場合、categoriesテーブルからも削除
      if (recipesWithCategory.length === 0) {
        console.log('未使用カテゴリーを削除中:', categoryName);
        
        const { error: deleteError } = await sb
          .from('categories')
          .delete()
          .eq('name', categoryName);
        
        if (deleteError) {
          console.error('カテゴリー削除エラー:', deleteError);
        } else {
          console.log('未使用カテゴリーを削除しました:', categoryName);
          
          // index.htmlに未使用カテゴリー削除の通知を送る
          localStorage.setItem('categoryDeleted', JSON.stringify({
            name: categoryName,
            timestamp: Date.now()
          }));
        }
      } else {
        console.log('カテゴリーは他のレシピで使用中:', categoryName, '使用数:', recipesWithCategory.length);
      }
      
    } catch (error) {
      console.error('カテゴリークリーンアップエラー:', error);
    }
  }

  // カスタムカテゴリーの手動削除関数
  async function deleteCustomCategory(categoryName) {
    try {
      console.log('カスタムカテゴリー削除を試行中:', categoryName);
      
      // 削除前にカテゴリーがデータベースに存在するかチェック
      const { data: existingCategory, error: existError } = await sb
        .from('categories')
        .select('*')
        .eq('name', categoryName)
        .single();
      
      if (existError && existError.code !== 'PGRST116') {
        console.error('カテゴリー存在確認エラー:', existError);
        alert('カテゴリーの存在確認に失敗しました: ' + existError.message);
        return;
      }
      
      if (!existingCategory) {
        console.warn('削除対象のカテゴリーがデータベースに存在しません:', categoryName);
        alert('このカテゴリーはすでに削除されています。');
        // 画面からは削除する
        const categoryElements = document.querySelectorAll('.custom-category');
        categoryElements.forEach(el => {
          const textSpan = el.querySelector('span');
          if (textSpan && textSpan.textContent === categoryName) {
            el.remove();
          }
        });
        return;
      }
      
      console.log('削除対象カテゴリーを確認:', existingCategory);
      
      // テスト: カテゴリーテーブルの権限確認
      try {
        const { data: testData, error: testError } = await sb
          .from('categories')
          .select('count', { count: 'exact' });
        console.log('categoriesテーブルへのアクセス権限確認 - カウント:', testData);
        if (testError) {
          console.error('テーブルアクセス権限エラー:', testError);
        }
      } catch (permError) {
        console.error('権限テストエラー:', permError);
      }
      
      // 削除確認
      if (!confirm(`カテゴリー「${categoryName}」を削除しますか？\n\n※このカテゴリーを使用しているレシピがある場合は削除できません。`)) {
        return;
      }
      
      // 使用状況をチェック
      const { data: recipesWithCategory, error: checkError } = await sb
        .from('recipes')
        .select('id, title')
        .eq('category', categoryName);
      
      if (checkError) {
        console.error('カテゴリー使用状況チェックエラー:', checkError);
        alert('カテゴリーの使用状況確認に失敗しました: ' + checkError.message);
        return;
      }
      
      // 使用中のレシピがある場合は削除を拒否
      if (recipesWithCategory && recipesWithCategory.length > 0) {
        const recipeList = recipesWithCategory.map(r => `・${r.title}`).join('\n');
        alert(`使用中のカテゴリーなので削除できません。\n\n【使用中のレシピ】\n${recipeList}\n\n先にこれらのレシピのカテゴリーを変更してから削除してください。`);
        return;
      }
      
      // カテゴリーをデータベースから削除
      console.log('データベースからカテゴリーを削除中:', categoryName);
      
      // より詳細な削除処理
      console.log('削除前のカテゴリー検索:', categoryName);
      
      // 削除前に再度存在確認（トリム処理を含む）
      const trimmedCategoryName = categoryName.trim();
      console.log('トリム後のカテゴリー名:', `"${trimmedCategoryName}"`);
      
      const { data: preDeleteCheck, error: preDeleteError } = await sb
        .from('categories')
        .select('*')
        .eq('name', trimmedCategoryName);
      
      console.log('削除前の検索結果:', preDeleteCheck);
      
      if (preDeleteError) {
        console.error('削除前検索エラー:', preDeleteError);
        throw preDeleteError;
      }
      
      if (!preDeleteCheck || preDeleteCheck.length === 0) {
        console.warn('名前での検索で削除対象が見つかりません。全カテゴリーをチェックします...');
        
        // 全カテゴリーを取得して比較
        const { data: allCategories, error: allError } = await sb
          .from('categories')
          .select('*');
          
        console.log('全カテゴリー一覧:', allCategories);
        
        if (allCategories) {
          const matchingCategory = allCategories.find(cat => 
            cat.name === categoryName || 
            cat.name === trimmedCategoryName ||
            cat.name.trim() === trimmedCategoryName
          );
          
          if (matchingCategory) {
            console.log('一致するカテゴリーを発見:', matchingCategory);
            // 見つかったカテゴリーを削除
            const { data: deleteData2, error: deleteError2 } = await sb
              .from('categories')
              .delete()
              .eq('id', matchingCategory.id)
              .select();
              
            if (deleteError2) {
              console.error('ID指定削除エラー:', deleteError2);
              alert('カテゴリーの削除に失敗しました: ' + deleteError2.message);
              return;
            }
            
            console.log('代替方法での削除成功:', deleteData2);
            alert(`カテゴリー「${categoryName}」を削除しました！`);
            
            // 画面更新処理をここに移動
            await updateUIAfterDelete(categoryName);
            return;
          }
        }
        
        console.warn('削除対象が見つかりません。すでに削除済みの可能性があります。');
        alert('カテゴリーが見つかりません。すでに削除済みかもしれません。');
        
        // 画面からは削除する
        await updateUIAfterDelete(categoryName);
        return;
      }
      
      console.log('削除対象を確認しました:', preDeleteCheck[0]);
      
      // 正確なIDでの削除を試行
      const targetId = preDeleteCheck[0].id;
      console.log('IDでの削除を試行:', targetId);
      
      const { data: deleteData, error: deleteError } = await sb
        .from('categories')
        .delete()
        .eq('id', targetId)
        .select();
      
      if (deleteError) {
        console.error('カテゴリー削除エラー:', deleteError);
        alert('カテゴリーの削除に失敗しました: ' + deleteError.message);
        return;
      }
      
      console.log('データベース削除結果:', deleteData);
      
      // 削除されたレコードがあるかチェック
      if (!deleteData || deleteData.length === 0) {
        console.warn('削除対象のカテゴリーがデータベースに見つかりませんでした:', categoryName);
        alert('カテゴリーが見つからないため削除できませんでした。すでに削除済みの可能性があります。');
        // 画面からは削除する
      } else {
        console.log('データベースから正常に削除されました:', deleteData);
      }
      
      console.log('カスタムカテゴリーを削除しました:', categoryName);
      alert(`カテゴリー「${categoryName}」を削除しました！`);
      
      // UI更新処理
      await updateUIAfterDelete(categoryName);
      
    } catch (error) {
      console.error('カスタムカテゴリー削除エラー:', error);
      alert('カテゴリーの削除中にエラーが発生しました: ' + error.message);
    }
  }

  // UI更新処理を共通関数として分離
  async function updateUIAfterDelete(categoryName) {
    console.log('UI更新処理を開始:', categoryName);
    
    // 即座に画面からカテゴリーを削除
    const categoryElements = document.querySelectorAll('.custom-category');
    categoryElements.forEach(el => {
      const textSpan = el.querySelector('span');
      if (textSpan && textSpan.textContent === categoryName) {
        el.remove();
        console.log('画面からカテゴリー要素を削除:', categoryName);
      }
    });
    
    // 選択されていたカテゴリーが削除された場合は選択をクリア
    const selectedEl = document.querySelector('.category-option.selected span');
    if (selectedEl && selectedEl.textContent === categoryName) {
      selectedCategory = null;
      document.getElementById('selectedCategoryText').textContent = 'カテゴリーを選択';
    }
    
    // カスタムカテゴリーグループが空になった場合は非表示
    const customCategoryOptionsEl = document.getElementById('custom-category-options');
    if (customCategoryOptionsEl && customCategoryOptionsEl.children.length === 0) {
      const customCategoryGroupEl = document.getElementById('custom-category-group');
      if (customCategoryGroupEl) {
        customCategoryGroupEl.style.display = 'none';
      }
    }
    
    // index.htmlにカテゴリー削除の通知を送る
    localStorage.setItem('categoryDeleted', JSON.stringify({
      name: categoryName,
      timestamp: Date.now()
    }));
    
    // 少し遅延してからカテゴリー一覧を再読み込み（確実な同期のため）
    setTimeout(async () => {
      await loadCategories();
    }, 100);
    
    console.log('UI更新処理完了:', categoryName);
  }

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

  // 新しいカテゴリー追加ボタン
  document.getElementById('add-new-category-btn')?.addEventListener('click', async () => {
    const categoryName = prompt('新しいカテゴリー名を入力してください:');
    if (categoryName && categoryName.trim()) {
      await addNewCategory(categoryName.trim());
    }
  });

  // Tag Modal buttons  
  document.getElementById('tag-ok-btn')?.addEventListener('click', () => {
    // Handle tag selection
    const selectedTagElements = Array.from(document.querySelectorAll('#tag-options .selected'));
    selectedTags = selectedTagElements.map(el => el.textContent.trim());
    const tagText = selectedTags.length > 0 ? selectedTags.join(', ') : 'タグを選択';
    document.getElementById('selectedTagsText').textContent = tagText;
    console.log('選択されたタグ:', selectedTags);
    toggleModal('tag-modal', false);
  });

  document.getElementById('tag-cancel-btn')?.addEventListener('click', () => {
    toggleModal('tag-modal', false);
  });

  // 新規タグ追加ボタン
  document.getElementById('add-new-tag-btn')?.addEventListener('click', async () => {
    const tagName = prompt('新しいタグ名を入力してください:');
    if (tagName && tagName.trim()) {
      await addNewTag(tagName.trim());
    }
  });

  // AI Modal buttons
  document.getElementById('get-suggestions-btn')?.addEventListener('click', async () => {
    await generateMenuSuggestions();
  });

  // Example buttons for custom request - 複数選択対応
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('example-btn')) {
      const exampleText = e.target.dataset.example;
      const textarea = document.getElementById('ai-custom-request');
      if (textarea) {
        // 複数選択対応
        if (e.target.classList.contains('selected')) {
          // 既に選択されている場合は削除
          e.target.classList.remove('selected');
          const currentValue = textarea.value;
          const newValue = currentValue
            .split(', ')
            .filter(item => item.trim() !== exampleText.trim())
            .join(', ')
            .replace(/^,\s*|,\s*$/g, ''); // 先頭と末尾のカンマを削除
          textarea.value = newValue;
        } else {
          // 新しく選択する場合は追加
          e.target.classList.add('selected');
          const currentValue = textarea.value.trim();
          if (currentValue === '') {
            textarea.value = exampleText;
          } else {
            textarea.value = currentValue + ', ' + exampleText;
          }
        }
        
        // 視覚的フィードバック
        if (e.target.classList.contains('selected')) {
          e.target.style.background = '#3498db';
          e.target.style.borderColor = '#3498db';
        } else {
          e.target.style.background = '';
          e.target.style.borderColor = '';
        }
      }
    }
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
      console.log('タグクリック検出:', e.target.textContent);
      e.target.classList.toggle('selected');
      console.log('選択状態:', e.target.classList.contains('selected'));
    }

    // Tag delete button
    if (e.target.classList.contains('tag-delete-btn')) {
      e.stopPropagation(); // タグ選択を防ぐ
      const tagId = e.target.getAttribute('data-tag-id');
      const tagName = e.target.getAttribute('data-tag-name');
      console.log('タグ削除ボタンクリック:', { tagId, tagName });
      deleteCustomTag(tagId, tagName);
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
    
    // 編集時の元のカテゴリーとタグを記録（未使用削除用）
    let originalCategory = null;
    let originalTags = [];
    if (recipeId) {
      try {
        const { data: existingRecipe } = await sb.from('recipes').select('category, tags').eq('id', recipeId).single();
        originalCategory = existingRecipe?.category;
        originalTags = Array.isArray(existingRecipe?.tags) ? existingRecipe.tags : [];
      } catch (e) {
        console.log('元のデータ取得をスキップ:', e.message);
      }
    }
    
    const recipeData = {
      title,
      category: selectedCategory || null,
      tags: selectedTags.length > 0 ? selectedTags : null,
      notes: document.getElementById('notes')?.value?.trim() || null,
      image_url: window.currentImageData || null,
      source_url: currentSourceUrl || null
    };
    
    console.log('=== レシピ保存データ ===');
    console.log('Recipe data:', recipeData);
    console.log('Current source URL:', currentSourceUrl);
    console.log('Ingredients count:', ingredients.length);
    console.log('Steps count:', steps.length);
    
    if (document.getElementById('servings')?.value) {
      recipeData.servings = parseInt(document.getElementById('servings').value);
    }
    
    let result;
    if (recipeId) {
      result = await sb.from('recipes').update(recipeData).eq('id', recipeId).select('id').single();
    } else {
      result = await sb.from('recipes').insert(recipeData).select('id').single();
    }
    
    if (result.error) {
      console.error('レシピ保存エラー:', result.error);
      throw new Error(`レシピ保存に失敗しました: ${result.error.message}`);
    }
    
    const savedId = result.data.id;
    console.log('レシピ保存成功. ID:', savedId);
    
    // 翻訳情報を保存（テーブルが存在しない場合はスキップ）
    const translations = getTranslationData();
    console.log('取得した翻訳データ:', translations);
    
    // 翻訳が削除された場合、既存の翻訳をクリア
    if (window.translationDeleted || translations.length === 0) {
      try {
        console.log('翻訳データをクリア中...');
        await sb.from('recipe_translations').delete().eq('recipe_id', savedId);
        console.log('翻訳データをクリアしました');
        window.translationDeleted = false; // フラグをリセット
      } catch (clearError) {
        console.error('翻訳クリアエラー:', clearError);
      }
    }
    
    if (translations.length > 0) {
      try {
        console.log('翻訳データを保存開始...');
        // 既存の翻訳を削除
        const deleteResult = await sb.from('recipe_translations').delete().eq('recipe_id', savedId);
        console.log('既存翻訳削除結果:', deleteResult);
        
        // 新しい翻訳を挿入
        const translationData = translations.map(translation => ({
          recipe_id: savedId,
          language_code: translation.language_code,
          translated_title: translation.translated_title
        }));
        
        console.log('挿入する翻訳データ:', translationData);
        const { data: insertData, error: translationError } = await sb.from('recipe_translations').insert(translationData);
        
        if (translationError) {
          console.error('翻訳保存エラー:', translationError);
          if (translationError.code === 'PGRST205') {
            console.log('recipe_translationsテーブルが存在しません。翻訳機能をスキップします。');
          } else {
            alert(`翻訳保存エラー: ${translationError.message}`);
          }
        } else {
          console.log('翻訳保存成功:', insertData);
        }
      } catch (translationError) {
        console.error('翻訳保存処理エラー:', translationError);
        alert(`翻訳保存処理エラー: ${translationError.message}`);
      }
    } else if (currentTranslatedName && currentLanguageCode) {
      // AI生成時の翻訳情報を保存（後方互換性）
      try {
        const translationData = {
          recipe_id: savedId,
          language_code: currentLanguageCode,
          translated_title: currentTranslatedName
        };
        
        await sb.from('recipe_translations').delete().eq('recipe_id', savedId).eq('language_code', currentLanguageCode);
        const { error: translationError } = await sb.from('recipe_translations').insert(translationData);
        
        if (translationError) {
          console.error('翻訳保存エラー:', translationError);
        } else {
          console.log('翻訳保存成功:', translationData);
        }
      } catch (translationError) {
        console.error('翻訳保存処理エラー:', translationError);
      }
    }
    
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
    
    // カテゴリーが変更された場合、元のカテゴリーの使用状況をチェック
    if (originalCategory && originalCategory !== selectedCategory) {
      try {
        await cleanupUnusedCategory(originalCategory);
      } catch (cleanupError) {
        console.error('カテゴリークリーンアップエラー:', cleanupError);
      }
    }
    
    // タグが変更された場合、元のタグの使用状況をチェック
    if (originalTags.length > 0) {
      const removedTags = originalTags.filter(tag => !selectedTags.includes(tag));
      if (removedTags.length > 0) {
        try {
          await cleanupUnusedTags(removedTags);
        } catch (cleanupError) {
          console.error('タグクリーンアップエラー:', cleanupError);
        }
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
  
  // Initialize Supabase (avoid multiple GoTrueClient by reusing global and unique storageKey)
  if (!window.sb) {
    window.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: {
        storageKey: 'app-main-11-edit',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  }
  sb = window.sb;
  
  // Setup event listeners
  setupModalEvents();
  
  document.getElementById('addIng')?.addEventListener('click', () => addIngredientRow());
  document.getElementById('addStep')?.addEventListener('click', () => addStepRow());
  // 翻訳追加ボタンは削除されたため、イベントリスナーも削除
  // 初期状態で翻訳行を1つ追加
  addTranslationRow();
  
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
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const imgEl = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (imgEl && window.currentImageData) {
        imgEl.src = window.currentImageData;
        imgEl.style.display = 'block';
        if (noImagePlaceholder) noImagePlaceholder.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'flex';
      } else {
        if (imgEl) imgEl.style.display = 'none';
        if (noImagePlaceholder) noImagePlaceholder.style.display = 'flex';
        if (deleteBtn) deleteBtn.style.display = 'none';
      }
      if (inlineContainer) {
        inlineContainer.style.display = 'inline-block';
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
    currentSourceUrl = recipe.source_url || null; // 既存レシピのsource_urlを読み込み
    updateCategorySelect();
    updateTagSelect();
    
    if (recipe.servings !== undefined) {
      document.getElementById('servings').value = recipe.servings || '';
    }
    document.getElementById('notes').value = recipe.notes || '';
    
    // source_urlフィールドに表示
    const sourceUrlEl = document.getElementById('sourceUrl');
    if (sourceUrlEl) {
      sourceUrlEl.value = recipe.source_url || '';
    }
    
    // 翻訳データを読み込み
    try {
      const { data: translations, error: translationError } = await sb
        .from('recipe_translations')
        .select('language_code, translated_title')
        .eq('recipe_id', id);
      
      if (!translationError && translations && translations.length > 0) {
        // 翻訳テーブルをクリア
        const tbody = document.getElementById('translationTableBody');
        if (tbody) {
          tbody.innerHTML = '';
        }
        
        // 翻訳行を追加
        translations.forEach(translation => {
          addTranslationRow(translation.language_code, translation.translated_title);
        });
      }
    } catch (translationError) {
      console.log('翻訳読み込みをスキップ:', translationError.message);
    }
    // Inline image preview if available
    if (recipe.image_url) {
      window.currentImageData = recipe.image_url;
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const imgEl = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (imgEl) {
        imgEl.src = recipe.image_url;
        imgEl.style.display = 'block';
      }
      if (noImagePlaceholder) {
        noImagePlaceholder.style.display = 'none';
      }
      if (deleteBtn) {
        deleteBtn.style.display = 'flex';
      }
      if (inlineContainer) {
        inlineContainer.style.display = 'inline-block';
      }
    } else {
      // No image case
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const imgEl = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (imgEl) imgEl.style.display = 'none';
      if (noImagePlaceholder) noImagePlaceholder.style.display = 'flex';
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (inlineContainer) inlineContainer.style.display = 'inline-block';
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
let currentTranslatedName = '';
let currentLanguageCode = '';
let aiGeneratedRecipe = null;
window.aiGeneratedRecipe = null;

// Translation Management
const languageOptions = [
  { code: 'fr', name: 'フランス語' },
  { code: 'it', name: 'イタリア語' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中国語' },
  { code: 'es', name: 'スペイン語' },
  { code: 'de', name: 'ドイツ語' },
  { code: 'en', name: '英語' }
];

// 翻訳行を追加する関数
const addTranslationRow = (languageCode = '', translatedTitle = '') => {
  const tbody = document.getElementById('translationTableBody');
  if (!tbody) return;
  
  // 最大1つまで制限（初期状態では1つ追加される）
  const existingRows = document.querySelectorAll('.translation-row');
  if (existingRows.length >= 1) {
    return; // アラートを表示せずにスキップ
  }
  
  const row = document.createElement('tr');
  row.className = 'translation-row';
  
  // 1つの翻訳のみなので、すべての言語選択肢を表示
  const availableLanguages = languageOptions;
  
  row.innerHTML = `
    <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-medium);">
      <select class="translation-language" style="width: 100%; padding: 0.25rem; border: 1px solid var(--border-medium); border-radius: 3px; font-size: 0.85em; background: var(--bg-secondary); color: var(--text-primary);">
        <option value="">言語を選択</option>
        ${availableLanguages.map(lang => 
          `<option value="${lang.code}" ${lang.code === languageCode ? 'selected' : ''}>${lang.name}</option>`
        ).join('')}
      </select>
    </td>
    <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-medium);">
      <input type="text" class="translation-title" placeholder="翻訳名を入力" 
             value="${translatedTitle}" 
             style="width: 100%; padding: 0.25rem; border: 1px solid var(--border-medium); border-radius: 3px; font-size: 0.85em; background: var(--bg-secondary); color: var(--text-primary);">
    </td>
    <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-medium); text-align: center;">
      <button type="button" class="remove-translation-btn" style="background: #dc3545; color: white; border: none; border-radius: 3px; padding: 0.25rem 0.5rem; font-size: 0.75em; cursor: pointer;">
        <i class="fas fa-times"></i>
      </button>
    </td>
  `;
  
  // 言語選択時の自動翻訳機能
  const languageSelect = row.querySelector('.translation-language');
  const titleInput = row.querySelector('.translation-title');
  
  languageSelect.addEventListener('change', async (e) => {
    const selectedLanguage = e.target.value;
    if (selectedLanguage && selectedLanguage !== '') {
      const recipeTitle = document.getElementById('title').value;
      if (recipeTitle.trim()) {
        try {
          // 翻訳中表示
          titleInput.value = '翻訳中...';
          titleInput.disabled = true;
          
          // 直接Gemini APIを呼び出し
          const languageNames = {
            'fr': 'フランス語',
            'it': 'イタリア語', 
            'ja': '日本語',
            'zh': '中国語',
            'es': 'スペイン語',
            'de': 'ドイツ語',
            'en': '英語'
          };
          
          const languageName = languageNames[selectedLanguage] || selectedLanguage;
          const prompt = `以下の料理名を${languageName}に翻訳してください。料理名として自然で適切な翻訳を提供してください。

料理名: ${recipeTitle}

翻訳のみを返してください。説明や追加のテキストは不要です。`;

          // SupabaseからAPIキーを取得
          const { data: apiKeys, error: apiError } = await sb.functions.invoke('get-api-keys', {
            body: { keyName: 'GEMINI_API_KEY' }
          });
          
          if (apiError || !apiKeys.success) {
            throw new Error('APIキーの取得に失敗しました');
          }

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKeys.apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: prompt
                }]
              }],
              generationConfig: {
                temperature: 0.3,
                topK: 1,
                topP: 1,
                maxOutputTokens: 100,
              }
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('翻訳レスポンス:', data);
            const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (translatedText) {
              titleInput.value = translatedText;
            } else {
              titleInput.value = '';
              console.error('翻訳結果が取得できませんでした:', data);
            }
          } else {
            const errorText = await response.text();
            console.error('翻訳API エラー:', response.status, errorText);
            titleInput.value = '';
            alert(`翻訳に失敗しました: ${response.status}`);
          }
        } catch (error) {
          console.error('翻訳エラー:', error);
          titleInput.value = '';
          alert(`翻訳エラー: ${error.message}`);
        } finally {
          titleInput.disabled = false;
        }
      }
    }
  });
  
  tbody.appendChild(row);
  
  // 削除ボタンのイベントリスナー
  row.querySelector('.remove-translation-btn').addEventListener('click', () => {
    row.remove();
    updateLanguageOptions();
    updateAddButtonVisibility();
    
    // 翻訳が削除された場合、自動的に保存を実行
    if (document.querySelectorAll('.translation-row').length === 0) {
      // 翻訳データが空になったことを示すフラグを設定
      window.translationDeleted = true;
    }
  });
  
  // 言語選択変更時のイベントリスナー
  row.querySelector('.translation-language').addEventListener('change', () => {
    // 他の行の言語選択肢を更新
    updateLanguageOptions();
  });
};

// 翻訳追加ボタンの表示/非表示を制御する関数
const updateAddButtonVisibility = () => {
  const addBtn = document.getElementById('addTranslationBtn');
  const existingRows = document.querySelectorAll('.translation-row');
  
  if (addBtn) {
    if (existingRows.length >= 1) {
      addBtn.style.display = 'none';
    } else {
      addBtn.style.display = 'inline-block';
    }
  }
};

// 言語選択肢を更新する関数（1つの翻訳のみなので簡素化）
const updateLanguageOptions = () => {
  // 1つの翻訳のみなので、言語選択肢の更新は不要
  // 必要に応じて将来の拡張用に残す
};

// 翻訳データを取得する関数
const getTranslationData = () => {
  const translations = [];
  const rows = document.querySelectorAll('.translation-row');
  console.log('翻訳行の数:', rows.length);
  
  rows.forEach((row, index) => {
    const languageCode = row.querySelector('.translation-language').value;
    const translatedTitle = row.querySelector('.translation-title').value.trim();
    
    console.log(`行${index + 1}:`, { languageCode, translatedTitle });
    
    if (languageCode && translatedTitle) {
      translations.push({
        language_code: languageCode,
        translated_title: translatedTitle
      });
    }
  });
  
  console.log('最終的な翻訳データ:', translations);
  return translations;
};

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

// 料理ジャンルから言語コードを取得する関数
const getLanguageCode = (genre) => {
  const languageMap = {
    'フレンチ': 'fr',
    'イタリアン': 'it', 
    '和食': 'ja',
    '中華': 'zh',
    'スパニッシュ': 'es',
    'ドイツ': 'de',
    '創作料理': 'en',
    'デザート': 'fr',
    'パン': 'fr'
  };
  return languageMap[genre] || 'en';
};

// 料理ジャンルから言語名を取得する関数
const getLanguageName = (genre) => {
  const languageNameMap = {
    'フレンチ': 'フランス',
    'イタリアン': 'イタリア',
    '和食': '日本',
    '中華': '中国',
    'スパニッシュ': 'スペイン',
    'ドイツ': 'ドイツ',
    '創作料理': '英語',
    'デザート': 'フランス',
    'パン': 'フランス'
  };
  return languageNameMap[genre] || '英語';
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
    baseIngredient = `指定された材料をすべて使用して創作してください: ${existingIngredients.join(', ')}`;
  } 
  // 材料が1つも入力されていない場合はポップアップで入力を求める
  else if (existingIngredients.length === 0) {
    baseIngredient = prompt('創作のベースにしたい材料を入力してください（例: 鶏肉、トマト、じゃがいも）\n複数の材料を入力する場合は、カンマで区切ってください');
    if (!baseIngredient || baseIngredient.trim() === '') {
      alert('材料を入力してください');
      return;
    }
    const ingredients = baseIngredient.trim().split(',').map(ing => ing.trim()).filter(ing => ing);
    if (ingredients.length >= 2) {
      baseIngredient = `指定された材料をすべて使用して創作してください: ${ingredients.join(', ')}`;
    } else {
      baseIngredient = `メイン材料: ${ingredients[0]}`;
    }
  }
  // 材料が1つだけの場合はそれを使用
  else {
    baseIngredient = `メイン材料: ${existingIngredients[0]}`;
  }
  
  showAIStep('loading');
  
  try {
    const languageName = getLanguageName(selectedGenre);
    const prompt = `${selectedGenre}料理のメニューを5つ提案してください。
${baseIngredient}
${customRequest ? `追加条件: ${customRequest}` : ''}

${existingIngredients.length >= 2 ? '複数の材料を指定している場合は、それらすべてを効果的に組み合わせた料理を提案してください。材料の相性や調理法のバリエーションを考慮して、それぞれ異なるアプローチで創作してください。' : ''}

**重要**: 材料の分量は必ずgまたはmlで表記してください。大さじ、小さじ、カップなどの単位は使用せず、以下の換算で数値化してください：
- 大さじ1 = 15ml/15g
- 小さじ1 = 5ml/5g  
- カップ1 = 200ml

各メニューの説明は以下の要素を含む簡潔な文章（50文字以内）で作成してください：
- 調理法の特徴（例：低温調理、燻製、分子ガストロノミー）
- 味の特徴（例：酸味、甘み、スパイシー）
- 食感の特徴（例：クリーミー、サクサク、とろける）
- プレゼンテーションの特徴（例：色彩豊か、ミニマル、アート的）

また、各メニュー名を${languageName}語で翻訳してください。
    
以下のJSON形式で回答してください：
{
  "suggestions": [
    {"name": "料理名1（日本語）", "translated_name": "料理名1（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"},
    {"name": "料理名2（日本語）", "translated_name": "料理名2（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"},
    {"name": "料理名3（日本語）", "translated_name": "料理名3（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"}
  ]
}`;

    // SupabaseからAPIキーを取得
    const { data: apiKeys, error: apiError } = await sb.functions.invoke('get-api-keys', {
      body: { keyName: 'GEMINI_API_KEY' }
    });
    
    if (apiError || !apiKeys.success) {
      throw new Error('APIキーの取得に失敗しました');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKeys.apiKey}`, {
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
    <div class="menu-item" data-index="${index}">
      <h4>${escapeHtml(suggestion.name)}</h4>
      ${suggestion.translated_name ? `<div class="translated-menu-name">${escapeHtml(suggestion.translated_name)}</div>` : ''}
      <p>${escapeHtml(suggestion.description)}</p>
    </div>
  `).join('');
  
  // Add click handlers for menu selection
  container.querySelectorAll('.menu-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.menu-item').forEach(item => item.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('generate-full-recipe-btn').disabled = false;
    });
  });
  
  // 「さらに提案」ボタンを追加
  const moreSuggestionsBtn = document.createElement('button');
  moreSuggestionsBtn.id = 'more-suggestions-btn';
  moreSuggestionsBtn.className = 'btn secondary';
  moreSuggestionsBtn.innerHTML = '🔄 さらに5つ提案してもらう';
  moreSuggestionsBtn.style.marginTop = '15px';
  moreSuggestionsBtn.style.width = '100%';
  
  moreSuggestionsBtn.addEventListener('click', async () => {
    // 追加の要望を聞く
    const additionalRequest = prompt('追加の要望があれば入力してください（空欄でもOK）:\n\n例：\n・もっとヘルシーな料理\n・簡単に作れるもの\n・見た目が美しい料理\n・スパイシーな味付け\n・和風のアレンジ');
    
    if (additionalRequest === null) {
      // キャンセルされた場合は何もしない
      return;
    }
    
    moreSuggestionsBtn.disabled = true;
    moreSuggestionsBtn.innerHTML = '⏳ 生成中...';
    
    try {
      await generateMoreMenuSuggestions(additionalRequest.trim());
    } catch (error) {
      console.error('追加提案生成エラー:', error);
      alert('追加提案の生成に失敗しました: ' + error.message);
    } finally {
      moreSuggestionsBtn.disabled = false;
      moreSuggestionsBtn.innerHTML = '🔄 さらに5つ提案してもらう';
    }
  });
  
  // 既存の「さらに提案」ボタンを削除
  const existingBtn = document.getElementById('more-suggestions-btn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  container.appendChild(moreSuggestionsBtn);
};

// 追加のメニュー提案を生成する関数
const generateMoreMenuSuggestions = async (additionalRequest = '') => {
  const selectedGenreBtn = document.querySelector('.genre-btn.selected');
  if (!selectedGenreBtn) {
    alert('ジャンルを選択してください');
    return;
  }

  const selectedGenre = selectedGenreBtn.dataset.genre;
  const existingIngredients = getExistingIngredients();
  const originalCustomRequest = document.getElementById('custom-request')?.value?.trim() || '';
  
  // 前の要望と追加の要望を結合
  let combinedRequest = '';
  if (originalCustomRequest && additionalRequest) {
    combinedRequest = `\n追加条件: ${originalCustomRequest}\nさらに追加の要望: ${additionalRequest}`;
  } else if (originalCustomRequest) {
    combinedRequest = `\n追加条件: ${originalCustomRequest}`;
  } else if (additionalRequest) {
    combinedRequest = `\n追加条件: ${additionalRequest}`;
  }
  
  // 既存の提案を取得して、重複を避ける
  const existingSuggestions = Array.from(document.querySelectorAll('.menu-item h4'))
    .map(el => el.textContent.trim());
  
  let baseIngredient = '';
  if (existingIngredients.length > 0) {
    baseIngredient = `\n主材料: ${existingIngredients.join('、')}`;
  }
  
  try {
    // APIキーを動的に取得
    const { data: apiKeyData, error: apiKeyError } = await sb.functions.invoke('get-api-keys', {
      body: { keyName: 'GEMINI_API_KEY' }
    });
    
    if (apiKeyError || !apiKeyData?.apiKey) {
      throw new Error('APIキーの取得に失敗しました');
    }
    
    const languageName = getLanguageName(selectedGenre);
    const prompt = `${selectedGenre}料理のメニューを5つ提案してください。
${baseIngredient}${combinedRequest}

既存の提案: ${existingSuggestions.join(', ')}

上記の既存提案とは異なる、新しいアプローチや調理法のメニューを提案してください。同じような料理は避けて、バリエーション豊かな提案をお願いします。

${existingIngredients.length >= 2 ? '複数の材料を指定している場合は、それらすべてを効果的に組み合わせた料理を提案してください。材料の相性や調理法のバリエーションを考慮して、それぞれ異なるアプローチで創作してください。' : ''}

**重要**: 材料の分量は必ずgまたはmlで表記してください。大さじ、小さじ、カップなどの単位は使用せず、以下の換算で数値化してください：
- 大さじ1 = 15ml/15g
- 小さじ1 = 5ml/5g  
- カップ1 = 200ml

各メニューの説明は以下の要素を含む簡潔な文章（50文字以内）で作成してください：
- 調理法の特徴（例：低温調理、燻製、分子ガストロノミー）
- 味の特徴（例：酸味、甘み、スパイシー）
- 食感の特徴（例：クリーミー、サクサク、とろける）
- プレゼンテーションの特徴（例：色彩豊か、ミニマル、アート的）

また、各メニュー名を${languageName}語で翻訳してください。
    
以下のJSON形式で回答してください:
[
  {
    "name": "料理名（日本語）",
    "translated_name": "翻訳された料理名（${languageName}）",
    "description": "料理の説明（日本語）"
  }
]`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKeyData.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (generatedText) {
      // JSONを抽出
      const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          // 既存の提案に追加
          const container = document.getElementById('menu-suggestions');
          const existingItems = container.querySelectorAll('.menu-item');
          const startIndex = existingItems.length;
          
          // 新しい提案を追加
          const newSuggestionsHTML = suggestions.map((suggestion, index) => `
            <div class="menu-item" data-index="${startIndex + index}">
              <h4>${escapeHtml(suggestion.name)}</h4>
              ${suggestion.translated_name ? `<div class="translated-menu-name">${escapeHtml(suggestion.translated_name)}</div>` : ''}
              <p>${escapeHtml(suggestion.description)}</p>
            </div>
          `).join('');
          
          // 既存の「さらに提案」ボタンを一時的に削除
          const moreBtn = document.getElementById('more-suggestions-btn');
          if (moreBtn) {
            moreBtn.remove();
          }
          
          // 新しい提案を挿入
          container.insertAdjacentHTML('beforeend', newSuggestionsHTML);
          
          // 新しい提案にクリックハンドラーを追加
          const newItems = container.querySelectorAll('.menu-item');
          newItems.forEach((el, index) => {
            if (index >= startIndex) {
              el.addEventListener('click', () => {
                container.querySelectorAll('.menu-item').forEach(item => item.classList.remove('selected'));
                el.classList.add('selected');
                document.getElementById('generate-full-recipe-btn').disabled = false;
              });
            }
          });
          
          // 「さらに提案」ボタンを再追加
          const newMoreBtn = document.createElement('button');
          newMoreBtn.id = 'more-suggestions-btn';
          newMoreBtn.className = 'btn secondary';
          newMoreBtn.innerHTML = '🔄 さらに5つ提案してもらう';
          newMoreBtn.style.marginTop = '15px';
          newMoreBtn.style.width = '100%';
          
          newMoreBtn.addEventListener('click', async () => {
            // 追加の要望を聞く
            const additionalRequest = prompt('追加の要望があれば入力してください（空欄でもOK）:\n\n例：\n・もっとヘルシーな料理\n・簡単に作れるもの\n・見た目が美しい料理\n・スパイシーな味付け\n・和風のアレンジ');
            
            if (additionalRequest === null) {
              // キャンセルされた場合は何もしない
              return;
            }
            
            newMoreBtn.disabled = true;
            newMoreBtn.innerHTML = '⏳ 生成中...';
            
            try {
              await generateMoreMenuSuggestions(additionalRequest.trim());
            } catch (error) {
              console.error('追加提案生成エラー:', error);
              alert('追加提案の生成に失敗しました: ' + error.message);
            } finally {
              newMoreBtn.disabled = false;
              newMoreBtn.innerHTML = '🔄 さらに5つ提案してもらう';
            }
          });
          
          container.appendChild(newMoreBtn);
          
          console.log('追加提案を生成しました:', suggestions.length, '件');
        } else {
          throw new Error('提案の生成に失敗しました');
        }
      } else {
        throw new Error('提案の生成に失敗しました');
      }
    } else {
      throw new Error('提案の生成に失敗しました');
    }
  } catch (error) {
    console.error('追加提案生成エラー:', error);
    throw error;
  }
};

const generateFullRecipe = async () => {
  const selectedMenu = document.querySelector('.menu-item.selected');
  if (!selectedMenu) {
    alert('メニューを選択してください');
    return;
  }
  
  const menuName = selectedMenu.querySelector('h4').textContent;
  const translatedName = selectedMenu.querySelector('.translated-menu-name')?.textContent || '';
  const existingIngredients = getExistingIngredients();
  
  // 翻訳情報をグローバル変数に保存
  currentTranslatedName = translatedName;
  currentLanguageCode = getLanguageCode(selectedGenre);
  
  // 既存の材料がある場合はそれを含める指示を追加
  let ingredientInstruction = '';
  if (existingIngredients.length > 0) {
    if (existingIngredients.length >= 2) {
      ingredientInstruction = `\n\n※必ず以下の材料をすべて使用してレシピを作成してください: ${existingIngredients.join(', ')}\n複数の材料を効果的に組み合わせ、それぞれの特性を活かした調理法を提案してください。`;
    } else {
      ingredientInstruction = `\n\n※必ず以下の材料を含めてレシピを作成してください: ${existingIngredients.join(', ')}`;
    }
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

    // SupabaseからAPIキーを取得
    const { data: apiKeys, error: apiError } = await sb.functions.invoke('get-api-keys', {
      body: { keyName: 'GEMINI_API_KEY' }
    });
    
    if (apiError || !apiKeys.success) {
      throw new Error('APIキーの取得に失敗しました');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKeys.apiKey}`, {
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
  console.log('=== PROCESSING STEPS ===');
  console.log('AI Recipe Steps:', recipe.steps);
  console.log('Steps is array?', Array.isArray(recipe.steps));
  
  if (recipe.steps && Array.isArray(recipe.steps)) {
    console.log(`Found ${recipe.steps.length} steps to add`);
    
    // Add all step rows first
    for (let i = 0; i < recipe.steps.length; i++) {
      console.log(`Adding step ${i + 1}:`, recipe.steps[i]);
      addStepRow();
      // Wait a bit between each addition
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Wait for DOM update
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Try multiple selectors to find step inputs (textarea elements)
    let stepRows = document.querySelectorAll('.step-row textarea.step-text');
    console.log(`Found ${stepRows.length} step textarea elements with .step-row textarea.step-text`);
    
    // If no elements found, try alternative selectors
    if (stepRows.length === 0) {
      stepRows = document.querySelectorAll('#stepsEditor textarea.step-text');
      console.log(`Found ${stepRows.length} step textarea elements with #stepsEditor textarea.step-text`);
    }
    
    if (stepRows.length === 0) {
      stepRows = document.querySelectorAll('#stepsEditor textarea');
      console.log(`Found ${stepRows.length} textarea elements in #stepsEditor`);
    }
    
    recipe.steps.forEach((step, index) => {
      if (stepRows[index]) {
        // 文字列の場合
        if (typeof step === 'string') {
          stepRows[index].value = step;
          console.log(`Set step ${index + 1} to: "${step}"`);
        }
        // オブジェクトの場合（翻訳データ形式）
        else if (typeof step === 'object' && step.text) {
          stepRows[index].value = step.text;
          console.log(`Set step ${index + 1} to: "${step.text}"`);
        }
        // その他の場合
        else {
          stepRows[index].value = (step || '').toString();
          console.log(`Set step ${index + 1} to: "${step}"`);
        }
      } else {
        console.error(`Could not find step input for index ${index}`);
      }
    });
    
    console.log('=== STEPS PROCESSING COMPLETE ===');
  } else {
    console.log('No valid steps array found');
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