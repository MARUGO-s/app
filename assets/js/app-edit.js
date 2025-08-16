document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase === 'undefined') { 
        alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
        return;
    }

    const sb = supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");
    const params = new URLSearchParams(location.search);
    let id = params.get('id');

    // --- Element Selection ---
    const titleEl = document.getElementById('title');
    const categoryEl = document.getElementById('category');
    const tagsEl = document.getElementById('tags');
    const notesEl = document.getElementById('notes');
    const ingredientsEditor = document.getElementById('ingredientsEditor');
    const stepsEditor = document.getElementById('stepsEditor');
    const addIngBtn = document.getElementById('addIng');
    const addStepBtn = document.getElementById('addStep');
    const saveButtons = document.querySelectorAll('.js-save'); // Both save buttons
    const savingOverlay = document.getElementById('saving-overlay'); // Saving popup
    const statusEl = document.getElementById('status');

    // --- AI Modal Elements ---
    // (AIモーダル関連のセレクターは変更ありません)
    
    let selectedGenre = '';
    let selectedMenu = '';
    let finalRecipeData = null;

    // (Helper functions and Dynamic Row functions are unchanged)

    // --- CRUD Functions ---
    const saveRecipe = async () => {
        if (savingOverlay) savingOverlay.style.display = 'flex'; // Show popup

        try {
            const payload = {
                title: titleEl.value.trim(),
                category: categoryEl.value || null,
                tags: tagsEl.value.split(',').map(s => s.trim()).filter(Boolean),
                notes: notesEl.value.trim() || null,
            };
            if (!payload.title) {
                alert('料理名は必須です');
                if (savingOverlay) savingOverlay.style.display = 'none'; // Hide popup
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

            // (Ingredients and Steps saving logic is unchanged)

            if (statusEl) statusEl.textContent = '保存しました！';
            setTimeout(() => {
                location.href = `recipe_view.html?id=${recipe_id}`;
            }, 800);

        } catch (error) {
            if (savingOverlay) savingOverlay.style.display = 'none'; // Hide popup on error
            console.error('Save failed:', error);
            if (statusEl) statusEl.textContent = `保存に失敗しました。`;
            alert(`保存に失敗しました:\n${error.message}`);
        }
    };

    // (Other functions like AI Modal control are unchanged)

    // --- Event Listeners ---
    if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
    if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());

    // Attach listener to both save buttons
    if (saveButtons) saveButtons.forEach(btn => btn.addEventListener('click', saveRecipe));

    // (AI Modal event listeners are unchanged)

    // --- Initial Load ---
    addIngredientRow();
    addStepRow();
});
