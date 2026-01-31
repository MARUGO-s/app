import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom'; // Import useSearchParams
import { Layout } from './components/Layout';
import { RecipeList } from './components/RecipeList';
import { RecipeDetail } from './components/RecipeDetail';
import { RecipeForm } from './components/RecipeForm';
import { ImportModal } from './components/ImportModal';
import { DataManagement } from './components/DataManagement';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { RecentRecipes } from './components/RecentRecipes';
import { LevainGuide } from './components/LevainGuide';
import { UserManagement } from './components/UserManagement';
import { recipeService } from './services/recipeService';
import { STORE_LIST } from './constants';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import './App.css';

import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

function AppContent() {
  const { user, logout, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trashCount, setTrashCount] = useState(0);
  const [recentIds, setRecentIds] = useState([]);

  // Derived State from URL
  const currentView = searchParams.get('view') || 'list'; // 'list', 'detail', 'create', 'edit', 'data', 'trash'
  const selectedRecipeId = searchParams.get('id');

  const selectedRecipe = recipes.find(r => String(r.id) === selectedRecipeId) || null;

  const [selectedTag, setSelectedTag] = useState('すべて');
  const [importMode, setImportMode] = useState(null); // null | 'url' | 'image'
  const [importedData, setImportedData] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // New search state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState(new Set());
  const [displayMode, setDisplayMode] = useState('normal'); // 'normal' | 'all'
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  useEffect(() => {
    loadRecipes();
    loadTrashCount();
    loadRecentHistory();
    loadTrashCount();
    loadRecentHistory();
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 1000,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setRecipes((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return items;

        const newItems = arrayMove(items, oldIndex, newIndex);

        // Optimistically update UI, fire and forget backend update
        const updates = newItems.map((item, index) => ({
          id: item.id,
          order_index: index
        }));
        recipeService.updateOrder(updates).catch(err => console.error("Order update failed", err));

        return newItems;
      });
    }
  };

  const loadRecentHistory = async () => {
    try {
      const ids = await recipeService.fetchRecentRecipes();
      setRecentIds(ids || []);
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  };

  const addToHistory = async (id) => {
    // ... same ...
    // Optimistic update
    const newHistory = [id, ...recentIds.filter(rId => rId !== id)].slice(0, 20);
    setRecentIds(newHistory);

    // Server update
    try {
      await recipeService.addToHistory(id);
    } catch (e) {
      console.error("Failed to sync history", e);
    }
  };

  const loadTrashCount = async () => {
    try {
      const count = await recipeService.getDeletedCount();
      setTrashCount(count || 0);
    } catch (error) {
      console.error("Failed to load trash count:", error);
    }
  };

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const data = await recipeService.fetchRecipes(user);
      setRecipes(data || []);
    } catch (error) {
      console.error("Failed to fetch recipes:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique courses and categories
  const allCourses = [...new Set(recipes.map(r => r.course).filter(Boolean))];
  const allCategories = [...new Set(recipes.map(r => r.category).filter(Boolean))];

  // Calculate counts
  const storeCounts = recipes.reduce((acc, r) => {
    if (r.storeName) acc[r.storeName] = (acc[r.storeName] || 0) + 1;
    return acc;
  }, {});

  const courseCounts = recipes.reduce((acc, r) => {
    if (r.course) acc[r.course] = (acc[r.course] || 0) + 1;
    return acc;
  }, {});

  const categoryCounts = recipes.reduce((acc, r) => {
    if (r.category) acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  // Filter recipes based on Tag/Category/Store AND Search Query
  const filteredRecipes = recipes.filter(recipe => {
    // 1. Tag/Category/Store Filter
    const matchesTag =
      selectedTag === 'すべて' ||
      (selectedTag === 'recent' && recentIds.includes(recipe.id)) ||
      (recipe.tags && recipe.tags.includes(selectedTag)) ||
      (recipe.category && recipe.category === selectedTag) ||
      (recipe.storeName && recipe.storeName === selectedTag);

    // 2. Search Query Filter
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      recipe.title.toLowerCase().includes(query) ||
      (recipe.description && recipe.description.toLowerCase().includes(query)) ||
      (recipe.ingredients && recipe.ingredients.some(ing => ing.name.toLowerCase().includes(query)));

    return matchesTag && matchesSearch;
  });

  const isDragEnabled = selectedTag === 'すべて' && !searchQuery.trim() && currentView === 'list';

  const handleSelectRecipe = (recipe) => {
    // Navigate to detail view
    setSearchParams({ view: 'detail', id: recipe.id });
  };

  const handleDeleteRecipe = async (recipe, isRestore = false) => {
    try {
      // Protection: master recipe check
      if (recipe.tags && user.id !== 'yoshito' && user.id !== 'admin') {
        const isMaster = recipe.tags.some(t => t === 'owner:yoshito');
        if (isMaster) {
          alert("マスターレシピは削除できません。");
          return;
        }
      }

      if (isRestore) {
        await recipeService.restoreRecipe(recipe.id);
        // Refresh deleted list or move back to main list
        if (currentView === 'trash' || currentView === 'detail') {
          // If restoring from trash detail, go back to trash list
          // Or stay?
          // If restoring, it disappears from trash list.
          setSearchParams({ view: 'trash' });
          loadDeletedRecipes();
        }
        alert("レシピを復元しました。");
      } else {
        await recipeService.deleteRecipe(recipe.id);
        setRecipes(recipes.filter(r => r.id !== recipe.id));
        setSearchParams({ view: 'list' });
        loadTrashCount();
      }
    } catch (error) {
      console.error("Failed to delete/restore recipe:", error);
      alert("操作に失敗しました。");
    } finally {
      loadTrashCount();
    }
  };

  const handleHardDeleteRecipe = async (recipe) => {
    try {
      await recipeService.hardDeleteRecipe(recipe.id);
      setRecipes(recipes.filter(r => r.id !== recipe.id));
      setSearchParams({ view: 'trash' });
      alert("レシピを完全に削除しました。");
      loadDeletedRecipes(); // Reload list to reflect changes
      loadTrashCount(); // Update count
    } catch (error) {
      console.error("Failed to hard delete recipe:", error);
      alert("完全に削除することに失敗しました。");
    }
  };

  const loadDeletedRecipes = async () => {
    try {
      setLoading(true);
      const data = await recipeService.fetchDeletedRecipes();
      setRecipes(data || []);
      setSelectedTag('すべて'); // Reset filter
    } catch (error) {
      console.error("Failed to fetch deleted recipes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToTrash = () => {
    setSearchParams({ view: 'trash' });
    loadDeletedRecipes();
  };

  const handleSwitchToMain = () => {
    setSearchParams({ view: 'list' });
    loadRecipes();
  };

  const handleSaveRecipe = async (recipe, isEdit) => {
    try {
      let savedRecipe;
      let effectiveIsEdit = isEdit;

      // Protection: Copy-on-Write for Shared Recipes
      // If user is not the owner (and not admin), force Create mode (Duplicate)
      if (isEdit && user.id !== 'admin') {
        const ownerTag = recipe.tags?.find(t => t.startsWith('owner:'));
        const isOwner = ownerTag === `owner:${user.id}`;

        // If it has an owner tag and I am NOT the owner, I cannot overwrite it.
        // stricter: If I am NOT the confirmed owner, FORCE copy. (Protects legacy/admin recipes without tags)
        if (!isOwner) {
          console.log(`Editing Recipe (Owner Tag: ${ownerTag || 'None'}) as ${user.id}. Not the owner. Switching to Create mode (Copy).`);
          effectiveIsEdit = false;
        }
      }

      if (effectiveIsEdit) {
        savedRecipe = await recipeService.updateRecipe(recipe, user);
        setRecipes(recipes.map(r => r.id === savedRecipe.id ? savedRecipe : r));
        // selectedRecipe updates automatically via URL derivation if ID matches
        // But if ID changed (unlikely for update), we'd need to redirect.
        // Assuming ID stays same.
      } else {
        savedRecipe = await recipeService.createRecipe(recipe, user);
        // Add to TOP or BOTTOM? 
        // Logic: if other items have order_index, ideally we should set safe order_index.
        // But newly created might have null.
        // If sorting asc, nulls might be last.
        // Let's prepend for UX, but on reload it might jump if no order.
        // For now, prepend is default.
        setRecipes([savedRecipe, ...recipes]);
      }
      // Navigate
      if (effectiveIsEdit) {
        setSearchParams({ view: 'detail', id: savedRecipe.id });
      } else {
        // Even if originally edit, if we created new, go to list or detail of NEW one
        // User probably expects to see the new one.
        setSearchParams({ view: 'detail', id: savedRecipe.id }); // Better UX: Show the new recipe
      }

    } catch (error) {
      console.error("Failed to save recipe:", error);
      alert(`保存に失敗しました。\nエラー: ${error.message || error.error_description || JSON.stringify(error)}`);
    }
  };

  const handleImportRecipe = (recipeData, sourceUrl = '') => {
    // Smart detection for Bread recipes (Baker's %)
    // 1. Check for explicit keywords in title/description
    const breadKeywords = ['ベーカーズ', 'baker', '生地', 'パン', '発酵', 'dough', 'fermentation'];
    const titleMatch = breadKeywords.some(k => (recipeData.title || "").toLowerCase().includes(k));

    // 2. Check for yeast or flour keywords in ingredients
    const flourKeywords = ['flour', '強力粉', '薄力粉', '準強力粉', '中力粉', '全粒粉', 'ライ麦粉', 'フランス粉', 'デュラムセモリナ', '粉'];
    const yeastKeywords = ['yeast', 'イースト', '酵母', 'ルヴァン'];

    const ingredients = recipeData.ingredients || [];
    const hasYeast = ingredients.some(ing =>
      yeastKeywords.some(k => (ing.name || "").toLowerCase().includes(k))
    );
    const hasFlour = ingredients.some(ing =>
      flourKeywords.some(k => (ing.name || "").toLowerCase().includes(k)) &&
      !ing.name.includes('粉糖') // Exclude powdered sugar
    );

    // 3. Check for percentage sign in quantities or units (Strong indicator of Baker's %)
    const hasPercent = ingredients.some(ing =>
      (ing.quantity && String(ing.quantity).includes('%')) ||
      (ing.unit && String(ing.unit).includes('%'))
    );

    // Final Decision
    if (hasPercent || hasYeast || (titleMatch && hasFlour)) {
      recipeData.type = 'bread';
      recipeData.flours = [];
      recipeData.breadIngredients = [];

      // Strict flour keywords for splitting
      const strictFlourKeywords = ['flour', '強力粉', '薄力粉', '準強力粉', '中力粉', '全粒粉', 'ライ麦粉', 'フランス粉', 'デュラムセモリナ'];

      ingredients.forEach(ing => {
        // Cleanup quantity if it contains percent (e.g. "2%(10g)" -> "10")
        // But for now, we just split into groups.
        const isFlour = strictFlourKeywords.some(k => (ing.name || "").includes(k));
        if (isFlour) {
          recipeData.flours.push(ing);
        } else {
          recipeData.breadIngredients.push(ing);
        }
      });

      // Fallback: If no flours found but it's bread, push the first ingredient as flour if it contains '粉'
      if (recipeData.flours.length === 0 && ingredients.length > 0) {
        const firstIng = ingredients[0];
        if ((firstIng.name || "").includes('粉')) {
          recipeData.flours.push(firstIng);
          recipeData.breadIngredients = recipeData.breadIngredients.filter(i => i !== firstIng);
        }
      }
    }

    recipeData.sourceUrl = sourceUrl;
    if (sourceUrl) {
      recipeData.category = 'URL取り込み';
    }
    setImportedData(recipeData);
    setSearchParams({ view: 'create' });
  };

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedRecipeIds(new Set());
  };

  const handleToggleSelection = (id) => {
    const next = new Set(selectedRecipeIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRecipeIds(next);
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteConfirm(true);
  };

  const cancelBulkDelete = () => {
    setShowBulkDeleteConfirm(false);
  };

  const confirmBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    try {
      setLoading(true);
      if (currentView === 'trash') {
        await Promise.all(Array.from(selectedRecipeIds).map(id => recipeService.hardDeleteRecipe(id)));
        fetchTrash();
      } else {
        await Promise.all(Array.from(selectedRecipeIds).map(id => recipeService.deleteRecipe(id)));
        setRecipes(recipes.filter(r => !selectedRecipeIds.has(r.id)));
        loadTrashCount();
      }
      setSelectedRecipeIds(new Set());
      setIsSelectMode(false);
      alert("削除しました。");

    } catch (error) {
      console.error("Bulk delete failed", error);
      alert("一部の削除に失敗した可能性があります。");
      if (currentView === 'trash') fetchTrash();
      else loadRecipes();
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRestore = async () => {
    if (!window.confirm(`${selectedRecipeIds.size}件のレシピを復元しますか？`)) return;

    try {
      setLoading(true);
      for (const id of selectedRecipeIds) {
        await recipeService.restoreRecipe(id);
      }
      setRecipes(recipes.filter(r => !selectedRecipeIds.has(r.id)));
      loadTrashCount();
      setIsSelectMode(false);
      setSelectedRecipeIds(new Set());
      alert("復元しました。");
      fetchTrash();
    } catch (error) {
      console.error("Bulk restore failed", error);
      alert("一部の復元に失敗した可能性があります。");
      fetchTrash();
    } finally {
      setLoading(false);
    }
  };


  const handleSelectAll = () => {
    // Select all currently filtered recipes
    const allIds = filteredRecipes.map(r => r.id);
    setSelectedRecipeIds(new Set(allIds));
  };

  const handleDuplicate = (newRecipe) => {
    setRecipes([newRecipe, ...recipes]);
    setSearchParams({ view: 'edit', id: newRecipe.id });
  };

  useEffect(() => {
    if (currentView === 'trash') {
      fetchTrash();
    } else if (user) { // Only load if user exists
      loadRecipes();
    }
  }, [currentView, user]);

  if (authLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  if (!user) return <LoginPage />;

  return (

    <Layout>
      {showBulkDeleteConfirm && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', border: '2px solid var(--color-danger)', backgroundColor: 'white' }}>
            <h3 style={{ marginTop: 0, color: '#dc3545', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> {selectedRecipeIds.size}件のレシピを{currentView === 'trash' ? '完全削除' : '削除'}
            </h3>
            <p style={{ margin: '1rem 0', color: '#333' }}>
              {currentView === 'trash'
                ? 'これらは完全に削除され、復元できなくなります。よろしいですか？'
                : '選択したレシピをゴミ箱に移動しますか？'}
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <Button variant="ghost" onClick={cancelBulkDelete}>キャンセル</Button>
              <Button variant="danger" onClick={confirmBulkDelete}>{currentView === 'trash' ? '完全に削除' : '削除する'}</Button>
            </div>
          </Card>
        </div>
      )}
      {(currentView === 'list' || currentView === 'trash') && (
        <>
          <div className="container-header">
            <h2 className="section-title">
              {currentView === 'trash' ? 'ゴミ箱 (削除済み)' : `レシピ一覧`}
              {currentView === 'list' && (
                <span style={{ fontSize: '0.8em', marginLeft: '8px', color: '#666', fontWeight: 'normal' }}>
                  ({recipes.length})
                </span>
              )}
            </h2>
            <div className="header-actions">
              {(currentView === 'list' || currentView === 'trash') ? (
                <>
                  {isSelectMode ? (
                    <>
                      <Button variant="ghost" onClick={toggleSelectMode}>キャンセル</Button>
                      <Button variant="secondary" onClick={handleSelectAll}>全選択</Button>

                      {currentView === 'trash' && (
                        <Button
                          variant="secondary"
                          onClick={handleBulkRestore}
                          disabled={selectedRecipeIds.size === 0}
                          style={{ marginRight: '8px', backgroundColor: '#4CAF50', color: 'white', border: 'none' }}
                        >
                          復元 ({selectedRecipeIds.size})
                        </Button>
                      )}

                      <Button
                        variant="danger"
                        onClick={handleBulkDelete}
                        disabled={selectedRecipeIds.size === 0}
                      >
                        {currentView === 'trash' ? '完全削除' : '削除'} ({selectedRecipeIds.size})
                      </Button>
                    </>
                  ) : (
                    <>
                      {currentView === 'list' ? (
                        <Button onClick={() => setSearchParams({ view: 'create' })} className="primary-action-btn">
                          + レシピ追加
                        </Button>
                      ) : (
                        // Trash View Default Actions
                        <Button variant="ghost" onClick={handleSwitchToMain}>
                          ← 一覧に戻る
                        </Button>
                      )}
                    </>
                  )}

                  <button
                    className="mobile-menu-toggle"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="メニュー"
                  >
                    {isMenuOpen ? '✕' : '☰'}
                  </button>

                  <div className={`secondary-actions ${isMenuOpen ? 'open' : ''}`}>
                    {currentView === 'list' && (
                      <>
                        <Button variant="secondary" onClick={() => { setImportMode('url'); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>🌐</span> Webから追加
                        </Button>
                        <Button variant="secondary" onClick={() => { setImportMode('image'); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>📷</span> 画像から追加
                        </Button>
                        <Button variant="secondary" onClick={() => { setSearchParams({ view: 'data' }); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>📊</span> データ管理
                        </Button>
                        <Button variant="secondary" onClick={() => { setSearchParams({ view: 'levain-guide' }); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>📖</span> ルヴァンガイド
                        </Button>

                        {user?.id === 'admin' && (
                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'users' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>👥</span> ユーザー管理
                          </Button>
                        )}

                        <div className="menu-divider"></div>
                      </>
                    )}

                    {!isSelectMode && (
                      <Button variant="ghost" onClick={() => { toggleSelectMode(); setIsMenuOpen(false); }} className="danger-text">
                        <span style={{ marginRight: '8px' }}>☑️</span> {currentView === 'trash' ? '一括操作' : '一括削除'}
                      </Button>
                    )}

                    {currentView === 'list' && (
                      <Button variant="ghost" onClick={() => { handleSwitchToTrash(); setIsMenuOpen(false); }} style={{ position: 'relative' }}>
                        <span style={{ marginRight: '8px' }}>🗑️</span> ゴミ箱 {trashCount > 0 && <span className="trash-badge">{trashCount}</span>}
                      </Button>
                    )}

                    <Button variant="ghost" onClick={() => { handleSwitchToMain(); setIsMenuOpen(false); }}>
                      <span style={{ marginRight: '8px' }}>🏠</span> 一覧に戻る
                    </Button>


                    <div className="menu-divider"></div>

                    <Button variant="ghost" onClick={() => {
                      logout();
                      setIsMenuOpen(false);
                    }}>
                      <span style={{ marginRight: '8px' }}>🚪</span> ログアウト
                    </Button>
                  </div>

                  {/* Backdrop for closing menu */}
                  <div
                    className={`menu-backdrop ${isMenuOpen ? 'open' : ''}`}
                    onClick={() => setIsMenuOpen(false)}
                    aria-hidden="true"
                  />


                </>
              ) : null}
            </div>
          </div>

          {currentView === 'list' && (
            <div className="search-container">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="レシピ名、材料、メモから検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          <div className="tag-filter-container">
            <select
              className="store-filter-select"
              value={STORE_LIST.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">店舗</option>
              {STORE_LIST.map(store => (
                <option key={store} value={store}>{store} ({storeCounts[store] || 0})</option>
              ))}
            </select>

            <select
              className="store-filter-select"
              value={allCourses.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">コース</option>
              {allCourses.sort().map(course => (
                <option key={course} value={course}>{course} ({courseCounts[course] || 0})</option>
              ))}
            </select>

            <select
              className="store-filter-select"
              value={allCategories.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">カテゴリー</option>
              {allCategories.sort().map(cat => (
                <option key={cat} value={cat}>{cat} ({categoryCounts[cat] || 0})</option>
              ))}
            </select>

            <div className="view-mode-toggle" style={{ marginLeft: '16px', display: 'flex', gap: '8px', borderLeft: '1px solid #ccc', paddingLeft: '16px' }}>
              <button
                className={`tag-filter-btn ${displayMode === 'normal' ? 'active' : ''}`}
                onClick={() => setDisplayMode('normal')}
                style={{ minWidth: 'auto', padding: '4px 12px' }}
              >
                通常
              </button>
              <button
                className={`tag-filter-btn ${displayMode === 'all' ? 'active' : ''}`}
                onClick={() => setDisplayMode('all')}
                style={{ minWidth: 'auto', padding: '4px 12px' }}
              >
                全表示
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>読み込み中...</div>
          ) : (
            recipes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                {currentView === 'trash' ? 'ゴミ箱は空です' : 'レシピがありません'}
                {selectedTag !== 'すべて' && <p>条件を変更して検索してください</p>}
              </div>
            ) : (
              <div className="main-content-wrapper">
                {currentView === 'list' && (
                  <div className="recent-list-wrapper">
                    <RecentRecipes
                      recipes={recipes}
                      recentIds={recentIds}
                      onSelect={handleSelectRecipe}
                    />
                  </div>
                )}
                <div className="recipe-list-container">
                  {/* Wrap only RecipeList with DndContext */}
                  {currentView === 'list' ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <RecipeList
                        recipes={filteredRecipes}
                        onSelectRecipe={handleSelectRecipe}
                        isSelectMode={isSelectMode}
                        selectedIds={selectedRecipeIds}
                        onToggleSelection={handleToggleSelection}
                        disableDrag={!isDragEnabled}
                        displayMode={displayMode}
                      />
                    </DndContext>
                  ) : (
                    <RecipeList
                      recipes={filteredRecipes}
                      onSelectRecipe={handleSelectRecipe}
                      isSelectMode={isSelectMode}
                      selectedIds={selectedRecipeIds}
                      onToggleSelection={handleToggleSelection}
                      disableDrag={true} // Disable drag for trash/filtered views if accidentally here
                      displayMode={displayMode}
                    />
                  )}
                </div>
              </div>
            )
          )}
        </>
      )}

      {currentView === 'detail' && selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          isDeleted={!!selectedRecipe.deletedAt}
          onBack={() => selectedRecipe.deletedAt ? handleSwitchToTrash() : handleSwitchToMain()}
          onEdit={() => setSearchParams({ view: 'edit', id: selectedRecipe.id })}
          onDelete={handleDeleteRecipe}
          onView={addToHistory}
          onHardDelete={handleHardDeleteRecipe}
          onDuplicate={handleDuplicate}
        />
      )}

      {currentView === 'edit' && selectedRecipe && (
        <RecipeForm
          key={`edit-${selectedRecipe.id}`}
          initialData={selectedRecipe}
          onCancel={() => setSearchParams({ view: 'detail', id: selectedRecipe.id })}
          onSave={(updatedRecipe) => handleSaveRecipe(updatedRecipe, true)}
        />
      )}

      {currentView === 'create' && (
        <RecipeForm
          key={importedData ? 'create-form-imported' : 'create-form'}
          initialData={importedData}
          onCancel={() => {
            setSearchParams({ view: 'list' });
            setImportedData(null);
          }}
          onSave={(newRecipe) => handleSaveRecipe(newRecipe, false)}
        />
      )}

      {importMode && (
        <ImportModal
          initialMode={importMode}
          onClose={() => setImportMode(null)}
          onImport={handleImportRecipe}
        />
      )}

      {currentView === 'data' && (
        <DataManagement onBack={() => setSearchParams({ view: 'list' })} />
      )}


      {currentView === 'levain-guide' && (
        <LevainGuide onBack={() => setSearchParams({ view: 'list' })} />
      )}

      {currentView === 'users' && user?.id === 'admin' && (
        <UserManagement onBack={() => setSearchParams({ view: 'list' })} />
      )}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
