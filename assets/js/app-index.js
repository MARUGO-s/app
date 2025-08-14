document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase === 'undefined') {
        alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
        return;
    }

    const sb = supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");

    const cardListEl = document.getElementById('cardList');
    const tabsContainer = document.querySelector('.tabs');
    const newButtons = document.querySelectorAll('.js-new');

    if (!cardListEl || !tabsContainer) {
        console.error("Element with id 'cardList' or class 'tabs' not found.");
        return;
    }

    let allRecipes = [];
    let favoriteRecipes = [];
    let currentCategoryFilter = 'all'; // 現在選択中のカテゴリーフィルター

    const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>\"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
    
    const getClientId = () => {
        let clientId = localStorage.getItem("client_id");
        if (!clientId) {
            clientId = crypto?.randomUUID?.() || String(Math.random()).slice(2);
            localStorage.setItem("client_id", clientId);
        }
        return clientId;
    };

    const fetchAllRecipes = async () => {
        const { data, error } = await sb.from("recipes").select("id,title,category,created_at").order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch recipes:', error);
            return [];
        }
        return data;
    };

    const fetchFavoriteRecipes = async () => {
        const { data, error } = await sb.from("favorites").select("recipes!inner(id,title,category,created_at)").eq("client_id", getClientId()).order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch favorites:', error);
            return [];
        }
        return (data || []).map(x => x.recipes);
    };
    
    // ★★★ 不具合があった描画関数を完全に修正 ★★★
    const renderCards = (recipes) => {
        cardListEl.innerHTML = '';
        if (!recipes || recipes.length === 0) {
            cardListEl.innerHTML = '<div class="empty">該当するレシピがありません。</div>';
            return;
        }

        // カテゴリーでグループ化
        const groupedRecipes = recipes.reduce((acc, recipe) => {
            const category = recipe.category || 'その他';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(recipe);
            return acc;
        }, {});

        // カテゴリーの表示順を定義
        const categoryOrder = ['アミューズ', '前菜', 'スープ', 'パスタ', '魚料理', '肉料理', 'メイン', 'デザート', 'パン', 'その他'];
        const sortedCategories = Object.keys(groupedRecipes).sort((a, b) => {
            const indexA = categoryOrder.indexOf(a);
            const indexB = categoryOrder.indexOf(b);
            if (indexA > -1 && indexB > -1) return indexA - indexB;
            if (indexA > -1) return -1;
            if (indexB > -1) return 1;
            return a.localeCompare(b);
        });

        // フィルターがかかっていない（＝すべて表示）の場合のみカテゴリーヘッダーを表示
        const shouldShowHeaders = currentCategoryFilter === 'all';

        if (shouldShowHeaders) {
            sortedCategories.forEach(category => {
                const categorySection = document.createElement('section');
                categorySection.className = 'category-section';
                const header = document.createElement('h2');
                header.className = 'category-header';
                header.textContent = category;
                categorySection.appendChild(header);

                const recipeGroup = document.createElement('div');
                recipeGroup.className = 'recipe-group';
                groupedRecipes[category].forEach(r => {
                    recipeGroup.appendChild(createRecipeCard(r));
                });
                categorySection.appendChild(recipeGroup);
                cardListEl.appendChild(categorySection);
            });
        } else {
            // カテゴリーでフィルターされている場合は、ヘッダーなしでカードを直接グリッド表示
            cardListEl.className = 'recipe-group'; // コンテナ自体をグリッドにする
            recipes.forEach(r => {
                cardListEl.appendChild(createRecipeCard(r));
            });
        }
    };

    // レシピカードを作成するヘルパー関数
    const createRecipeCard = (recipe) => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.innerHTML = `<span class="recipe-title">${escapeHtml(recipe.title)}</span>`;
        return card;
    };

    const updateView = () => {
        cardListEl.className = ''; // グリッドクラスをリセット
        let recipesToRender = currentCategoryFilter === 'favorites' ? favoriteRecipes : allRecipes;

        if (currentCategoryFilter !== 'all' && currentCategoryFilter !== 'favorites') {
            recipesToRender = allRecipes.filter(r => (r.category || 'その他') === currentCategoryFilter);
        }
        
        renderCards(recipesToRender);
    };

    const setupTabs = () => {
        tabsContainer.innerHTML = ''; // タブをクリア

        const tabCategories = ['all', 'favorites', ...new Set(allRecipes.map(r => r.category).filter(Boolean))].sort((a,b) => {
            if (a === 'all' || a === 'favorites') return -1;
            if (b === 'all' || b === 'favorites') return 1;
            return a.localeCompare(b);
        });
        
        const tabNames = {'all': 'すべて', 'favorites': 'お気に入り'};

        tabCategories.forEach(category => {
            const tab = document.createElement('button');
            tab.className = 'tab';
            tab.dataset.category = category;
            tab.textContent = tabNames[category] || category;
            tabsContainer.appendChild(tab);
        });

        tabsContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('.tab');
            if (tab) {
                currentCategoryFilter = tab.dataset.category;
                updateActiveTab();
                updateView();
            }
        });
        updateActiveTab();
    };

    const updateActiveTab = () => {
        tabsContainer.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('is-active', t.dataset.category === currentCategoryFilter);
        });
    };

    if (newButtons) {
        newButtons.forEach(btn => btn.addEventListener('click', () => location.href = 'recipe_edit.html'));
    }

    cardListEl.addEventListener('click', (e) => {
        const card = e.target.closest('.recipe-card');
        if (card) {
            location.href = `recipe_view.html?id=${encodeURIComponent(card.dataset.id)}`;
        }
    });

    const init = async () => {
        cardListEl.innerHTML = '<div class="empty">読み込み中...</div>';
        const [allResult, favResult] = await Promise.allSettled([fetchAllRecipes(), fetchFavoriteRecipes()]);
        
        allRecipes = allResult.status === 'fulfilled' ? allResult.value : [];
        favoriteRecipes = favResult.status === 'fulfilled' ? favResult.value : [];
        
        setupTabs();
        updateView();
    };

    init();
});