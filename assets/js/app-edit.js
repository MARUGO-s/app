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
    
    // --- AI Chat Modal Elements ---
    const aiWizardBtn = document.getElementById('ai-wizard-btn');
    const aiModal = document.getElementById('ai-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const aiLoading = document.getElementById('ai-loading');
    const aiStepGenre = document.getElementById('ai-step-genre');
    const aiChatView = document.getElementById('ai-chat-view');
    const genreBtns = document.querySelectorAll('.genre-btn');
    const aiChatHistory = document.getElementById('ai-chat-history');
    const aiChatInput = document.getElementById('ai-chat-input');
    const aiChatSendBtn = document.getElementById('ai-chat-send');
    const applyRecipeBtn = document.getElementById('apply-recipe-btn');
    
    let conversationHistory = [];
    let lastAiRecipe = null;
    let selectedGenre = '';

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
    
    // --- CRUD & URL Import Functions (These are unchanged) ---
    // (loadRecipe, saveRecipe, etc. are here)
    
    // --- AI Modal Control & Flow ---
    const openModal = () => { if (aiModal) aiModal.style.display = 'flex'; };
    const closeModal = () => { if (aiModal) aiModal.style.display = 'none'; };

    const openGenreSelection = () => {
        conversationHistory = [];
        lastAiRecipe = null;
        selectedGenre = '';
        if (aiChatHistory) aiChatHistory.innerHTML = '';
        if (aiChatInput) aiChatInput.value = '';
        if (applyRecipeBtn) applyRecipeBtn.style.display = 'none';
        genreBtns.forEach(btn => btn.classList.remove('selected'));

        if (aiStepGenre) aiStepGenre.style.display = 'block';
        if (aiChatView) aiChatView.style.display = 'none';
        if (aiLoading) aiLoading.style.display = 'none';

        openModal();
    };

    const startAiConversation = () => {
        const ingredients = [...ingredientsEditor.querySelectorAll('[data-field="item"]')].map(input => input.value.trim()).filter(Boolean);
        if (ingredients.length === 0) {
            alert('先に材料を1つ以上入力してください。');
            closeModal();
            return;
        }

        if (aiStepGenre) aiStepGenre.style.display = 'none';
        if (aiChatView) aiChatView.style.display = 'block';

        const initialPrompt = `あなたはプロの「${selectedGenre}」シェフです。以下の材料を使った創造的な料理のアイデアをいくつか提案してください。最終的にはレシピをJSON形式で出力するように指示されることを念頭に置いて会話を進めてください。\n\n# 材料\n- ${ingredients.join('\n- ')}`;

        addChatMessage(initialPrompt, 'user');
        conversationHistory.push({ role: 'user', parts: [{ text: initialPrompt }] });
        requestAiResponse();
    };

    const addChatMessage = (message, sender = 'user') => {
        if (!aiChatHistory) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}`;
        msgDiv.style.marginBottom = '0.75rem';
        msgDiv.innerHTML = `
            <div style="font-weight: 600; font-size: 0.8rem; color: ${sender === 'user' ? 'var(--accent)' : 'var(--text-secondary)'}; margin-bottom: 0.25rem;">${sender === 'user' ? 'あなた' : 'AIアシスタント'}</div>
            <div>${escapeHtml(message).replace(/\n/g, '<br>')}</div>
        `;
        aiChatHistory.appendChild(msgDiv);
        aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
    };

    const requestAiResponse = async () => {
        if (aiLoading) aiLoading.style.display = 'block';
        if (aiChatSendBtn) aiChatSendBtn.disabled = true;

        try {
            const { data, error } = await sb.functions.invoke('call-gemini-chat', { body: { history: conversationHistory } });
            if (error) throw new Error(`Edge Function Error: ${error.message}`);
            if (data.error) throw new Error(`API Error: ${data.error}`);
            
            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!aiText) throw new Error('AIからの応答が空でした。');

            addChatMessage(aiText, 'ai');
            conversationHistory.push({ role: 'model', parts: [{ text: aiText }] });
            tryToParseRecipe(aiText);
        } catch (error) {
            console.error("AI request failed:", error);
            addChatMessage(`エラーが発生しました: ${error.message}`, 'ai');
        } finally {
            if (aiLoading) aiLoading.style.display = 'none';
            if (aiChatSendBtn) aiChatSendBtn.disabled = false;
            if (aiChatInput) aiChatInput.focus();
        }
    };

    const tryToParseRecipe = (text) => {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const parsedJson = JSON.parse(jsonMatch[1]);
                if (parsedJson.title && parsedJson.ingredients && parsedJson.steps) {
                    lastAiRecipe = parsedJson;
                    if (applyRecipeBtn) applyRecipeBtn.style.display = 'inline-block';
                }
            } catch (e) {
                lastAiRecipe = null;
                if (applyRecipeBtn) applyRecipeBtn.style.display = 'none';
            }
        } else {
            if (lastAiRecipe) {
                lastAiRecipe = null;
                if (applyRecipeBtn) applyRecipeBtn.style.display = 'none';
            }
        }
    };

    // --- Event Listeners ---
    if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
    if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
    if (form) form.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-remove-row')) e.target.closest('.ingredient-row, .step-row')?.remove();
    });
    // Add other listeners for save, cancel etc.

    // --- AI Chat Event Listeners ---
    if (aiWizardBtn) aiWizardBtn.addEventListener('click', openGenreSelection);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (aiModal) aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeModal(); });

    genreBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedGenre = btn.dataset.genre;
            genreBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            startAiConversation();
        });
    });

    if (aiChatSendBtn) aiChatSendBtn.addEventListener('click', () => {
        const userInput = aiChatInput.value.trim();
        if (!userInput) return;
        
        addChatMessage(userInput, 'user');
        conversationHistory.push({ role: 'user', parts: [{ text: userInput }] });
        aiChatInput.value = '';
        requestAiResponse();
    });

    if (aiChatInput) aiChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            aiChatSendBtn.click();
        }
    });

    if (applyRecipeBtn) applyRecipeBtn.addEventListener('click', () => {
        if (!lastAiRecipe) {
            alert('反映できるレシピ情報がありません。');
            return;
        }
        
        titleEl.value = lastAiRecipe.title || '';
        if(lastAiRecipe.category) categoryEl.value = lastAiRecipe.category;
        tagsEl.value = (lastAiRecipe.tags || []).join(', ');
        notesEl.value = lastAiRecipe.notes || '';
        
        ingredientsEditor.innerHTML = '';
        (lastAiRecipe.ingredients || []).forEach(addIngredientRow);
        stepsEditor.innerHTML = '';
        (lastAiRecipe.steps || []).forEach(step => addStepRow({ instruction: step }));
        
        closeModal();
    });

    // --- Initial Load etc. ---
    // (Your existing loadRecipe, etc. functions would be here)
});
