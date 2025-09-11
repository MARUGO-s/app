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

    // カテゴリーボタンの確認（簡潔版）
    console.log(`📋 カテゴリーボタン: ${categoryButtons.length}個`);

    let allRecipes = [];
    let favoriteRecipes = [];
    let translatedRecipes = [];
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
        const { data, error } = await sb.from("recipes").select("id,title,category,created_at,tags").order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch recipes:', error);
            throw error;
        }
        console.log(`📚 レシピ読み込み: ${data?.length || 0}件`);
        return data || [];
    };

    const fetchFavoriteRecipes = async () => {
        const { data, error } = await sb.from("favorites").select("recipes!inner(id,title,category,created_at,tags)").eq("client_id", getClientId()).order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch favorites:', error);
            throw error;
        }
        const favorites = (data || []).map(x => x.recipes);
        console.log(`❤️ お気に入り: ${favorites.length}件`);
        return favorites;
    };

    const fetchTranslatedRecipes = async () => {
        const { data, error } = await sb.from("recipes").select("id,title,category,created_at,tags").contains("tags", ["翻訳"]).order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch translated recipes:', error);
            throw error;
        }
        console.log(`🌍 翻訳レシピ読み込み: ${data?.length || 0}件`);
        return data || [];
    };

    const updateStats = () => {
        const totalRecipes = allRecipes.length;
        const favoriteCount = favoriteRecipes.length;
        const translatedCount = translatedRecipes.length;

        const totalEl = document.getElementById('totalRecipes');
        const favoriteEl = document.getElementById('favoriteRecipes');
        const translatedEl = document.getElementById('translatedRecipes');
        
        if (totalEl) totalEl.textContent = totalRecipes;
        if (favoriteEl) favoriteEl.textContent = favoriteCount;
        if (translatedEl) translatedEl.textContent = translatedCount;
    };



    // テキストを正規化する関数（ひらがな・カタカナ変換）
    const normalizeText = (text) => {
        if (!text) return '';
        return text
            .toLowerCase() // 小文字に変換
            .replace(/[ァ-ヶ]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, match => {
                // 全角英数字→半角英数字
                const code = match.charCodeAt(0);
                if (code >= 0xFF01 && code <= 0xFF5E) {
                    return String.fromCharCode(code - 0xFEE0);
                }
                return match;
            })
            .trim();
    };

    const filterRecipes = () => {
        let recipes;
        if (currentTab === 'favorites') {
            recipes = favoriteRecipes;
            console.log(`❤️ お気に入りタブ: ${recipes.length}件`);
        } else if (currentTab === 'translated') {
            recipes = translatedRecipes;
            console.log(`🌍 翻訳タブ: ${recipes.length}件`);
        } else if (currentTab === 'updated') {
            recipes = allRecipes;
            console.log(`🔄 更新順タブ: ${recipes.length}件`);
        } else {
            recipes = allRecipes;
            console.log(`📚 すべてタブ: ${recipes.length}件`);
        }

        // 更新順タブの場合は作成日時でソート（updated_atフィールドが存在しないため）
        if (currentTab === 'updated') {
            recipes = recipes.sort((a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                return dateB - dateA; // 降順（新しい順）
            });
        }

        // カテゴリーフィルター
        if (currentCategoryFilter !== 'all' && currentCategoryFilter !== 'favorites') {
            recipes = recipes.filter(r => (r.category || 'その他') === currentCategoryFilter);
        }


        // 検索フィルター（正規化されたテキストで部分一致検索）
        if (currentSearchTerm.trim()) {
            const normalizedSearchTerm = normalizeText(currentSearchTerm);
            console.log(`🔍 検索: "${currentSearchTerm}" → "${normalizedSearchTerm}"`);
            
            recipes = recipes.filter(r => {
                const normalizedTitle = normalizeText(r.title);
                const normalizedCategory = normalizeText(r.category || '');
                
                const titleMatch = normalizedTitle.includes(normalizedSearchTerm);
                const categoryMatch = normalizedCategory.includes(normalizedSearchTerm);
                
                return titleMatch || categoryMatch;
            });
            
            console.log(`✅ 検索結果: ${recipes.length}件`);
        }

        filteredRecipes = recipes;
        return recipes;
    };
    
    const renderCards = (recipes) => {
        console.log(`🎨 レンダリング開始: ${recipes.length}件のレシピ`);
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
        console.log(`🔄 ビュー更新開始: タブ=${currentTab}, カテゴリー=${currentCategoryFilter}, 検索=${currentSearchTerm}`);
        cardListEl.className = '';
        const recipes = filterRecipes();
        console.log(`📊 フィルター結果: ${recipes.length}件`);
        renderCards(recipes);
        updateCategoryButtons();
    };



    const setupTabs = () => {
        tabsContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('.tab');
            if (tab) {
                currentTab = tab.dataset.tab;
                console.log(`🖱️ タブクリック: ${currentTab}`);
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
        // 既存のイベントリスナーを削除して重複を防ぐ
        const categoryFilter = document.querySelector('.category-filter');
        if (categoryFilter) {
            // 新しいイベントリスナーを設定（イベント委譲を使用）
            categoryFilter.removeEventListener('click', handleCategoryClick);
            categoryFilter.addEventListener('click', handleCategoryClick);
        }
        
        const currentButtons = document.querySelectorAll('.category-btn');
        console.log(`📋 カテゴリーボタン: ${currentButtons.length}個`);
    };


    // カテゴリーボタンクリックハンドラー（イベント委譲で動的ボタンにも対応）
    const handleCategoryClick = (e) => {
        if (e.target.classList.contains('category-btn')) {
            const btn = e.target;
            currentCategoryFilter = btn.dataset.category;
            console.log(`📂 カテゴリー選択: ${btn.textContent.trim()}`);
            
            const filteredRecipes = filterRecipes();
            console.log(`📊 結果: ${filteredRecipes.length}件`);
            
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
            // データベースからカスタムカテゴリーを取得
            const { data: customCategories, error } = await sb.from('categories').select('name').order('name');
            if (error) {
                // テーブルが存在しない場合はスキップ
                if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
                    return;
                }
                return;
            }
            
            if (customCategories && customCategories.length > 0) {
                const categoryFilter = document.querySelector('.category-filter');
                if (categoryFilter) {
                    let addedCount = 0;
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
                            addedCount++;
                        }
                    });
                    
                    if (addedCount > 0) {
                        console.log(`📂 カスタムカテゴリー: ${addedCount}個追加`);
                    }
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

    // 動的に生成される新規作成ボタン（イベント委譲）
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-new-empty') || e.target.classList.contains('js-new')) {
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
            const [allResult, favResult, transResult] = await Promise.allSettled([
                fetchAllRecipes(), 
                fetchFavoriteRecipes(),
                fetchTranslatedRecipes()
            ]);

            if (allResult.status === 'rejected') {
                console.error('Failed to fetch all recipes:', allResult.reason);
            }
            if (favResult.status === 'rejected') {
                console.error('Failed to fetch favorites:', favResult.reason);
            }
            if (transResult.status === 'rejected') {
                console.error('Failed to fetch translated recipes:', transResult.reason);
            }

            allRecipes = allResult.status === 'fulfilled' ? allResult.value : [];
            favoriteRecipes = favResult.status === 'fulfilled' ? favResult.value : [];
            translatedRecipes = transResult.status === 'fulfilled' ? transResult.value : [];

            console.log(`✅ 初期化完了: 全レシピ=${allRecipes.length}件, お気に入り=${favoriteRecipes.length}件, 翻訳=${translatedRecipes.length}件`);
            updateStats();
            updateView();
            setupTabs();
            setupSearch();
            setupCategoryFilter();
            setupFavoriteToggle();
            checkForDeletedCategories();
            await loadDynamicCategories();
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