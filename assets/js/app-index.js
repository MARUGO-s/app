document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase === 'undefined') {
        alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
        return;
    }

    // Supabaseクライアントの初期化
    if (!window.APP_CONFIG) {
        console.error('config.jsが読み込まれていません');
        alert('設定ファイルの読み込みに失敗しました');
        return;
    }
    
    const sb = supabase.createClient(
        window.APP_CONFIG.SUPABASE_URL, 
        window.APP_CONFIG.SUPABASE_ANON_KEY
    );
    
    console.log('Supabaseクライアント初期化完了');

    const cardListEl = document.getElementById('cardList');
    const tabsContainer = document.querySelector('.tabs');
    const newButtons = document.querySelectorAll('.js-new');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const categoryButtons = document.querySelectorAll('.category-btn');

    if (!cardListEl || !tabsContainer) {
        console.error("Element with id 'cardList' or class 'tabs' not found.");
        return;
    }

    // デバッグ: カテゴリーボタンの確認
    console.log('カテゴリーボタン数:', categoryButtons.length);
    console.log('カテゴリーボタン:', Array.from(categoryButtons).map(btn => ({
        text: btn.textContent.trim(),
        category: btn.dataset.category
    })));

    let allRecipes = [];
    let favoriteRecipes = [];
    let currentTab = 'all';
    let currentCategoryFilter = 'all';
    let currentSearchTerm = '';
    let filteredRecipes = [];

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
        console.log('Fetching all recipes from Supabase...');
        const { data, error } = await sb.from("recipes").select("id,title,category,created_at").order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch recipes:', error);
            throw error;
        }
        console.log(`Fetched ${data?.length || 0} recipes`);
        if (data && data.length > 0) {
            console.log('レシピデータの最初の3件:', data.slice(0, 3));
            console.log('全レシピのカテゴリー一覧:', [...new Set(data.map(r => r.category || 'その他'))]);
        }
        return data || [];
    };

    const fetchFavoriteRecipes = async () => {
        console.log('Fetching favorite recipes from Supabase...');
        const { data, error } = await sb.from("favorites").select("recipes!inner(id,title,category,created_at)").eq("client_id", getClientId()).order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch favorites:', error);
            throw error;
        }
        const favorites = (data || []).map(x => x.recipes);
        console.log(`Fetched ${favorites.length} favorite recipes`);
        return favorites;
    };

    const updateStats = () => {
        const totalRecipes = allRecipes.length;
        const favoriteCount = favoriteRecipes.length;

        const totalEl = document.getElementById('totalRecipes');
        const favoriteEl = document.getElementById('favoriteRecipes');
        
        if (totalEl) totalEl.textContent = totalRecipes;
        if (favoriteEl) favoriteEl.textContent = favoriteCount;
    };



    const filterRecipes = () => {
        let recipes = currentTab === 'favorites' ? favoriteRecipes : allRecipes;

        // デバッグ: レシピのカテゴリー情報を出力
        if (currentCategoryFilter !== 'all') {
            console.log('レシピカテゴリー一覧:', recipes.map(r => r.category || 'その他'));
        }

        // カテゴリーフィルター
        if (currentCategoryFilter !== 'all' && currentCategoryFilter !== 'favorites') {
            recipes = recipes.filter(r => (r.category || 'その他') === currentCategoryFilter);
        }

        // 検索フィルター
        if (currentSearchTerm.trim()) {
            const searchLower = currentSearchTerm.toLowerCase();
            recipes = recipes.filter(r => 
                r.title.toLowerCase().includes(searchLower) ||
                (r.category && r.category.toLowerCase().includes(searchLower))
            );
        }

        filteredRecipes = recipes;
        return recipes;
    };
    
    const renderCards = (recipes) => {
        cardListEl.innerHTML = '';
        
        if (!recipes || recipes.length === 0) {
            const emptyMessage = document.getElementById('empty-message');
            if (currentSearchTerm.trim()) {
                cardListEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <h2>検索結果が見つかりません</h2>
                        <p>"${escapeHtml(currentSearchTerm)}" に一致するレシピがありません。</p>
                        <button class="btn primary" onclick="clearSearch()">
                            <i class="fas fa-times"></i>
                            検索をクリア
                        </button>
                    </div>
                `;
            } else if (currentCategoryFilter !== 'all') {
                // カテゴリーフィルター時の空メッセージ
                cardListEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-folder-open"></i>
                        </div>
                        <h2>「${currentCategoryFilter}」のレシピがありません</h2>
                        <p>このカテゴリーにはまだレシピが登録されていません。</p>
                        <button class="btn primary js-new">
                            <i class="fas fa-plus"></i>
                            新規レシピを作成
                        </button>
                    </div>
                `;
            } else {
                emptyMessage.style.display = 'block';
            }
            return;
        }

        document.getElementById('empty-message').style.display = 'none';

        // カテゴリーでグループ化（すべて表示時のみ）
        if (currentTab === 'all' && !currentSearchTerm.trim()) {
            const groupedRecipes = recipes.reduce((acc, recipe) => {
                const category = recipe.category || 'その他';
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(recipe);
                return acc;
            }, {});

            const categoryOrder = ['アミューズ', '前菜', 'スープ', 'パスタ', '魚料理', '肉料理', 'メイン', 'デザート', 'パン', 'その他'];
            const sortedCategories = Object.keys(groupedRecipes).sort((a, b) => {
                const indexA = categoryOrder.indexOf(a);
                const indexB = categoryOrder.indexOf(b);
                if (indexA > -1 && indexB > -1) return indexA - indexB;
                if (indexA > -1) return -1;
                if (indexB > -1) return 1;
                return a.localeCompare(b);
            });

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
            // フィルター時はシンプルなグリッド表示
            cardListEl.className = 'card-grid';
            recipes.forEach(r => {
                cardListEl.appendChild(createRecipeCard(r));
            });
        }
    };

    const createRecipeCard = (recipe) => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        
        const date = new Date(recipe.created_at);
        const formattedDate = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const isFavorite = favoriteRecipes.some(fav => fav.id === recipe.id);
        
        card.innerHTML = `
            <div class="recipe-header">
                <h3 class="recipe-title">${escapeHtml(recipe.title)}</h3>
                <button class="favorite-btn ${isFavorite ? 'is-favorite' : ''}" data-recipe-id="${recipe.id}">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
        `;
        
        return card;
    };

    const updateView = () => {
        cardListEl.className = '';
        const recipes = filterRecipes();
        renderCards(recipes);
        updateCategoryButtons();
    };



    const setupTabs = () => {
        tabsContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('.tab');
            if (tab) {
                currentTab = tab.dataset.tab;
                updateActiveTab();
                updateView();
            }
        });
        updateActiveTab();
    };

    const updateActiveTab = () => {
        tabsContainer.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('is-active', t.dataset.tab === currentTab);
        });
    };

    const updateCategoryButtons = () => {
        categoryButtons.forEach(btn => {
            const category = btn.dataset.category;
            btn.classList.toggle('active', category === currentCategoryFilter);
        });
    };

    const setupSearch = () => {
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchTerm = e.target.value;
                searchClear.style.display = currentSearchTerm ? 'block' : 'none';
                updateView();
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearSearch();
                }
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', clearSearch);
        }
    };

    const clearSearch = () => {
        if (searchInput) {
            searchInput.value = '';
            currentSearchTerm = '';
            searchClear.style.display = 'none';
            updateView();
        }
    };

    const setupCategoryFilter = () => {
        console.log('setupCategoryFilter 開始');
        
        // 既存のイベントリスナーを削除して重複を防ぐ
        const categoryFilter = document.querySelector('.category-filter');
        if (categoryFilter) {
            // 新しいイベントリスナーを設定（イベント委譲を使用）
            categoryFilter.removeEventListener('click', handleCategoryClick);
            categoryFilter.addEventListener('click', handleCategoryClick);
        }
        
        // 現在のボタン数をログ出力
        const currentButtons = document.querySelectorAll('.category-btn');
        console.log('現在のカテゴリーボタン数:', currentButtons.length);
        currentButtons.forEach((btn, index) => {
            console.log(`ボタン${index}: テキスト="${btn.textContent.trim()}", data-category="${btn.dataset.category}"`);
        });
    };

    // カテゴリーボタンクリックハンドラー（イベント委譲で動的ボタンにも対応）
    const handleCategoryClick = (e) => {
        if (e.target.classList.contains('category-btn')) {
            const btn = e.target;
            console.log('=== カテゴリーボタンクリック ===');
            console.log('クリックされたボタン:', btn.textContent.trim());
            console.log('data-category:', btn.dataset.category);
            
            currentCategoryFilter = btn.dataset.category;
            console.log('現在のカテゴリーフィルター:', currentCategoryFilter);
            console.log('全レシピ数:', allRecipes.length);
            
            // allRecipesの中身を詳しく見る
            if (allRecipes.length > 0) {
                console.log('レシピサンプル:', allRecipes.slice(0, 3).map(r => ({
                    title: r.title,
                    category: r.category
                })));
            }
            
            const filteredRecipes = filterRecipes();
            console.log('フィルター後レシピ数:', filteredRecipes.length);
            console.log('フィルター後レシピ:', filteredRecipes.map(r => r.title));
            
            updateView();
        }
    };



    const setupFavoriteToggle = () => {
        cardListEl.addEventListener('click', async (e) => {
            const favoriteBtn = e.target.closest('.favorite-btn');
            if (favoriteBtn) {
                e.stopPropagation();
                const recipeId = favoriteBtn.dataset.recipeId;
                const isFavorite = favoriteBtn.classList.contains('is-favorite');
                
                try {
                    if (isFavorite) {
                        await sb.from('favorites').delete()
                            .eq('recipe_id', recipeId)
                            .eq('client_id', getClientId());
                    } else {
                        await sb.from('favorites').insert({
                            recipe_id: recipeId,
                            client_id: getClientId()
                        });
                    }
                    
                    // お気に入りリストを再取得
                    favoriteRecipes = await fetchFavoriteRecipes();
                    updateStats();
                    updateView();
                } catch (error) {
                    console.error('Failed to toggle favorite:', error);
                }
            }
        });
    };

    // 動的カテゴリーの読み込み
    const loadDynamicCategories = async () => {
        try {
            console.log('動的カテゴリーを読み込み中...');
            
            // データベースからカスタムカテゴリーを取得
            const { data: customCategories, error } = await sb.from('categories').select('name').order('name');
            if (error) {
                // テーブルが存在しない場合はスキップ
                if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
                    console.log('categoriesテーブルがまだ作成されていません');
                    return;
                }
                console.log('カスタムカテゴリーの取得をスキップ:', error.message);
                return;
            }
            
            if (customCategories && customCategories.length > 0) {
                const categoryFilter = document.querySelector('.category-filter');
                if (categoryFilter) {
                    customCategories.forEach(cat => {
                        // 既存のボタンと重複チェック
                        const existingBtn = Array.from(categoryFilter.querySelectorAll('.category-btn'))
                            .find(btn => btn.dataset.category === cat.name);
                        
                        if (!existingBtn) {
                            // 新しいカテゴリーボタンを作成
                            const newBtn = document.createElement('button');
                            newBtn.className = 'category-btn';
                            newBtn.dataset.category = cat.name;
                            newBtn.textContent = cat.name;
                            
                            // カテゴリーフィルターに追加
                            categoryFilter.appendChild(newBtn);
                            
                            console.log('カテゴリーボタンを追加:', cat.name);
                        }
                    });
                    
                    console.log('動的カテゴリーボタン追加完了');
                }
            }
            
            // 新しく追加されたカテゴリーの通知をチェック
            const newCategoryData = localStorage.getItem('newCategoryAdded');
            if (newCategoryData) {
                const categoryInfo = JSON.parse(newCategoryData);
                // 5分以内に追加されたものは通知表示
                if (Date.now() - categoryInfo.timestamp < 5 * 60 * 1000) {
                    console.log('新しいカテゴリーが追加されました:', categoryInfo.name);
                }
                // 通知済みなので削除
                localStorage.removeItem('newCategoryAdded');
            }
            
            // 削除されたカテゴリーの通知をチェック
            const deletedCategoryData = localStorage.getItem('categoryDeleted');
            if (deletedCategoryData) {
                const categoryInfo = JSON.parse(deletedCategoryData);
                console.log('カテゴリーが削除されました:', categoryInfo.name);
                
                // 即座に画面からカテゴリーボタンを削除
                removeDeletedCategoryButton(categoryInfo.name);
                
                // 通知済みなので削除
                localStorage.removeItem('categoryDeleted');
            }
            
        } catch (error) {
            console.error('動的カテゴリー読み込みエラー:', error);
        }
    };

    // 削除されたカテゴリーボタンを画面から除去する関数
    const removeDeletedCategoryButton = (categoryName) => {
        console.log('カテゴリーボタン削除を実行:', categoryName);
        
        const categoryFilter = document.querySelector('.category-filter');
        if (categoryFilter) {
            // 複数の方法でボタンを検索・削除
            const buttonsToRemove = Array.from(categoryFilter.querySelectorAll('.category-btn'))
                .filter(btn => 
                    btn.dataset.category === categoryName || 
                    btn.textContent.trim() === categoryName
                );
            
            buttonsToRemove.forEach(btn => {
                btn.remove();
                console.log('カテゴリーボタンを削除しました:', categoryName);
            });
            
            // 削除されたカテゴリーが現在選択中の場合、"すべて"にリセット
            if (currentCategoryFilter === categoryName) {
                currentCategoryFilter = 'all';
                updateCategoryButtons();
                updateView();
                console.log('フィルターを"すべて"にリセットしました');
            } else {
                // ボタンの選択状態を更新
                updateCategoryButtons();
            }
            
            // ボタンが削除されたかを確認
            const remainingButtons = Array.from(categoryFilter.querySelectorAll('.category-btn'))
                .filter(btn => btn.dataset.category === categoryName);
            
            if (remainingButtons.length === 0) {
                console.log('カテゴリーボタンの削除完了:', categoryName);
            } else {
                console.warn('まだカテゴリーボタンが残っています:', categoryName, remainingButtons.length);
            }
        }
    };

    // ページ読み込み時にも削除通知をチェック
    const checkForDeletedCategories = () => {
        const deletedCategoryData = localStorage.getItem('categoryDeleted');
        if (deletedCategoryData) {
            try {
                const categoryInfo = JSON.parse(deletedCategoryData);
                console.log('ページ読み込み時にカテゴリー削除通知を検出:', categoryInfo.name);
                removeDeletedCategoryButton(categoryInfo.name);
                localStorage.removeItem('categoryDeleted');
            } catch (e) {
                console.error('削除通知の解析エラー:', e);
                localStorage.removeItem('categoryDeleted');
            }
        }
    };

    // イベントリスナーの設定
    if (newButtons) {
        newButtons.forEach(btn => btn.addEventListener('click', () => location.href = 'recipe_edit.html'));
    }

    // 空の状態の新規作成ボタン
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-new-empty')) {
            location.href = 'recipe_edit.html';
        }
    });

    cardListEl.addEventListener('click', (e) => {
        const card = e.target.closest('.recipe-card');
        if (card && !e.target.closest('.favorite-btn')) {
            location.href = `recipe_view.html?id=${encodeURIComponent(card.dataset.id)}`;
        }
    });

    const init = async () => {
        cardListEl.innerHTML = '<div class="loading-spinner"></div>';
        
        try {
            console.log('Fetching recipes...');
            const [allResult, favResult] = await Promise.allSettled([
                fetchAllRecipes(), 
                fetchFavoriteRecipes()
            ]);

            if (allResult.status === 'rejected') {
                console.error('Failed to fetch all recipes:', allResult.reason);
            }
            if (favResult.status === 'rejected') {
                console.error('Failed to fetch favorites:', favResult.reason);
            }

            allRecipes = allResult.status === 'fulfilled' ? allResult.value : [];
            favoriteRecipes = favResult.status === 'fulfilled' ? favResult.value : [];

            console.log(`Loaded ${allRecipes.length} recipes, ${favoriteRecipes.length} favorites`);
            console.log('allRecipes配列:', allRecipes);
            console.log('現在のカテゴリーフィルター:', currentCategoryFilter);
            updateStats();
            updateView();
            setupTabs();
            setupSearch();
            console.log('セットアップ関数を実行中...');
            setupCategoryFilter();
            setupFavoriteToggle();
            checkForDeletedCategories(); // ページ読み込み時の削除通知チェック
            await loadDynamicCategories(); // 動的カテゴリーの読み込み
            console.log('初期化完了');
        } catch (error) {
            console.error('Failed to initialize:', error);
            cardListEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2>データの読み込みに失敗しました</h2>
                    <p>エラー: ${error.message}</p>
                    <button class="btn primary" onclick="location.reload()">
                        <i class="fas fa-redo"></i>
                        再読み込み
                    </button>
                </div>
            `;
        }
    };

    // グローバル関数として公開
    window.clearSearch = clearSearch;

    // ページの可視性変更時に削除通知をチェック
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('ページが表示されました - 削除通知をチェック');
            setTimeout(checkForDeletedCategories, 100);
        }
    });

    // フォーカス時にも削除通知をチェック
    window.addEventListener('focus', () => {
        console.log('ウィンドウにフォーカス - 削除通知をチェック');
        setTimeout(checkForDeletedCategories, 100);
    });

    init();
});