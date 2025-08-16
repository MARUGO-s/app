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
    const statusEl = document.getElementById('status');
    const ingredientsEditor = document.getElementById('ingredientsEditor');
    const stepsEditor = document.getElementById('stepsEditor');
    const addIngBtn = document.getElementById('addIng');
    const addStepBtn = document.getElementById('addStep');
    const saveButtons = document.querySelectorAll('.js-save');
    const cancelButtons = document.querySelectorAll('.js-cancel');
    const viewButton = document.querySelector('.js-view');
    const deleteButton = document.getElementById('js-delete-btn');
    const savingOverlay = document.getElementById('saving-overlay');
    
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
    const num = (s) => { 
        if (s === null || s === undefined || s === '') return null;
        const v = parseFloat(String(s).replace(/[, ]/g, '')); 
        return isFinite(v) ? v : null; 
    };

    // --- Dynamic Row Functions ---
    const addIngredientRow = (data = {}) => {
        if (!ingredientsEditor) return;
        const div = document.createElement('div');
        div.className = 'ingredient-row';
        const quantityValue = data.quantity !== null && data.quantity !== undefined ? data.quantity : '';
        div.innerHTML = `<input type="text" placeholder="材料名 *" value="${escapeHtml(data.item||'')}" data-field="item" class="ing-item"><input type="text" placeholder="分量" value="${escapeHtml(quantityValue)}" data-field="quantity" class="ing-qty"><input type="text" placeholder="単位" value="${escapeHtml(data.unit||'')}" data-field="unit" class="ing-unit"><button type="button" class="btn danger small js-remove-row">削除</button>`;
        ingredientsEditor.appendChild(div);
    };
    const addStepRow = (data = {}) => {
        if (!stepsEditor) return;
        const div = document.createElement('div');
        div.className = 'step-row';
        div.innerHTML = `<input type="text" placeholder="手順 *" value="${escapeHtml(data.instruction||'')}" data-field="instruction"><button type="button" class="btn danger small js-remove-row">削除</button>`;
        stepsEditor.appendChild(div);
    };

    // --- AI Modal Control ---
    const openModal = () => { if(aiModal) aiModal.style.display = 'flex'; };
    const closeModal = () => { if(aiModal) aiModal.style.display = 'none'; resetModal(); };
    const resetModal = () => {
        if(aiStep1) aiStep1.style.display = 'block';
        if(aiStep2) aiStep2.style.display = 'none';
        if(aiStep3) aiStep3.style.display = 'none';
        if(aiLoading) aiLoading.style.display = 'none';
        if(genreBtns) genreBtns.forEach(b => b.classList.remove('selected'));
        if(getSuggestionsBtn) getSuggestionsBtn.disabled = true;
        if(generateFullRecipeBtn) generateFullRecipeBtn.disabled = true;
        if(aiCustomRequestEl) aiCustomRequestEl.value = '';
        if(menuSuggestionsContainer) menuSuggestionsContainer.innerHTML = '';
        if(recipePreview) recipePreview.innerHTML = '';
        selectedGenre = ''; selectedMenu = ''; finalRecipeData = null;
    };

    async function callGemini(prompt, responseSchema) {
        const { data, error } = await sb.functions.invoke('call-gemini', { body: { prompt, responseSchema } });
        if (error) throw new Error(`Edge Function Error: ${error.message}`);
        if (data.error) throw new Error(`API Error from Edge Function: ${data.error}`);
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) throw new Error('AIからの応答が空でした。');
        return JSON.parse(jsonText);
    }
    
    // --- CRUD Functions ---
    const loadRecipe = async () => {
        if (!id) {
            if(document.querySelector('.brand')) document.querySelector('.brand').textContent = '新規レシピ作成';
            addIngredientRow(); addStepRow();
            return;
        }
        if(document.querySelector('.brand')) document.querySelector('.brand').textContent = 'レシピ編集';
        if(viewButton) viewButton.style.display = 'inline-block';
        if(deleteButton) deleteButton.style.display = 'inline-block';

        const { data: r, error } = await sb.from('recipes').select('*').eq('id', id).single();
        if (error) { alert('レシピの読み込みに失敗'); return; }
        
        titleEl.value = r.title || '';
        if(r.category) categoryEl.value = r.category;
        tagsEl.value = (r.tags || []).join(', ');
        notesEl.value = r.notes || '';
        
        const { data: ings } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position');
        if (ings) {
            ingredientsEditor.innerHTML = '';
            ings.forEach(addIngredientRow);
        }
        const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position');
        if (steps) {
            stepsEditor.innerHTML = '';
            steps.forEach(addStepRow);
        }
    };

    const saveRecipe = async () => {
        if (savingOverlay) savingOverlay.style.display = 'flex';

        try {
            const payload = {
                title: titleEl.value.trim(),
                category: categoryEl.value || null,
                tags: tagsEl.value.split(',').map(s => s.trim()).filter(Boolean),
                notes: notesEl.value.trim() || null,
            };
            if (!payload.title) {
                alert('料理名は必須です');
                if (savingOverlay) savingOverlay.style.display = 'none';
                return;
            }
            
            let recipe_id = id;
            if (id) {
                const { error } = await sb.from('recipes').update(payload).eq('id', id);
                if (error) throw error; 
            } else {
                const { data, error } = await sb.from('recipes').insert(payload).select('id').single();
                if (error) throw error;
                id = data.id;
                recipe_id = id;
            }

            await sb.from('recipe_ingredients').delete().eq('recipe_id', recipe_id);
            const ingData = [...ingredientsEditor.querySelectorAll('.ingredient-row')].map((row, i) => ({
                recipe_id, position: i + 1,
                item: row.querySelector('[data-field="item"]').value.trim(),
                quantity: num(row.querySelector('[data-field="quantity"]').value),
                unit: row.querySelector('[data-field="unit"]').value.trim() || null,
            })).filter(d => d.item);
            if (ingData.length > 0) await sb.from('recipe_ingredients').insert(ingData);

            await sb.from('recipe_steps').delete().eq('recipe_id', recipe_id);
            const stepData = [...stepsEditor.querySelectorAll('.step-row')].map((row, i) => ({
                recipe_id, position: i + 1,
                instruction: row.querySelector('[data-field="instruction"]').value.trim(),
            })).filter(d => d.instruction);
            if (stepData.length > 0) await sb.from('recipe_steps').insert(stepData);

            if (statusEl) statusEl.textContent = '保存しました！';
            setTimeout(() => {
                location.href = `recipe_view.html?id=${recipe_id}`;
            }, 800);

        } catch (error) {
            if (savingOverlay) savingOverlay.style.display = 'none';
            console.error('Save failed:', error);
            if (statusEl) statusEl.textContent = `保存に失敗しました。`;
            alert(`保存に失敗しました:\n${error.message}`);
        }
    };

    // --- Event Listeners ---
    if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
    if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
    if (form) form.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-remove-row')) e.target.closest('.ingredient-row, .step-row')?.remove();
    });
    if (saveButtons) saveButtons.forEach(btn => btn.addEventListener('click', saveRecipe));
    if (cancelButtons) cancelButtons.forEach(btn => btn.addEventListener('click', () => location.href = id ? `recipe_view.html?id=${id}` : 'index.html'));
    
    if (aiWizardBtn) aiWizardBtn.addEventListener('click', openModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    
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
        let prompt = `あなたはプロの${selectedGenre}シェフです。以下の材料を活かした創造的で食欲をそそる日本語のメニュー名を必ず5つ提案してください。${customRequest ? `\n\n# 追加の希望\n${customRequest}` : ''}\n\n回答はメニュー名のみのJSON配列で返してください。\n\n# 材料\n- ${ingredients.join('\n- ')}`;
        const schema = { type: "ARRAY", items: { type: "STRING" } };
        try {
            const response = await callGemini(prompt, schema);
            menuSuggestionsContainer.innerHTML = response.map((menu) => `<div class="menu-suggestions-item" data-menu="${escapeHtml(menu)}">${escapeHtml(menu)}</div>`).join('');
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
        let prompt = `あなたはプロの${selectedGenre}シェフです。「${selectedMenu}」のレシピを創作してください。以下のJSON形式で返してください。\n\n#追加の希望\n${customRequest}\n#ベース材料\n- ${ingredients.join('\n- ')}`;
        
        // This is the corrected schema
        const schema = {
            type: "OBJECT",
            properties: {
                "title": { "type": "STRING" }, "category": { "type": "STRING" },
                "tags": { "type": "ARRAY", "items": { "type": "STRING" } }, "notes": { "type": "STRING" },
                "ingredients": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "item": { "type": "STRING" }, "quantity": { "type": "STRING" }, "unit": { "type": "STRING" } }, "required": ["item", "quantity"] }},
                "steps": { "type": "ARRAY", "items": { "type": "STRING" } }
            },
            "required": ["title", "category", "ingredients", "steps", "notes"]
        };

        try {
            const recipeData = await callGemini(prompt, schema);
            finalRecipeData = recipeData;
            let previewText = `■ 料理名\n${recipeData.title}\n\n■ カテゴリー\n${recipeData.category}\n\n■ 材料\n`;
            (recipeData.ingredients || []).forEach(ing => { previewText += `- ${ing.item} ... ${ing.quantity||''} ${ing.unit||''}\n`; });
            previewText += `\n■ 手順\n`;
            (recipeData.steps || []).forEach((step, i) => { previewText += `${i + 1}. ${step}\n`; });
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
    loadRecipe();
});
