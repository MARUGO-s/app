import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { RecipeList } from './components/RecipeList';
import { RecipeDetail } from './components/RecipeDetail';
import { RecipeForm } from './components/RecipeForm';
import { ImportModal } from './components/ImportModal';
import { DataManagement } from './components/DataManagement';
import { Card } from './components/Card';

import { Button } from './components/Button';
import { RecentRecipes } from './components/RecentRecipes';
import { recipeService } from './services/recipeService';
import { STORE_LIST } from './constants';
import './App.css';

function App() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trashCount, setTrashCount] = useState(0);
  const [recentIds, setRecentIds] = useState([]);
  const [currentView, setCurrentView] = useState('list'); // 'list', 'detail', 'create', 'data'
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [selectedTag, setSelectedTag] = useState('すべて');
  const [importMode, setImportMode] = useState(null); // null | 'url' | 'image'
  const [importedData, setImportedData] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // New search state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  useEffect(() => {
    loadRecipes();
    loadTrashCount();
    loadRecentHistory();
  }, []);

  const loadRecentHistory = async () => {
    try {
      const ids = await recipeService.fetchRecentRecipes();
      setRecentIds(ids || []);
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  };

  const addToHistory = async (id) => {
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
      const data = await recipeService.fetchRecipes();
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

  // Filter recipes based on Tag/Category/Store AND Search Query
  const filteredRecipes = recipes.filter(recipe => {
    // 1. Tag/Category/Store Filter
    const matchesTag =
      selectedTag === 'すべて' ||
      (selectedTag === 'recent' && recentIds.includes(recipe.id)) ||
      (recipe.tags && recipe.tags.includes(selectedTag)) ||
      (recipe.category && recipe.category === selectedTag) || // Assuming 'category' is a single string, not an array
      (recipe.course && recipe.course === selectedTag) || // Assuming 'course' is a single string
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

  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setCurrentView('detail');
  };

  const handleDeleteRecipe = async (recipe, isRestore = false) => {
    try {
      if (isRestore) {
        await recipeService.restoreRecipe(recipe.id);
        // Refresh deleted list or move back to main list
        if (currentView === 'trash' || currentView === 'detail') {
          setCurrentView('trash');
          loadDeletedRecipes();
        }
        alert("レシピを復元しました。");
      } else {
        await recipeService.deleteRecipe(recipe.id);
        setRecipes(recipes.filter(r => r.id !== recipe.id));
        setCurrentView('list');
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
      setCurrentView('trash'); // Stay in trash view but list updates
      setCurrentView('trash'); // Stay in trash view but list updates
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
    setCurrentView('trash');
    loadDeletedRecipes();
  };

  const handleSwitchToMain = () => {
    setCurrentView('list');
    loadRecipes();
  };

  const handleSaveRecipe = async (recipe, isEdit) => {
    try {
      let savedRecipe;
      if (isEdit) {
        savedRecipe = await recipeService.updateRecipe(recipe);
        setRecipes(recipes.map(r => r.id === savedRecipe.id ? savedRecipe : r));
        setSelectedRecipe(savedRecipe); // Update selected recipe with new data
      } else {
        savedRecipe = await recipeService.createRecipe(recipe);
        setRecipes([savedRecipe, ...recipes]);
      }
      setCurrentView(isEdit ? 'detail' : 'list');
    } catch (error) {
      console.error("Failed to save recipe:", error);
      alert(`保存に失敗しました。\nエラー: ${error.message || error.error_description || JSON.stringify(error)}`);
    }
  };

  const handleImportRecipe = (recipeData) => {
    // Smart detection for Bread recipes
    const hasYeast = (recipeData.ingredients || []).some(ing =>
      (ing.name && (ing.name.toLowerCase().includes('yeast') || ing.name.includes('イースト')))
    );

    if (hasYeast) {
      recipeData.type = 'bread';
      recipeData.flours = [];
      recipeData.breadIngredients = [];

      // Keywords for flours (avoid generic '粉' to exclude powder/cheese etc)
      const flourKeywords = ['flour', '強力粉', '薄力粉', '準強力粉', '中力粉', '全粒粉', 'ライ麦粉', 'フランス粉', 'デュラムセモリナ'];

      (recipeData.ingredients || []).forEach(ing => {
        const isFlour = flourKeywords.some(k => ing.name.includes(k));
        if (isFlour) {
          recipeData.flours.push(ing);
        } else {
          recipeData.breadIngredients.push(ing);
        }
      });
    }

    setImportedData(recipeData);
    setCurrentView('create');
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
      // Process sequentially to reuse existing logic (or optimize with bulk API in future)
      for (const id of selectedRecipeIds) {
        await recipeService.deleteRecipe(id);
      }

      // Update UI
      setRecipes(recipes.filter(r => !selectedRecipeIds.has(r.id)));
      loadTrashCount();
      setIsSelectMode(false);
      setSelectedRecipeIds(new Set());
      alert("削除しました。");

    } catch (error) {
      console.error("Bulk delete failed", error);
      alert("一部の削除に失敗した可能性があります。");
      loadRecipes(); // reload to sync
    } finally {
      setLoading(false);
    }
  };


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
              <span>⚠️</span> {selectedRecipeIds.size}件のレシピを削除
            </h3>
            <p style={{ margin: '1rem 0', color: '#333' }}>
              選択したレシピをゴミ箱に移動しますか？
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <Button variant="ghost" onClick={cancelBulkDelete}>キャンセル</Button>
              <Button variant="danger" onClick={confirmBulkDelete}>削除する</Button>
            </div>
          </Card>
        </div>
      )}
      {(currentView === 'list' || currentView === 'trash') && (
        <>
          <div className="container-header">
            <h2 className="section-title">{currentView === 'trash' ? 'ゴミ箱 (削除済み)' : ''}</h2>
            <div className="header-actions">
              {currentView === 'list' ? (
                <>
                  {isSelectMode ? (
                    <>
                      <Button variant="ghost" onClick={toggleSelectMode}>キャンセル</Button>
                      <Button
                        variant="danger"
                        onClick={handleBulkDelete}
                        disabled={selectedRecipeIds.size === 0}
                      >
                        削除 ({selectedRecipeIds.size})
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => setCurrentView('create')} className="primary-action-btn">
                        + レシピ追加
                      </Button>
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
                    <Button variant="secondary" onClick={() => { setImportMode('url'); setIsMenuOpen(false); }}>
                      <span style={{ marginRight: '8px' }}>🌐</span> Webから追加
                    </Button>
                    <Button variant="secondary" onClick={() => { setImportMode('image'); setIsMenuOpen(false); }}>
                      <span style={{ marginRight: '8px' }}>📷</span> 画像から追加
                    </Button>
                    <Button variant="secondary" onClick={() => { setCurrentView('data'); setIsMenuOpen(false); }}>
                      <span style={{ marginRight: '8px' }}>📊</span> データ管理
                    </Button>

                    <div className="menu-divider"></div>

                    {!isSelectMode && (
                      <Button variant="ghost" onClick={() => { toggleSelectMode(); setIsMenuOpen(false); }} className="danger-text">
                        <span style={{ marginRight: '8px' }}>☑️</span> 一括削除
                      </Button>
                    )}

                    <Button variant="ghost" onClick={() => { handleSwitchToTrash(); setIsMenuOpen(false); }} style={{ position: 'relative' }}>
                      <span style={{ marginRight: '8px' }}>🗑️</span> ゴミ箱 {trashCount > 0 && <span className="trash-badge">{trashCount}</span>}
                    </Button>
                  </div>

                  {/* Backdrop for closing menu */}
                  <div
                    className={`menu-backdrop ${isMenuOpen ? 'open' : ''}`}
                    onClick={() => setIsMenuOpen(false)}
                    aria-hidden="true"
                  />


                </>
              ) : (
                <Button variant="ghost" onClick={handleSwitchToMain}>
                  ← レシピ一覧に戻る
                </Button>
              )}
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
                <option key={store} value={store}>{store}</option>
              ))}
            </select>

            <select
              className="store-filter-select"
              value={allCourses.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">コース</option>
              {allCourses.sort().map(course => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>

            <select
              className="store-filter-select"
              value={allCategories.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">カテゴリー</option>
              {allCategories.sort().map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <button
              className={`tag-filter-btn ${selectedTag === 'すべて' ? 'active' : ''}`}
              onClick={() => setSelectedTag('すべて')}
            >
              すべて
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>読み込み中...</div>
          ) : (
            recipes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                {currentView === 'trash' ? 'ゴミ箱は空です' : 'レシピがありません'}
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
                  <RecipeList
                    recipes={filteredRecipes}
                    onSelectRecipe={handleSelectRecipe}
                    isSelectMode={isSelectMode}
                    selectedIds={selectedRecipeIds}
                    onToggleSelection={handleToggleSelection}
                  />
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
          onEdit={() => setCurrentView('edit')}
          onDelete={handleDeleteRecipe}
          onView={addToHistory}
          onHardDelete={handleHardDeleteRecipe}
        />
      )}

      {currentView === 'edit' && selectedRecipe && (
        <RecipeForm
          key={`edit-${selectedRecipe.id}`}
          initialData={selectedRecipe}
          onCancel={() => setCurrentView('detail')}
          onSave={(updatedRecipe) => handleSaveRecipe(updatedRecipe, true)}
        />
      )}

      {currentView === 'create' && (
        <RecipeForm
          key={importedData ? 'create-form-imported' : 'create-form'}
          initialData={importedData}
          onCancel={() => {
            setCurrentView('list');
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
        <DataManagement onBack={() => setCurrentView('list')} />
      )}
    </Layout>
  );
}

export default App;
