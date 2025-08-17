document.addEventListener('DOMContentLoaded', () => {
  if (typeof supabase === 'undefined') {
    alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
    return;
  }

  // 修正点1: APIキーを最新化
  const sb = supabase.createClient(
    "https://ctxyawinblwcbkovfsyj.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q"
  );

  // --- Elements ---
  const titleEl = document.getElementById('title');
  const categoryEl = document.getElementById('category');
  const tagsEl = document.getElementById('tags');
  const notesEl = document.getElementById('notes');
  const ingredientsEditor = document.getElementById('ingredientsEditor');
  const stepsEditor = document.getElementById('stepsEditor');
  const addIngBtn = document.getElementById('addIng');
  const addStepBtn = document.getElementById('addStep');
  const saveBtn = document.querySelector('.js-save');

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

  let selectedGenre = '';
  let selectedMenu = '';
  let finalRecipeData = null;

  // --- Helpers ---
  const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));

  const addIngredientRow = (data = {}) => {
    if (!ingredientsEditor) return;
    const div = document.createElement('div');
    div.className = 'ingredient-row';
    const quantityValue = data.quantity !== null && data.quantity !== undefined ? data.quantity : '';
    div.innerHTML = `
      <input type="text" placeholder="材料名 *" value="${escapeHtml(data.item||'')}" data-field="item" class="ing-item">
      <input type="text" placeholder="分量" value="${escapeHtml(quantityValue)}" data-field="quantity" class="ing-qty">
      <input type="text" placeholder="単位" value="${escapeHtml(data.unit||'')}" data-field="unit" class="ing-unit">
      <button type="button" class="btn danger small js-remove-row">削除</button>`;
    ingredientsEditor.appendChild(div);
  };

  const addStepRow = (data = {}) => {
    if (!stepsEditor) return;
    const div = document.createElement('div');
    div.className = 'step-row';
    div.innerHTML = `
      <input type="text" placeholder="手順 *" value="${escapeHtml(data.instruction||'')}" data-field="instruction" class="step-text">
      <button type="button" class="btn danger small js-remove-row">削除</button>`;
    stepsEditor.appendChild(div);
  };

  // --- フォーム保存機能 ---
  const saveRecipe = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const recipeId = params.get('id');
      
      const title = titleEl?.value?.trim() || '';
      const category = categoryEl?.value?.trim() || '';
      const tags = tagsEl?.value ? tagsEl.value.split(',').map(t => t.trim()).filter(Boolean) : [];
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
        return { position: index + 1, item, quantity: quantity || null, unit: unit || null };
      }).filter(Boolean);

      const stepRows = Array.from(stepsEditor?.querySelectorAll('.step-row') || []);
      const steps = stepRows.map((row, index) => {
        const instruction = row.querySelector('[data-field="instruction"]')?.value?.trim() || '';
        if (!instruction) return null;
        return { position: index + 1, instruction };
      }).filter(Boolean);

      const recipeData = { title, category: category || null, tags: tags.length > 0 ? tags : null, notes: notes || null };

      let recipeResult;
      if (recipeId) {
        recipeResult = await sb.from('recipes').update(recipeData).eq('id', recipeId).select('id').single();
      } else {
        recipeResult = await sb.from('recipes').insert(recipeData).select('id').single();
      }

      if (recipeResult.error) {
        throw new Error('レシピの保存に失敗しました: ' + recipeResult.error.message);
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

      alert('レシピを保存しました！');
      window.location.href = `recipe_view.html?id=${encodeURIComponent(savedRecipeId)}`;

    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + (error.message || error));
    }
  };

  // --- AIモーダル制御（既存ロジック） ---
  const openModal = () => { if(aiModal) aiModal.style.display = 'flex'; };
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
      const startIndex = text.indexOf('{');
      const endIndex = text.lastIndexOf('}');
      if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
        return text.substring(startIndex, endIndex + 1);
      }
      return text;
    } catch (e) {
      console.error('extractLLMText error', e, r);
      return '';
    }
  }

  async function callGemini(prompt, responseSchema) {
    const { data, error } = await sb.functions.invoke('call-gemini', { body: { prompt, responseSchema } });
    if (error) throw new Error(`Edge Function Error: ${error.message}`);
    if (data.error) throw new Error(`API Error from Edge Function: ${data.error}`);
    const jsonText = extractLLMText(data);
    window._debug_ai_response = jsonText;
    if (!jsonText) throw new Error('AIからの応答が空でした。');
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON Parse Error:", e, "Raw Text:", jsonText);
      throw new Error('AIからの応答をJSONとして解析できませんでした。');
    }
  }

  // --- クリックハンドラ ---
  if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
  if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
  if (saveBtn) saveBtn.addEventListener('click', saveRecipe);
  
  if (document.querySelector('form')) {
    document.querySelector('form').addEventListener('click', (e) => {
      if (e.target.classList.contains('js-remove-row')) {
        const row = e.target.closest('.ingredient-row, .step-row');
        if (row) row.remove();
      }
    });
  }

  if (aiWizardBtn) aiWizardBtn.addEventListener('click', openModal);
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

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
        const customRequest = aiCustomRequestEl?.value?.trim() || '';
        const prompt = `${selectedGenre}料理のメニューを5つ提案してください。${customRequest ? `追加要望: ${customRequest}` : ''}
        ---
        各メニューには、そのメニューのコンセプトや意図を30字程度の短い文章で添えてください。
        必ず以下のJSON形式で、JSONオブジェクトのみを返してください。解説や前置き、Markdownのコードブロックなどは一切不要です。
        {"suggestions": [{"name": "メニュー名1", "intent": "メニューの意図1"}, {"name": "メニュー名2", "intent": "メニューの意-図2"}]}`;
        
        const result = await callGemini(prompt, { type: "OBJECT", properties: { suggestions: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, intent: { type: "STRING" } }, required: ["name", "intent"] } } }, required: ["suggestions"] });
        
        aiLoading.style.display = 'none';
        aiStep2.style.display = 'block';
        
        if (menuSuggestionsContainer && result.suggestions) {
          menuSuggestionsContainer.innerHTML = '';
          result.suggestions.forEach(menu => {
            const item = document.createElement('div');
            item.className = 'menu-suggestions-item';
            item.innerHTML = `<div class="menu-name">${escapeHtml(menu.name)}</div><div class="menu-intent">${escapeHtml(menu.intent)}</div>`;
            item.addEventListener('click', () => {
              menuSuggestionsContainer.querySelectorAll('.menu-suggestions-item').forEach(i => i.classList.remove('selected'));
              item.classList.add('selected');
              selectedMenu = menu.name;
              if (generateFullRecipeBtn) generateFullRecipeBtn.disabled = false;
            });
            menuSuggestionsContainer.appendChild(item);
          });
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
      if (!selectedMenu) return;
      aiStep2.style.display = 'none';
      aiLoading.style.display = 'block';
      try {
        const prompt = `「${selectedMenu}」の詳細なレシピを作成してください。プロの料理人レベルの正確な分量と手順でお願いします。\n---\n解説や前置き、Markdownのコードブロックなどは一切含めず、レシピ情報を含むJSONオブジェクトのみを返してください。`;
        const result = await callGemini(prompt, { type: "OBJECT", properties: { title: { type: "STRING" }, category: { type: "STRING" }, tags: { type: "ARRAY", items: { type: "STRING" } }, notes: { type: "STRING" }, ingredients: { type: "ARRAY", items: { type: "OBJECT", properties: { item: { type: "STRING" }, quantity: { type: "STRING" }, unit: { type: "STRING" } }, required: ["item"] } }, steps: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "ingredients", "steps"] });
        finalRecipeData = result;
        aiLoading.style.display = 'none';
        aiStep3.style.display = 'block';
        if (recipePreview) {
          let preview = `タイトル: ${result.title || ''}\n`;
          preview += `カテゴリ: ${result.category || ''}\n`;
          preview += `タグ: ${(result.tags || []).join(', ')}\n`;
          preview += `メモ: ${result.notes || ''}\n\n`;
          preview += `材料:\n${(result.ingredients || []).map(ing => `- ${ing.item} ${ing.quantity || ''} ${ing.unit || ''}`).join('\n')}\n\n`;
          preview += `手順:\n${(result.steps || []).map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
          recipePreview.textContent = preview;
        }
      } catch (error) {
        console.error('レシピ生成エラー:', error);
        aiLoading.style.display = 'none';
        aiStep2.style.display = 'block';
        alert('レシピ生成に失敗しました: ' + (error.message || error));
      }
    });
  }

  if (applyRecipeBtn) {
    applyRecipeBtn.addEventListener('click', () => {
      if (!finalRecipeData) return;
      if (titleEl) titleEl.value = finalRecipeData.title || '';
      if (categoryEl) categoryEl.value = finalRecipeData.category || '';
      if (tagsEl) tagsEl.value = (finalRecipeData.tags || []).join(', ');
      if (notesEl) notesEl.value = finalRecipeData.notes || '';
      if (ingredientsEditor) ingredientsEditor.innerHTML = '';
      (finalRecipeData.ingredients || []).forEach(ing => addIngredientRow(ing));
      if (stepsEditor) stepsEditor.innerHTML = '';
      (finalRecipeData.steps || []).forEach(step => addStepRow({ instruction: step }));
      closeModal();
      alert('レシピデータをフォームに反映しました！');
    });
  }

  // --- 起動時：既存レシピ読み込みまたは空行追加 ---
  (function initializeForm(){
    try{
      const aiRecipe = localStorage.getItem('ai_generated_recipe');
      if (aiRecipe) {
        const data = JSON.parse(aiRecipe);
        if (titleEl) titleEl.value = data.title || '';
        if (categoryEl) categoryEl.value = data.category || '';
        if (tagsEl) tagsEl.value = (data.tags || []).join(', ');
        if (notesEl) notesEl.value = data.notes || '';
        if (ingredientsEditor) ingredientsEditor.innerHTML = '';
        (data.ingredients || []).forEach(ing => addIngredientRow(ing));
        if (stepsEditor) stepsEditor.innerHTML = '';
        (data.steps || []).forEach(step => addStepRow({ instruction: step }));
        localStorage.removeItem('ai_generated_recipe');
        return;
      }
      const params = new URLSearchParams(window.location.search);
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
      if (categoryEl) categoryEl.value = recipe.category || '';
      if (tagsEl) tagsEl.value = Array.isArray(recipe.tags) ? recipe.tags.join(', ') : '';
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
});