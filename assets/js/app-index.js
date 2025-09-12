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
    
    // 一括選択機能用の変数
    let isBulkMode = false;
    let selectedRecipes = new Set();

    // escapeHtml関数は utils.js で定義済み
    
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
        const isSelected = selectedRecipes.has(recipe.id);
        
        card.innerHTML = `
            <div class="bulk-checkbox"></div>
            <div class="recipe-header">
                <h3 class="recipe-title">${escapeHtml(recipe.title)}</h3>
                <button class="favorite-btn ${isFavorite ? 'is-favorite' : ''}" data-recipe-id="${recipe.id}">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
        `;
        
        // 一括選択モードの場合は選択状態を設定
        if (isBulkMode) {
            card.classList.add('bulk-mode');
            if (isSelected) {
                card.classList.add('selected');
            }
        }
        
        return card;
    };

    const updateView = () => {
        console.log(`🔄 ビュー更新開始: タブ=${currentTab}, カテゴリー=${currentCategoryFilter}, 検索=${currentSearchTerm}`);
        cardListEl.className = '';
        const recipes = filterRecipes();
        console.log(`📊 フィルター結果: ${recipes.length}件`);
        renderCards(recipes);
        updateCategoryButtons();
        updateBulkSelectionUI();
        updateBulkSelectionButtons();
    };

    const updateBulkSelectionButtons = () => {
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        const recipes = filterRecipes();
        
        // レシピが存在する場合のみ一括選択ボタンを表示
        if (bulkSelectBtn) {
            bulkSelectBtn.style.display = recipes.length > 0 ? 'inline-flex' : 'none';
        }
        
        if (bulkPdfBtn && !isBulkMode) {
            bulkPdfBtn.style.display = 'none';
        }
    };

    // 一括選択機能の関数
    const toggleBulkMode = () => {
        isBulkMode = !isBulkMode;
        selectedRecipes.clear();
        
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        const bulkUI = document.getElementById('bulk-selection-ui');
        
        if (isBulkMode) {
            bulkSelectBtn.textContent = '選択終了';
            bulkSelectBtn.innerHTML = '<i class="fas fa-times"></i> 選択終了';
            bulkPdfBtn.style.display = 'inline-flex';
            bulkUI.style.display = 'block';
        } else {
            bulkSelectBtn.textContent = '一括選択';
            bulkSelectBtn.innerHTML = '<i class="fas fa-check-square"></i> 一括選択';
            bulkPdfBtn.style.display = 'none';
            bulkUI.style.display = 'none';
        }
        
        updateView();
    };

    const updateBulkSelectionUI = () => {
        const selectedCount = document.getElementById('selected-count');
        const createBookBtn = document.querySelector('.js-create-recipe-book');
        const bulkDeleteBtn = document.querySelector('.js-bulk-delete');
        
        if (selectedCount) {
            selectedCount.textContent = selectedRecipes.size;
        }
        
        if (createBookBtn) {
            createBookBtn.disabled = selectedRecipes.size === 0;
        }
        
        if (bulkDeleteBtn) {
            bulkDeleteBtn.disabled = selectedRecipes.size === 0;
        }
    };

    const toggleRecipeSelection = (recipeId) => {
        if (selectedRecipes.has(recipeId)) {
            selectedRecipes.delete(recipeId);
        } else {
            selectedRecipes.add(recipeId);
        }
        updateBulkSelectionUI();
        updateRecipeCardSelection(recipeId);
    };

    // 個別のレシピカードの選択状態のみを更新（全体の再描画を避ける）
    const updateRecipeCardSelection = (recipeId) => {
        const card = document.querySelector(`.recipe-card[data-id="${recipeId}"]`);
        if (card) {
            const isSelected = selectedRecipes.has(recipeId);
            card.classList.toggle('selected', isSelected);
        }
    };

    const selectAllRecipes = () => {
        const recipes = filterRecipes();
        recipes.forEach(recipe => {
            selectedRecipes.add(recipe.id);
            updateRecipeCardSelection(recipe.id);
        });
        updateBulkSelectionUI();
    };

    const deselectAllRecipes = () => {
        // 現在選択されているレシピの選択状態をクリア
        selectedRecipes.forEach(recipeId => {
            updateRecipeCardSelection(recipeId);
        });
        selectedRecipes.clear();
        updateBulkSelectionUI();
    };

    // 一括削除機能
    const bulkDeleteRecipes = async () => {
        if (selectedRecipes.size === 0) {
            alert('削除するレシピを選択してください。');
            return;
        }

        // 削除確認モーダルを表示
        showBulkDeleteModal();
    };

    // 削除確認モーダルを表示
    const showBulkDeleteModal = () => {
        const modal = document.getElementById('bulk-delete-modal');
        const countElement = document.getElementById('delete-count-number');
        const recipeListElement = document.getElementById('delete-recipe-list');
        
        if (!modal || !countElement || !recipeListElement) {
            console.error('削除確認モーダルの要素が見つかりません');
            return;
        }

        // 削除対象のレシピ情報を取得
        const selectedRecipeIds = Array.from(selectedRecipes);
        const selectedRecipesData = allRecipes.filter(recipe => 
            selectedRecipeIds.includes(recipe.id)
        );

        // 削除件数を表示
        countElement.textContent = selectedRecipesData.length;

        // 削除対象レシピ一覧を表示
        recipeListElement.innerHTML = '';
        selectedRecipesData.forEach(recipe => {
            const item = document.createElement('div');
            item.className = 'delete-recipe-item';
            item.innerHTML = `
                <i class="fas fa-utensils"></i>
                <span>${escapeHtml(recipe.title)}</span>
            `;
            recipeListElement.appendChild(item);
        });

        // モーダルを表示
        modal.style.display = 'flex';
    };

    // 削除確認モーダルを非表示
    const hideBulkDeleteModal = () => {
        const modal = document.getElementById('bulk-delete-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    // 実際の削除処理を実行
    const executeBulkDelete = async () => {
        try {
            const selectedRecipeIds = Array.from(selectedRecipes);
            const selectedCount = selectedRecipeIds.length;
            console.log('削除対象のレシピID:', selectedRecipeIds);

            // 削除確認モーダルを非表示
            hideBulkDeleteModal();

            // 関連データも含めて削除
            const deletePromises = [
                // お気に入りから削除
                sb.from('favorites').delete().in('recipe_id', selectedRecipeIds),
                // 材料データを削除
                sb.from('recipe_ingredients').delete().in('recipe_id', selectedRecipeIds),
                // 手順データを削除
                sb.from('recipe_steps').delete().in('recipe_id', selectedRecipeIds),
                // レシピ本体を削除
                sb.from('recipes').delete().in('id', selectedRecipeIds)
            ];

            await Promise.all(deletePromises);
            
            console.log(`${selectedCount}件のレシピを削除しました`);
            alert(`${selectedCount}件のレシピを削除しました。`);

            // データを再読み込み
            const [allResult, favResult, transResult] = await Promise.allSettled([
                fetchAllRecipes(), 
                fetchFavoriteRecipes(),
                fetchTranslatedRecipes()
            ]);

            allRecipes = allResult.status === 'fulfilled' ? allResult.value : [];
            favoriteRecipes = favResult.status === 'fulfilled' ? favResult.value : [];
            translatedRecipes = transResult.status === 'fulfilled' ? transResult.value : [];

            // 一括選択モードを終了
            isBulkMode = false;
            selectedRecipes.clear();
            
            // UIを更新
            updateStats();
            updateView();
            
        } catch (error) {
            console.error('一括削除エラー:', error);
            alert('レシピの削除に失敗しました。');
        }
    };

    // 進行状況管理機能
    const showProgressPopup = () => {
        const popup = document.getElementById('progress-popup');
        if (popup) {
            popup.style.display = 'flex';
        }
    };

    const hideProgressPopup = () => {
        const popup = document.getElementById('progress-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    };

    const updateProgressStep = (stepId, status) => {
        const step = document.getElementById(stepId);
        if (!step) return;

        // すべてのステップからactiveクラスを削除
        document.querySelectorAll('.progress-step').forEach(s => {
            s.classList.remove('active', 'completed');
        });

        if (status === 'active') {
            step.classList.add('active');
        } else if (status === 'completed') {
            step.classList.add('completed');
        }
    };

    const updateProgressBar = (percentage) => {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(percentage)}%`;
        }
    };

    const updateProgressInfo = (message) => {
        const progressInfo = document.getElementById('progress-info');
        if (progressInfo) {
            progressInfo.textContent = message;
        }
    };

    const showCompletionMessage = () => {
        const progressInfo = document.getElementById('progress-info');
        const completionMessage = document.getElementById('progress-completion-message');
        
        if (progressInfo) {
            progressInfo.style.display = 'none';
        }
        
        if (completionMessage) {
            completionMessage.style.display = 'flex';
        }
    };

    // サイトリセット機能
    const resetSite = () => {
        console.log('サイトをリセット中...');
        
        // 一括選択モードを終了
        isBulkMode = false;
        selectedRecipes.clear();
        
        // 一括選択UIを非表示
        const bulkUI = document.getElementById('bulk-selection-ui');
        if (bulkUI) {
            bulkUI.style.display = 'none';
        }
        
        // 一括選択ボタンの状態をリセット
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        if (bulkSelectBtn) {
            bulkSelectBtn.textContent = '一括選択';
            bulkSelectBtn.innerHTML = '<i class="fas fa-check-square"></i> 一括選択';
        }
        
        // レシピブック作成ボタンを非表示
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        if (bulkPdfBtn) {
            bulkPdfBtn.style.display = 'none';
        }
        
        // すべてのレシピカードから選択状態をクリア
        document.querySelectorAll('.recipe-card').forEach(card => {
            card.classList.remove('bulk-mode', 'selected');
        });
        
        // 選択カウントをリセット
        updateBulkSelectionUI();
        
        // ビューを更新
        updateView();
        
        console.log('サイトリセット完了');
    };

    // レシピブック作成機能
    const createRecipeBook = async () => {
        if (selectedRecipes.size === 0) {
            alert('レシピを選択してください。');
            return;
        }

        // 進行状況ポップアップを表示
        showProgressPopup();
        updateProgressStep('step-data-loading', 'active');
        updateProgressBar(0);
        updateProgressInfo('レシピデータの取得を開始しています...');

        try {
            // 選択されたレシピの詳細データを取得
            const selectedRecipeIds = Array.from(selectedRecipes);
            console.log('選択されたレシピID:', selectedRecipeIds);
            
            // バックグラウンドで並列にデータを取得
            updateProgressInfo('レシピ情報をデータベースから取得中...');
            updateProgressBar(10);
            
            const [recipesResult, ingredientsResult, stepsResult] = await Promise.allSettled([
                // レシピ基本データ
                sb.from('recipes').select('*').in('id', selectedRecipeIds),
                // 材料データ
                sb.from('recipe_ingredients').select('*').in('recipe_id', selectedRecipeIds).order('position'),
                // 手順データ
                sb.from('recipe_steps').select('*').in('recipe_id', selectedRecipeIds).order('position')
            ]);

            if (recipesResult.status === 'rejected') {
                console.error('レシピデータの取得に失敗:', recipesResult.reason);
                alert('レシピデータの取得に失敗しました。');
                hideProgressPopup();
                return;
            }

            const recipes = recipesResult.value.data;
            if (!recipes || recipes.length === 0) {
                alert('選択されたレシピが見つかりません。');
                hideProgressPopup();
                return;
            }

            console.log('取得されたレシピデータ:', recipes);
            
            // データ読み込み完了
            updateProgressStep('step-data-loading', 'completed');
            updateProgressStep('step-cover-generation', 'active');
            updateProgressBar(20);
            updateProgressInfo('データの読み込みが完了しました。表紙を生成中...');
            
            // 材料と手順データをレシピIDでグループ化
            const ingredientsByRecipe = {};
            const stepsByRecipe = {};
            
            if (ingredientsResult.status === 'fulfilled' && ingredientsResult.value.data) {
                ingredientsResult.value.data.forEach(ing => {
                    if (!ingredientsByRecipe[ing.recipe_id]) {
                        ingredientsByRecipe[ing.recipe_id] = [];
                    }
                    ingredientsByRecipe[ing.recipe_id].push(ing);
                });
            }
            
            if (stepsResult.status === 'fulfilled' && stepsResult.value.data) {
                stepsResult.value.data.forEach(step => {
                    if (!stepsByRecipe[step.recipe_id]) {
                        stepsByRecipe[step.recipe_id] = [];
                    }
                    stepsByRecipe[step.recipe_id].push(step);
                });
            }
            
            // レシピデータに材料と手順を追加
            const recipesWithDetails = recipes.map(recipe => {
                const recipeWithDetails = {
                    ...recipe,
                    ingredients: ingredientsByRecipe[recipe.id] || [],
                    steps: stepsByRecipe[recipe.id] || []
                };
                
                console.log(`レシピ ${recipe.title} の詳細:`, {
                    id: recipe.id,
                    title: recipe.title,
                    category: recipe.category,
                    ingredients: recipeWithDetails.ingredients,
                    steps: recipeWithDetails.steps,
                    notes: recipe.notes
                });
                
                return recipeWithDetails;
            });

            // レシピブックPDFを生成
            await generateRecipeBookPDF(recipesWithDetails);
            
        } catch (error) {
            console.error('レシピブック作成エラー:', error);
            alert('レシピブックの作成に失敗しました。');
        } finally {
            // 進行状況ポップアップを非表示してサイトをリセット
            hideProgressPopup();
            resetSite();
        }
    };

    // レシピブックPDF生成関数（改良された構文を使用）
    const generateRecipeBookPDF = async (recipes) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // 日本語フォント設定
        try {
            doc.setFont('helvetica');
        } catch (fontError) {
            console.warn('フォント設定エラー:', fontError);
        }

        // 表紙をHTML形式で生成
        updateProgressInfo('レシピブックの表紙を作成中...');
        await generateRecipeBookCover(doc, recipes);
        updateProgressStep('step-cover-generation', 'completed');
        updateProgressStep('step-toc-generation', 'active');
        updateProgressBar(40);
        
        // 目次をHTML形式で生成
        updateProgressInfo('目次を作成中...');
        await generateRecipeBookTOC(doc, recipes);
        updateProgressStep('step-toc-generation', 'completed');
        updateProgressStep('step-recipes-generation', 'active');
        updateProgressBar(60);

        // 各レシピの詳細ページをHTML形式で生成
        for (let i = 0; i < recipes.length; i++) {
            const recipe = recipes[i];
            console.log(`レシピ ${i + 1}/${recipes.length} のページを生成中: ${recipe.title}`);
            
            // 進行状況を更新
            const recipeProgress = 60 + (i / recipes.length) * 30;
            updateProgressBar(recipeProgress);
            updateProgressInfo(`レシピページを生成中... (${i + 1}/${recipes.length}) ${recipe.title}`);
            
            // 新しいページを追加（最初のレシピ以外）
            if (i > 0) {
                doc.addPage();
                console.log(`新しいページを追加しました (ページ ${i + 1})`);
            }
            
            await generateRecipePage(doc, recipe, i + 1, recipes.length);
            console.log(`レシピ ${i + 1} のページ生成完了`);
        }

        // PDF最終化
        updateProgressStep('step-recipes-generation', 'completed');
        updateProgressStep('step-pdf-finalization', 'active');
        updateProgressBar(90);
        updateProgressInfo('PDFファイルを最終化中...');

        // PDFをダウンロード
        const fileName = `レシピブック_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
        
        // 完了
        updateProgressStep('step-pdf-finalization', 'completed');
        updateProgressBar(100);
        showCompletionMessage();
        
        console.log('レシピブックPDF作成完了:', fileName);
        
        // 少し待ってからポップアップを閉じてサイトをリセット
        setTimeout(() => {
            hideProgressPopup();
            resetSite();
        }, 2000);
    };

    // レシピブック表紙生成
    const generateRecipeBookCover = async (doc, recipes) => {
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = '1200px';
        tempContainer.style.padding = '30px';
        tempContainer.style.fontFamily = 'Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
        tempContainer.style.fontSize = '14px';
        tempContainer.style.lineHeight = '1.6';
        tempContainer.style.color = '#333';
        tempContainer.style.backgroundColor = '#fff';
        tempContainer.style.textAlign = 'center';

        const htmlContent = `
            <div style="padding: 60px 0;">
                <h1 style="font-size: 48px; margin-bottom: 30px; color: #2c3e50; font-weight: bold;">レシピブック</h1>
                <div style="font-size: 24px; margin-bottom: 20px; color: #7f8c8d;">Recipe Book</div>
                <div style="font-size: 18px; margin-bottom: 40px; color: #34495e;">
                    作成日: ${new Date().toLocaleDateString('ja-JP')}
                </div>
                <div style="font-size: 20px; color: #e74c3c; font-weight: bold;">
                    収録レシピ数: ${recipes.length}件
                </div>
            </div>
        `;

        tempContainer.innerHTML = htmlContent;
        document.body.appendChild(tempContainer);

        try {
            await convertHTMLToPDF(doc, tempContainer);
        } finally {
            document.body.removeChild(tempContainer);
        }
    };

    // 目次生成
    const generateRecipeBookTOC = async (doc, recipes) => {
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = '1200px';
        tempContainer.style.padding = '30px';
        tempContainer.style.fontFamily = 'Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
        tempContainer.style.fontSize = '14px';
        tempContainer.style.lineHeight = '1.6';
        tempContainer.style.color = '#333';
        tempContainer.style.backgroundColor = '#fff';

        let htmlContent = `
            <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="font-size: 32px; color: #2c3e50; font-weight: bold; border-bottom: 3px solid #3498db; padding-bottom: 15px; display: inline-block;">目次</h1>
            </div>
            <div style="max-width: 800px; margin: 0 auto;">
        `;

        recipes.forEach((recipe, index) => {
            htmlContent += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #ecf0f1;">
                    <span style="font-size: 18px; color: #2c3e50;">${index + 1}. ${escapeHtml(recipe.title)}</span>
                    <span style="font-size: 14px; color: #7f8c8d;">${recipe.category || 'その他'}</span>
                </div>
            `;
        });

        htmlContent += `</div>`;

        tempContainer.innerHTML = htmlContent;
        document.body.appendChild(tempContainer);

        try {
            await convertHTMLToPDF(doc, tempContainer);
        } finally {
            document.body.removeChild(tempContainer);
        }
    };

    // 個別レシピページ生成
    const generateRecipePage = async (doc, recipe, pageNumber, totalPages) => {
        console.log(`レシピページ生成開始: ${recipe.title} (${pageNumber}/${totalPages})`);
        
        // 材料データを解析（データベースから取得した配列形式）
        let ingredients = [];
        if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
            console.log('材料データ（生）:', recipe.ingredients);
            ingredients = recipe.ingredients.map(ing => ({
                item: ing.item || ing.item_translated || '',
                quantity: ing.quantity || '',
                unit: ing.unit || ing.unit_translated || ''
            }));
            console.log('解析された材料データ:', ingredients);
        } else {
            console.log('材料データが存在しません');
        }

        // 作り方データを解析（データベースから取得した配列形式）
        let steps = [];
        if (recipe.steps && Array.isArray(recipe.steps)) {
            console.log('作り方データ（生）:', recipe.steps);
            steps = recipe.steps.map(step => 
                step.instruction || step.instruction_translated || step.text || ''
            ).filter(step => step.trim() !== '');
            console.log('解析された作り方データ:', steps);
        } else {
            console.log('作り方データが存在しません');
        }

        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = '1200px';
        tempContainer.style.padding = '30px';
        tempContainer.style.fontFamily = 'Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
        tempContainer.style.fontSize = '14px';
        tempContainer.style.lineHeight = '1.6';
        tempContainer.style.color = '#333';
        tempContainer.style.backgroundColor = '#fff';

        // 改良されたレイアウトでHTMLコンテンツを生成
        let htmlContent = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="font-size: 28px; margin-bottom: 15px; color: #2c3e50; font-weight: bold;">${escapeHtml(recipe.title)}</h1>
                <div style="font-size: 14px; color: #7f8c8d; margin-bottom: 10px;">${recipe.category || 'その他'}</div>
                <div style="font-size: 12px; color: #95a5a6;">ページ ${pageNumber} / ${totalPages}</div>
            </div>
        `;

        if (recipe.notes) {
            htmlContent += `
                <div style="margin-bottom: 25px; padding: 15px; background-color: #f8f9fa; border-left: 5px solid #007bff; border-radius: 5px;">
                    <strong style="color: #007bff; font-size: 16px;">メモ・コツ</strong><br>
                    <span style="font-size: 14px; line-height: 1.5;">${escapeHtml(recipe.notes)}</span>
                </div>
            `;
        }

        // 2カラムレイアウト
        htmlContent += `<div style="display: flex; gap: 30px; margin-top: 20px;">`;

        // 左側：材料（1/3の幅）
        htmlContent += `<div style="flex: 1; min-width: 0;">`;
        htmlContent += `<h2 style="font-size: 20px; margin: 0 0 20px 0; color: #e74c3c; font-weight: bold; border-bottom: 2px solid #e74c3c; padding-bottom: 8px;">材料</h2>`;
        htmlContent += `<div style="margin-bottom: 20px;">`;

        if (ingredients.length > 0) {
            ingredients.forEach(ingredient => {
                const item = escapeHtml(ingredient.item || '').trim();
                const quantity = escapeHtml(ingredient.quantity || '').trim();
                const unit = escapeHtml(ingredient.unit || '').trim();

                // 分量と単位を適切に組み合わせて表示
                let amount = '';
                if (quantity && unit) {
                    amount = `${quantity}${unit}`;
                } else if (quantity) {
                    amount = quantity;
                } else if (unit) {
                    amount = unit;
                }

                // 材料名と分量の間に十分な間隔を設ける（番号なし）
                htmlContent += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #ecf0f1; margin-bottom: 8px;">
                        <span style="font-size: 15px; flex: 1; margin-right: 25px; line-height: 1.4;">${item}</span>
                        <span style="font-size: 15px; font-weight: bold; color: #2c3e50; white-space: nowrap; min-width: 60px; text-align: right;">${amount}</span>
                    </div>
                `;
            });
        } else {
            // 材料データが空の場合のフォールバック
            htmlContent += `
                <div style="padding: 20px; text-align: center; color: #7f8c8d; font-style: italic;">
                    材料データがありません
                </div>
            `;
        }
        htmlContent += `</div>`;
        htmlContent += `</div>`; // 左側終了

        // 右側：作り方（2/3の幅）
        htmlContent += `<div style="flex: 2; min-width: 0;">`;
        htmlContent += `<h2 style="font-size: 20px; margin: 0 0 15px 0; color: #27ae60; font-weight: bold; border-bottom: 2px solid #27ae60; padding-bottom: 5px;">作り方</h2>`;
        htmlContent += `<ol style="padding-left: 0; margin: 0;">`;

        if (steps.length > 0) {
            steps.forEach((step, index) => {
                htmlContent += `
                    <li style="margin-bottom: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #27ae60; border-radius: 0 5px 5px 0; list-style: none; position: relative;">
                        <span style="position: absolute; left: -15px; top: 12px; background-color: #27ae60; color: white; width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${index + 1}</span>
                        <span style="margin-left: 15px; font-size: 14px; line-height: 1.5;">${escapeHtml(step)}</span>
                    </li>
                `;
            });
        } else {
            // 作り方データが空の場合のフォールバック
            htmlContent += `
                <div style="padding: 20px; text-align: center; color: #7f8c8d; font-style: italic;">
                    作り方データがありません
                </div>
            `;
        }
        htmlContent += `</ol>`;
        htmlContent += `</div>`; // 右側終了

        htmlContent += `</div>`; // 2カラムレイアウト終了

        tempContainer.innerHTML = htmlContent;
        document.body.appendChild(tempContainer);

        try {
            await convertHTMLToPDF(doc, tempContainer);
        } finally {
            document.body.removeChild(tempContainer);
        }
    };

    // HTML to PDF変換関数
    const convertHTMLToPDF = async (doc, tempContainer) => {
        return new Promise((resolve, reject) => {
            if (typeof html2canvas !== 'undefined') {
                html2canvas(tempContainer, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    width: tempContainer.offsetWidth,
                    height: tempContainer.offsetHeight
                }).then(canvas => {
                    // CanvasをPDFに追加
                    const imgData = canvas.toDataURL('image/png', 1.0);
                    const imgWidth = 210; // A4 width in mm
                    const pageHeight = 295; // A4 height in mm
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    let heightLeft = imgHeight;

                    let position = 0;

                    // 最初のページに画像を追加
                    doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;

                    // 複数ページに分割
                    while (heightLeft >= 0) {
                        position = heightLeft - imgHeight;
                        doc.addPage();
                        doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                        heightLeft -= pageHeight;
                    }

                    console.log('HTML to PDF変換完了');
                    resolve();
                }).catch(error => {
                    console.error('html2canvas変換エラー:', error);
                    reject(error);
                });
            } else {
                reject(new Error('html2canvas is not available'));
            }
        });
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
        newButtons.forEach(btn => btn.addEventListener('click', () => location.href = 'pages/recipe_edit.html'));
    }

    // 動的に生成される新規作成ボタン（イベント委譲）
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-new-empty') || e.target.classList.contains('js-new')) {
            location.href = 'pages/recipe_edit.html';
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
            setupBulkSelection();
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

    // 一括選択機能のイベントリスナー設定
    const setupBulkSelection = () => {
        // 一括選択ボタン
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        if (bulkSelectBtn) {
            bulkSelectBtn.addEventListener('click', toggleBulkMode);
        }

        // レシピブック作成ボタン
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        if (bulkPdfBtn) {
            bulkPdfBtn.addEventListener('click', createRecipeBook);
        }

        // 一括選択UIのボタン
        const selectAllBtn = document.querySelector('.js-select-all');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', selectAllRecipes);
        }

        const deselectAllBtn = document.querySelector('.js-deselect-all');
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', deselectAllRecipes);
        }

        const createBookBtn = document.querySelector('.js-create-recipe-book');
        if (createBookBtn) {
            createBookBtn.addEventListener('click', createRecipeBook);
        }

        const bulkDeleteBtn = document.querySelector('.js-bulk-delete');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', bulkDeleteRecipes);
        }

        const cancelBulkBtn = document.querySelector('.js-cancel-bulk');
        if (cancelBulkBtn) {
            cancelBulkBtn.addEventListener('click', toggleBulkMode);
        }

        // 削除確認モーダルのイベントリスナー
        const bulkDeleteModalClose = document.getElementById('bulk-delete-modal-close');
        if (bulkDeleteModalClose) {
            bulkDeleteModalClose.addEventListener('click', hideBulkDeleteModal);
        }

        const bulkDeleteCancel = document.getElementById('bulk-delete-cancel');
        if (bulkDeleteCancel) {
            bulkDeleteCancel.addEventListener('click', hideBulkDeleteModal);
        }

        const bulkDeleteConfirm = document.getElementById('bulk-delete-confirm');
        if (bulkDeleteConfirm) {
            bulkDeleteConfirm.addEventListener('click', executeBulkDelete);
        }

        // モーダル外クリックで閉じる
        const bulkDeleteModal = document.getElementById('bulk-delete-modal');
        if (bulkDeleteModal) {
            bulkDeleteModal.addEventListener('click', (e) => {
                if (e.target === bulkDeleteModal) {
                    hideBulkDeleteModal();
                }
            });
        }

        // レシピカードのクリックイベント（一括選択モード時）
        cardListEl.addEventListener('click', (e) => {
            if (isBulkMode) {
                const card = e.target.closest('.recipe-card');
                if (card && card.dataset.id) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleRecipeSelection(card.dataset.id);
                }
            } else {
                // 通常モード時はレシピ表示
                const card = e.target.closest('.recipe-card');
                if (card && !e.target.closest('.favorite-btn') && !e.target.closest('.bulk-checkbox')) {
                    location.href = `pages/recipe_view.html?id=${encodeURIComponent(card.dataset.id)}`;
                }
            }
        });
    };

    init();
});