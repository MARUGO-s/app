document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase === 'undefined') { 
        alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
        return;
    }

    const sb = supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");
    const params = new URLSearchParams(location.search);
    let id = params.get('id');

    // --- Element Selection ---
    const form = document.getElementById('editForm');
    const titleEl = document.getElementById('title');
    const categoryEl = document.getElementById('category');
    const tagsEl = document.getElementById('tags');
    const notesEl = document.getElementById('notes');
    const ingredientsEditor = document.getElementById('ingredientsEditor');
    const stepsEditor = document.getElementById('stepsEditor');
    const addIngBtn = document.getElementById('addIng');
    const addStepBtn = document.getElementById('addStep');
    
    // --- AI Modal Elements ---
    const aiWizardBtn = document.getElementById('ai-wizard-btn');
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
    
    let selectedGenre = '';
    let selectedMenu = '';
    let finalRecipeData = null;

    // --- Helper Functions ---
    const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>\"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));

    // --- Dynamic Row Functions ---
    const addIngredientRow = (data = {}) => {
        if (!ingredientsEditor) return;
        const div = document.createElement('div');
        div.className = 'ingredient-row';
        const quantityValue = data.quantity !== null && data.quantity !== undefined ? data.quantity : '';
        div.innerHTML = `
          <input type="text" placeholder="材料名 *" value="${escapeHtml(data.item || '')}" data-field="item" class="ing-item">
          <input type="text" placeholder="分量" value="${escapeHtml(quantityValue)}" data-field="quantity" class="ing-qty">
          <input type="text" placeholder="単位" value="${escapeHtml(data.unit || '')}" data-field="unit" class="ing-unit">
          <button type="button" class="btn danger small js-remove-row">削除</button>
        `;
        ingredientsEditor.appendChild(div);
    };
    const addStepRow = (data = {}) => {
        if (!stepsEditor) return;
        const div = document.createElement('div');
        div.className = 'step-row';
        div.innerHTML = `
          <input type="text" placeholder="手順 *" value="${escapeHtml(data.instruction || '')}" data-field="instruction" style="grid-column: 1 / -2;">
          <button type="button" class="btn danger small js-remove-row" style="grid-column: -2 / -1;">削除</button>
        `;
        stepsEditor.appendChild(div);
    };

    // --- AI Modal Control ---
    const openModal = () => { if(aiModal) aiModal.style.display = 'flex'; };
    const closeModal = () => { if(aiModal) aiModal.style.display = 'none'; resetModal(); };
    const resetModal = () => {
        aiStep1.style.display = 'block';
        aiStep2.style.display = 'none';
        aiStep3.style.display = 'none';
        aiLoading.style.display = 'none';
        genreBtns.forEach(b => b.classList.remove('selected'));
        getSuggestionsBtn.disabled = true;
        generateFullRecipeBtn.disabled = true;
        aiCustomRequestEl.value = '';
        menuSuggestionsContainer.innerHTML = '';
        if(recipePreview) recipePreview.innerHTML = '';
        selectedGenre = '';
        selectedMenu = '';
        finalRecipeData = null;
    };

    // --- AI Function Call ---
    async function callGemini(prompt, responseSchema) {
        const { data, error } = await sb.functions.invoke('call-gemini', { body: { prompt, responseSchema } });
        if (error) throw new Error(`Edge Function Error: ${error.message}`);
        if (data.error) throw new Error(`API Error from Edge Function: ${data.error}`);
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            const reason = data.candidates?.[0]?.finishReason;
            throw new Error(reason === 'SAFETY' ? 'AIが安全でないと判断したため応答できませんでした。' : 'AIからの応答が空でした。');
        }
        return JSON.parse(jsonText);
    }
    
    // --- Event Listeners ---
    if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
    if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
    if (document.querySelector('form')) document.querySelector('form').addEventListener('click', (e) => {
        if (e.target.classList.contains('js-remove-row')) e.target.closest('.ingredient-row, .step-row')?.remove();
    });

    if (aiWizardBtn) aiWizardBtn.addEventListener('click', openModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (aiModal) aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeModal(); });
    
    if (genreBtns) genreBtns.forEach(btn => btn.addEventListener('click', () => {
        genreBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGenre = btn.dataset.genre;
        getSuggestionsBtn.disabled = false;
    }));

    if (getSuggestionsBtn) getSuggestionsBtn.addEventListener('click', async () => {
        const ingredients = [...ingredientsEditor.querySelectorAll('[data-field="item"]')].map(input => input.value.trim()).filter(Boolean);
        if (ingredients.length === 0) { return alert('先に材料を1つ以上入力してください。'); }
        aiStep1.style.display = 'none';
        aiLoading.style.display = 'block';
        const customRequest = aiCustomRequestEl.value.trim();
        let prompt = `あなたは、料理のコンセプトやストーリーを大切にするプロの${selectedGenre}シェフです。以下の材料を活した創造的なメニュー名を必ず5つ提案してください。それぞれのメニュー名には、他のプロの料理人に語るように、その料理のコンセプトや調理法の特徴、インスピレーションを簡潔に説明した文章を必ず添えてください。${customRequest ? `\n\n# 追加の希望\n${customRequest}` : ''}\n\n回答は [{"name": "料理名", "description": "プロ向けの説明文"}] という形式のJSON配列で厳密に返してください。\n\n# 材料\n- ${ingredients.join('\n- ')}`;
        const schema = {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { "name": { "type": "STRING" }, "description": { "type": "STRING" } }, required: ["name", "description"] }
        };

        try {
            const response = await callGemini(prompt, schema);
            menuSuggestionsContainer.innerHTML = response.map((suggestion) => `
                <div class="menu-suggestions-item" data-menu="${escapeHtml(suggestion.name)}">
                    <div style="font-weight: 600;">${escapeHtml(suggestion.name)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(suggestion.description)}</div>
                </div>
            `).join('');
            aiLoading.style.display = 'none';
            aiStep2.style.display = 'block';
        } catch (error) {
            alert(`メニュー案の生成に失敗しました。\n${error.message}`);
            resetModal();
        }
    });

    if (menuSuggestionsContainer) menuSuggestionsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-suggestions-item');
        if (item) {
            menuSuggestionsContainer.querySelectorAll('.menu-suggestions-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedMenu = item.dataset.menu;
            generateFullRecipeBtn.disabled = false;
        }
    });

    if (generateFullRecipeBtn) generateFullRecipeBtn.addEventListener('click', async () => {
        aiStep2.style.display = 'none';
        aiLoading.style.display = 'block';
        const customRequest = aiCustomRequestEl.value.trim();
        const ingredients = [...ingredientsEditor.querySelectorAll('[data-field="item"]')].map(input => input.value.trim()).filter(Boolean);
        let prompt = `あなたはプロの${selectedGenre}シェフです。「${selectedMenu}」のレシピを創作してください。以下のJSON形式で返してください。材料の分量はテキストで、手順は配列で返してください。\n\n#追加の希望\n${customRequest}\n#ベース材料\n- ${ingredients.join('\n- ')}`;
        const schema = { type: "OBJECT", properties: { "title": { "type": "STRING" }, "category": { "type": "STRING" }, "tags": { "type": "ARRAY", items: { "type": "STRING" } }, "notes": { "type": "STRING" }, "ingredients": { "type": "ARRAY", items: { "type": "OBJECT", properties: { "item": { "type": "STRING" }, "quantity": { "type": "STRING" }, "unit": { "type": "STRING" } }, required: ["item", "quantity"] } }, "steps": { "type": "ARRAY", items: { "type": "STRING" } } }, required: ["title", "category", "ingredients", "steps", "notes"] };
        
        try {
            const recipeData = await callGemini(prompt, schema);
            finalRecipeData = recipeData;
            let previewText = `■ 料理名\n${recipeData.title}\n\n■ カテゴリー\n${recipeData.category}\n\n■ 材料\n`;
            recipeData.ingredients.forEach(ing => {
                previewText += `- ${ing.item} ... ${ing.quantity || ''} ${ing.unit || ''}\n`;
            });
            previewText += `\n■ 手順\n`;
            recipeData.steps.forEach((step, index) => {
                previewText += `${index + 1}. ${step}\n`;
            });
            previewText += `\n■ メモ・コツ\n${recipeData.notes}`;
            recipePreview.innerText = previewText;
            aiLoading.style.display = 'none';
            aiStep3.style.display = 'block';
        } catch (error) {
            alert(`ルセットの生成に失敗しました。\n${error.message}`);
            resetModal();
        }
    });

    if (applyRecipeBtn) applyRecipeBtn.addEventListener('click', () => {
        if (!finalRecipeData) {
            alert('反映するレシピデータがありません。');
            return;
        }
        titleEl.value = finalRecipeData.title || '';
        if (finalRecipeData.category) categoryEl.value = finalRecipeData.category;
        tagsEl.value = (finalRecipeData.tags || []).join(', ');
        notesEl.value = finalRecipeData.notes || '';
        ingredientsEditor.innerHTML = '';
        (finalRecipeData.ingredients || []).forEach(addIngredientRow);
        stepsEditor.innerHTML = '';
        (finalRecipeData.steps || []).forEach(step => addStepRow({ instruction: step }));
        closeModal();
    });

    // --- Initial Load ---
    if (document.getElementById('title')) {
        addIngredientRow();
        addStepRow();
    }
});
