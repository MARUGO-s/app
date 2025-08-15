// assets/js/app-edit.js - for recipe_edit.html
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
    const urlInput = document.getElementById('recipeUrl');
    const importBtn = document.getElementById('importFromUrlBtn');
    const importStatus = document.getElementById('importStatus');
    const aiWizardBtn = document.getElementById('ai-wizard-btn');
    const aiModal = document.getElementById('ai-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const aiStep1 = document.getElementById('ai-step-1');
    const aiStep2 = document.getElementById('ai-step-2');
    const aiLoading = document.getElementById('ai-loading');
    const genreBtns = document.querySelectorAll('.genre-btn');
    const getSuggestionsBtn = document.getElementById('get-suggestions-btn');
    const menuSuggestionsContainer = document.getElementById('menu-suggestions');
    const generateFullRecipeBtn = document.getElementById('generate-full-recipe-btn');
    const aiCustomRequestEl = document.getElementById('ai-custom-request');
    
    let selectedGenre = '';
    let selectedMenu = '';

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
    const closeModal = () => {
        if(aiModal) aiModal.style.display = 'none';
        resetModal();
    };
    const resetModal = () => {
        if(aiStep1) aiStep1.style.display = 'block';
        if(aiStep2) aiStep2.style.display = 'none';
        if(aiLoading) aiLoading.style.display = 'none';
        if(genreBtns) genreBtns.forEach(b => b.classList.remove('selected'));
        if(getSuggestionsBtn) getSuggestionsBtn.disabled = true;
        if(generateFullRecipeBtn) generateFullRecipeBtn.disabled = true;
        if(aiCustomRequestEl) aiCustomRequestEl.value = '';
        if(menuSuggestionsContainer) menuSuggestionsContainer.innerHTML = '';
        selectedGenre = '';
        selectedMenu = '';
    };

    // --- AI Function Call (via Supabase Edge Function) ---
    async function callGemini(prompt, responseSchema) {
        const { data, error } = await sb.functions.invoke('call-gemini', {
            body: { prompt, responseSchema },
        });

        if (error) throw new Error(`Edge Function Error: ${error.message}`);
        if (data.error) throw new Error(`API Error from Edge Function: ${data.error}`);
        
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            const reason = data.candidates?.[0]?.finishReason;
            throw new Error(reason === 'SAFETY' ? 'AIが安全でないと判断したため応答できませんでした。' : 'AIからの応答が空でした。');
        }
        return JSON.parse(jsonText);
    }

    // --- URL Import Function ---
    const importRecipeFromUrl = async (url) => {
        if (!url || !url.startsWith('http')) {
            alert('有効なURLを入力してください。');
            return;
        }

        importStatus.textContent = 'ウェブページを読み込んでいます...';
        importBtn.disabled = true;

        try {
            // ★★★ 修正: 外部プロキシの代わりに自前のEdge Functionを呼び出す ★★★
            const { data: fetchData, error: fetchError } = await sb.functions.invoke('fetch-url', {
                body: { url },
            });

            if (fetchError) throw fetchError;
            if (fetchData.error) throw new Error(fetchData.error);
            
            const htmlContent = fetchData.html;
            if (!htmlContent) throw new Error("URLからコンテンツを取得できませんでした。");
            
            importStatus.textContent = 'AIがレシピを解析中です...';
            
            const prompt = `以下のHTMLからレシピ情報を抽出してください。{"item": "材料名", "quantity": "分量", "unit": "単位"} の形式で材料を抽出します。分量が「少々」などの文字列の場合もそのまま抽出し、存在しない場合は空文字列にしてください。手順は文字列の配列で返してください。広告やコメントは無視してください。\n\nHTML:\n${htmlContent.substring(0, 15000)}`;
            const schema = {
                type: "OBJECT",
                properties: {
                    "title": { "type": "STRING" },
                    "ingredients": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": { "item": { "type": "STRING" }, "quantity": { "type": "STRING" }, "unit": { "type": "STRING" } },
                            required: ["item"]
                        }
                    },
                    "steps": { "type": "ARRAY", "items": { "type": "STRING" } }
                },
                required: ["title", "ingredients", "steps"]
            };

            const recipeData = await callGemini(prompt, schema);
            
            titleEl.value = recipeData.title || '';
            ingredientsEditor.innerHTML = '';
            stepsEditor.innerHTML = '';
            (recipeData.ingredients || []).forEach(addIngredientRow);
            (recipeData.steps || []).forEach(step => addStepRow({ instruction: step }));

            importStatus.textContent = '✅ 読み込みが完了しました。';

        } catch (error) {
            console.error("URL Import Error:", error);
            importStatus.textContent = `❌ エラー: ${error.message}`;
            alert(`レシピの読み込みに失敗しました。\n${error.message}`);
        } finally {
            importBtn.disabled = false;
        }
    };
    
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
    const loadAiGeneratedRecipe = async () => {
        const aiRecipeJson = localStorage.getItem('ai_generated_recipe');
        if (!aiRecipeJson) return false;
        try {
            const recipeData = JSON.parse(aiRecipeJson);
            titleEl.value = recipeData.title || '';
            if(recipeData.category) categoryEl.value = recipeData.category;
            tagsEl.value = (recipeData.tags || []).join(', ');
            notesEl.value = recipeData.notes || '';
            
            ingredientsEditor.innerHTML = '';
            (recipeData.ingredients || []).forEach(addIngredientRow);
            if (!recipeData.ingredients?.length) addIngredientRow();

            stepsEditor.innerHTML = '';
            (recipeData.steps || []).forEach(stepText => addStepRow({ instruction: stepText.replace(/^\d+\.\s*/, '') }));
            if (!recipeData.steps?.length) addStepRow();

            localStorage.removeItem('ai_generated_recipe');
            return true;
        } catch (e) {
            console.error("AIレシピの解析に失敗:", e);
            localStorage.removeItem('ai_generated_recipe');
            return false;
        }
    };
    const saveRecipe = async () => {
        try {
            const payload = {
                title: titleEl.value.trim(),
                category: categoryEl.value || null,
                tags: tagsEl.value.split(',').map(s => s.trim()).filter(Boolean),
                notes: notesEl.value.trim() || null,
            };
            if (!payload.title) { alert('料理名は必須です'); return; }
            statusEl.textContent = '保存中...';
            
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

            statusEl.textContent = '保存しました！';
            setTimeout(() => { location.href = `recipe_view.html?id=${recipe_id}`; }, 800);
        } catch (error) {
            console.error('Save failed:', error);
            statusEl.textContent = `保存に失敗しました。`;
            alert(`保存に失敗しました:\n${error.message}`);
        }
    };
    const deleteRecipe = async () => {
        if (!id || !confirm('このレシピを完全に削除しますか？')) return;
        statusEl.textContent = '削除中...';
        const { error } = await sb.from('recipes').delete().eq('id', id);
        if (error) {
            statusEl.textContent = '削除に失敗しました。';
            alert('削除に失敗しました: ' + error.message);
        } else {
            alert('レシピを削除しました。');
            location.href = 'index.html';
        }
    };
    
    // --- Event Listeners ---
    if (importBtn) importBtn.addEventListener('click', () => importRecipeFromUrl(urlInput.value));
    if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
    if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
    if (form) form.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-remove-row')) e.target.closest('.ingredient-row, .step-row')?.remove();
    });
    if (saveButtons) saveButtons.forEach(btn => btn.addEventListener('click', saveRecipe));
    if (cancelButtons) cancelButtons.forEach(btn => btn.addEventListener('click', () => location.href = id ? `recipe_view.html?id=${id}` : 'index.html'));
    if (viewButton) viewButton.addEventListener('click', () => { if (id) location.href = `recipe_view.html?id=${id}`; });
    if (deleteButton) deleteButton.addEventListener('click', deleteRecipe);
    if (aiWizardBtn) aiWizardBtn.addEventListener('click', openModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (aiModal) aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeModal(); });
    if (genreBtns) genreBtns.forEach(btn => btn.addEventListener('click', () => {
        genreBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGenre = btn.dataset.genre;
        getSuggestionsBtn.disabled = false;
    }));
    if (menuSuggestionsContainer) menuSuggestionsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-suggestions-item');
        if (item) {
            menuSuggestionsContainer.querySelectorAll('.menu-suggestions-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedMenu = item.dataset.menu;
            generateFullRecipeBtn.disabled = false;
        }
    });
    if (getSuggestionsBtn) getSuggestionsBtn.addEventListener('click', async () => {
        const ingredients = [...ingredientsEditor.querySelectorAll('[data-field="item"]')].map(input => input.value.trim()).filter(Boolean);
        if (ingredients.length === 0) { return alert('先に材料を1つ以上入力してください。'); }
        aiStep1.style.display = 'none';
        aiLoading.style.display = 'block';
        const customRequest = aiCustomRequestEl.value.trim();
        let prompt = `あなたはプロの${selectedGenre}シェフです。以下の材料を活かした創造的で食欲をそそる日本語のメニュー名を5つ提案してください。単なる材料の羅列ではなく、調理法や料理の特徴が伝わる名前が望ましいです。${customRequest ? `\n\n# 追加の希望\n${customRequest}` : ''}\n\n回答はメニュー名のみの配列としてJSON形式で返してください。\n\n# 材料\n- ${ingredients.join('\n- ')}`;
        try {
            const response = await callGemini(prompt, { type: "ARRAY", items: { type: "STRING" } });
            menuSuggestionsContainer.innerHTML = response.map((menu) => `<div class="menu-suggestions-item" data-menu="${escapeHtml(menu)}">${escapeHtml(menu)}</div>`).join('');
            aiLoading.style.display = 'none';
            aiStep2.style.display = 'block';
        } catch (error) {
            alert(`メニュー案の生成に失敗しました。\n${error.message}`);
            resetModal();
        }
    });
    if (generateFullRecipeBtn) generateFullRecipeBtn.addEventListener('click', async () => {
        const ingredients = [...ingredientsEditor.querySelectorAll('[data-field="item"]')].map(input => input.value.trim()).filter(Boolean);
        aiStep2.style.display = 'none';
        aiLoading.style.display = 'block';
        const customRequest = aiCustomRequestEl.value.trim();
        let prompt = `あなたは調理科学の知見を持つ革新的なシェフです。同業者であるプロ向けに、科学的根拠に基づいた実践的なルセット「${selectedMenu}」を創作してください。${customRequest ? `\n\n# 追加の希望\n${customRequest}` : ''}\n\n# ベース材料\n- ${ingredients.join('\n- ')}\n\n# 出力形式\n必ず以下のキーを含む日本語のJSONで返してください。\n- "title": 料理名\n- "category": 「アミューズ」「前菜」「温菜」「メイン」「デザート」「パン」「その他」のいずれか\n- "tags": タグの配列\n- "notes": このルセットの鍵となる調理科学的なポイント(例:メイラード反応の最適化)を解説。\n- "ingredients": 材料の配列({"item": "材料名", "quantity": 数値, "unit": "単位"})。単位はgやmlを基本とすること。\n- "steps": 手順の配列。重要な工程には科学的理由を()書きで補足。`;
        const schema = { type: "OBJECT", properties: { "title": { "type": "STRING" }, "category": { "type": "STRING" }, "tags": { "type": "ARRAY", items: { "type": "STRING" } }, "notes": { "type": "STRING" }, "ingredients": { "type": "ARRAY", items: { "type": "OBJECT", properties: { "item": { "type": "STRING" }, "quantity": { "type": "NUMBER" }, "unit": { "type": "STRING" } }, required: ["item", "quantity", "unit"] } }, "steps": { "type": "ARRAY", items: { "type": "STRING" } } }, required: ["title", "category", "tags", "notes", "ingredients", "steps"] };
        try {
            const recipeData = await callGemini(prompt, schema);
            titleEl.value = recipeData.title || '';
            if(recipeData.category) categoryEl.value = recipeData.category;
            tagsEl.value = (recipeData.tags || []).join(', ');
            notesEl.value = recipeData.notes || '';
            ingredientsEditor.innerHTML = '';
            (recipeData.ingredients || []).forEach(addIngredientRow);
            stepsEditor.innerHTML = '';
            (recipeData.steps || []).forEach(step => addStepRow({ instruction: step }));
            closeModal();
        } catch (error) {
            alert(`ルセットの生成に失敗しました。\n${error.message}`);
            resetModal();
        }
    });

    // --- Initial Load ---
    loadAiGeneratedRecipe().then(loaded => {
        if (!loaded) loadRecipe();
    });
});
