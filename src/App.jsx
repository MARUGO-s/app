import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { RecipeList } from './components/RecipeList';
import { RecipeDetail } from './components/RecipeDetail';
import { RecipeForm } from './components/RecipeForm';
import { Button } from './components/Button';
import { recipeService } from './services/recipeService';
import { STORE_LIST } from './constants';
import './App.css';

function App() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trashCount, setTrashCount] = useState(0);
  const [currentView, setCurrentView] = useState('list'); // 'list', 'detail', 'create'
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [selectedTag, setSelectedTag] = useState('すべて');

  useEffect(() => {
    loadRecipes();
    loadTrashCount();
  }, []);

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

  // Get unique tags from all recipes
  const allTags = ['すべて', ...new Set(recipes.flatMap(r => r.tags || []))];

  // Filter recipes based on selected tag
  const filteredRecipes = selectedTag === 'すべて'
    ? recipes
    : recipes.filter(r => (r.tags || []).includes(selectedTag));

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
      alert("保存に失敗しました。");
    }
  };

  return (
    <Layout>
      {(currentView === 'list' || currentView === 'trash') && (
        <>
          <div className="container-header">
            <h2 className="section-title">{currentView === 'trash' ? 'ゴミ箱 (削除済み)' : 'マイレシピ'}</h2>
            <div className="header-actions">
              {currentView === 'list' ? (
                <>
                  <Button variant="ghost" onClick={handleSwitchToTrash} style={{ marginRight: '0.5rem' }}>
                    🗑️ ゴミ箱 {trashCount > 0 && <span style={{ marginLeft: '4px', backgroundColor: '#e74c3c', color: 'white', borderRadius: '12px', padding: '2px 8px', fontSize: '12px' }}>{trashCount}</span>}
                  </Button>
                  <Button onClick={() => setCurrentView('create')}>
                    + レシピ追加
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={handleSwitchToMain}>
                  ← レシピ一覧に戻る
                </Button>
              )}
            </div>
          </div>

          <div className="tag-filter-container">
            <select
              className="store-filter-select"
              value={STORE_LIST.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">店舗で絞り込み...</option>
              {STORE_LIST.map(store => (
                <option key={store} value={store}>{store}</option>
              ))}
            </select>
            <div className="tag-divider"></div>
            {allTags.sort().map(tag => (
              <button
                key={tag}
                className={`tag-filter-btn ${selectedTag === tag ? 'active' : ''}`}
                onClick={() => setSelectedTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>読み込み中...</div>
          ) : (
            recipes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                {currentView === 'trash' ? 'ゴミ箱は空です' : 'レシピがありません'}
              </div>
            ) : (
              <RecipeList recipes={filteredRecipes} onSelectRecipe={handleSelectRecipe} />
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
          key="create-form"
          onCancel={() => setCurrentView('list')}
          onSave={(newRecipe) => handleSaveRecipe(newRecipe, false)}
        />
      )}
    </Layout>
  );
}

export default App;
