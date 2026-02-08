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
import { Inventory } from './components/Inventory';
import { Planner } from './components/Planner';
import { OrderList } from './components/OrderList';
import { recipeService } from './services/recipeService';
import { userService } from './services/userService';
import { STORE_LIST } from './constants';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { useAuth } from './contexts/useAuth';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { useToast } from './contexts/useToast';
import { LoginPage } from './components/LoginPage';
import { PasswordResetPage } from './components/PasswordResetPage';
import { Modal } from './components/Modal';
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

const LoadingScreen = ({
  label,
  subLabel,
  variant = 'screen',
  showLogo = true,
}) => (
  <div className={variant === 'screen' ? 'loading-screen' : 'loading-inline'}>
    {showLogo && (
      <img
        className="loading-logo"
        src={`${import.meta.env.BASE_URL}header-logo.png`}
        alt="Recipe management"
      />
    )}
    <div className="loading-text">
      {label}
      <span className="loading-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
    <div className="loading-spinner" aria-hidden="true" />
    {subLabel && <div className="loading-subtext">{subLabel}</div>}
  </div>
);

function AppContent() {
  const { user, logout, loading: authLoading, isPasswordRecovery } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trashCount, setTrashCount] = useState(0);
  const [recentIds, setRecentIds] = useState([]);
  const [authStuckFallback, setAuthStuckFallback] = useState(false);
  const [profilesById, setProfilesById] = useState({});
  const [profilesByDisplayId, setProfilesByDisplayId] = useState({});

  // Derived State from URL
  const rawView = searchParams.get('view');
  // Back-compat: previously exposed a create-mock view for the new layout.
  const currentView = (rawView === 'create-mock' ? 'create' : rawView) || 'list'; // 'list', 'detail', 'create', 'edit', 'data', 'trash'
  const selectedRecipeId = searchParams.get('id');

  const selectedRecipe = recipes.find(r => String(r.id) === selectedRecipeId) || null;

  const [selectedTag, setSelectedTag] = useState('すべて');
  const [importMode, setImportMode] = useState(null); // null | 'url' | 'image'
  const [importedData, setImportedData] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // New search state
  const [publicRecipeView, setPublicRecipeView] = useState('none'); // 'none' | 'mine' | 'others'
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState(new Set());
  const [displayMode, setDisplayMode] = useState('normal'); // 'normal' | 'all'
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false);
  const [pcRecommendModalView, setPcRecommendModalView] = useState(null); // null | view string
  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(max-width: 700px)')?.matches ?? false;
  });

  const PC_RECOMMEND_VIEWS = {
    inventory: '在庫管理',
    planner: '仕込みカレンダー',
    data: 'データ管理',
    users: 'ユーザー管理',
    'order-list': '発注リスト',
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 700px)');
    const onChange = () => setIsMobileScreen(!!mql.matches);
    onChange();
    // Safari compatibility: addListener/removeListener
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  // Show "PC recommended" modal when entering certain screens on mobile.
  useEffect(() => {
    if (!isMobileScreen) return;
    if (!currentView) return;
    if (!PC_RECOMMEND_VIEWS[currentView]) return;
    if (typeof window === 'undefined') return;
    const key = `pc-recommend-shown:${currentView}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // ignore storage errors
    }
    setPcRecommendModalView(currentView);
  }, [currentView, isMobileScreen]);

  useEffect(() => {
    if (currentView !== 'list') setPublicRecipeView('none');
  }, [currentView]);

  // If auth init gets stuck for some reason, don't trap the UI on Loading forever.
  useEffect(() => {
    if (!authLoading) {
      setAuthStuckFallback(false);
      return;
    }
    const t = setTimeout(() => setAuthStuckFallback(true), 3500);
    return () => clearTimeout(t);
  }, [authLoading]);

  // Initial data load should run only after auth is resolved and user exists.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    // Load all data in parallel for faster initial load
    (async () => {
      try {
        const mainRecipePromise = currentView === 'trash' ? loadDeletedRecipes() : loadRecipes();

        // Execute all three data loads in parallel
        await Promise.all([
          mainRecipePromise,
          loadTrashCount(),
          loadRecentHistory()
        ]);
      } catch (error) {
        console.error('Error during initial data load:', error);
      }
    })();
  }, [authLoading, user?.id]);

  // Admin helper: load all profiles so we can show "which user's recipe" in UI.
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'admin') {
      setProfilesById({});
      setProfilesByDisplayId({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await userService.fetchAllProfiles();
        if (cancelled) return;
        const byId = {};
        const byDisplay = {};
        for (const p of list || []) {
          if (p?.id) byId[String(p.id)] = p;
          if (p?.display_id) byDisplay[String(p.display_id)] = p;
        }
        setProfilesById(byId);
        setProfilesByDisplayId(byDisplay);
      } catch (e) {
        console.warn('Failed to load profiles for admin owner labels', e);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.id, user?.role]);

  const getRecipeOwnerLabel = (recipe) => {
    const tags = recipe?.tags || [];
    const ownerTag = tags.find(t => t && t.startsWith('owner:'));
    if (!ownerTag) return '共有/旧データ';
    const raw = String(ownerTag.slice('owner:'.length));
    const p = profilesById[raw] || profilesByDisplayId[raw] || null;
    if (p) return p.display_id || p.email || raw;
    return raw.length > 12 ? `${raw.slice(0, 8)}…` : raw;
  };

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
      const data = await recipeService.fetchRecipes(user, { timeoutMs: 15000 });
      setRecipes(data || []);
    } catch (error) {
      console.error("Failed to fetch recipes:", error);
      toast.error(`レシピの読み込みに時間がかかっています。\nネットワークをご確認の上、再読み込みしてください。\n(${error?.message || 'unknown error'})`);
    } finally {
      setLoading(false);
    }
  };

  const normalizeValue = (value) => (value || '').toString().replace(/\s+/g, ' ').trim();
  const normalizeKey = (value) => normalizeValue(value).toLowerCase();
  const NO_STORE_VALUE = '__NO_STORE__';
  const OTHER_STORE_VALUE = '__OTHER_STORE__';

  // Get unique courses and categories
  const allCourses = [...new Set(recipes.map(r => normalizeValue(r.course)).filter(Boolean))];
  const allCategories = [...new Set(recipes.map(r => normalizeValue(r.category)).filter(Boolean))];

  // Calculate counts
  const storeCounts = recipes.reduce((acc, r) => {
    const key = normalizeKey(r.storeName);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const knownStoreKeys = new Set(STORE_LIST.map(store => normalizeKey(store)).filter(Boolean));
  const noStoreCount = recipes.reduce((acc, r) => {
    const key = normalizeKey(r.storeName);
    if (!key) return acc + 1;
    return acc;
  }, 0);
  const otherStoreCount = recipes.reduce((acc, r) => {
    const key = normalizeKey(r.storeName);
    if (!key) return acc;
    if (!knownStoreKeys.has(key)) return acc + 1;
    return acc;
  }, 0);

  const courseCounts = recipes.reduce((acc, r) => {
    const key = normalizeKey(r.course);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const categoryCounts = recipes.reduce((acc, r) => {
    const key = normalizeKey(r.category);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Filter recipes based on Tag/Category/Store AND Search Query
  const filteredRecipes = recipes.filter(recipe => {
    // 1. Tag/Category/Store Filter
    const normalizedSelectedTag = normalizeKey(selectedTag);
    const matchesTag =
      selectedTag === 'すべて' ||
      (selectedTag === 'recent' && recentIds.includes(recipe.id)) ||
      (recipe.tags && recipe.tags.includes(selectedTag)) ||
      (selectedTag === NO_STORE_VALUE && !normalizeKey(recipe.storeName)) ||
      (selectedTag === OTHER_STORE_VALUE && normalizeKey(recipe.storeName) && !knownStoreKeys.has(normalizeKey(recipe.storeName))) ||
      (recipe.category && normalizeKey(recipe.category) === normalizedSelectedTag) ||
      (recipe.course && normalizeKey(recipe.course) === normalizedSelectedTag) ||
      (recipe.storeName && normalizeKey(recipe.storeName) === normalizedSelectedTag);

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

  const handleSelectRecipe = (recipe, extraParams = {}) => {
    // Navigate to detail view
    setSearchParams({ view: 'detail', id: recipe.id, ...extraParams });
  };

  const handleDeleteRecipe = async (recipe, isRestore = false) => {
    try {
      // Protection: master recipe check
      if (recipe.tags && user.role !== 'admin' && user.displayId !== 'yoshito') {
        const isMaster = recipe.tags.some(t => t === 'owner:yoshito');
        if (isMaster) {
          toast.warning('マスターレシピは削除できません');
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
        toast.success('レシピを復元しました');
      } else {
        await recipeService.deleteRecipe(recipe.id);
        setRecipes(recipes.filter(r => r.id !== recipe.id));
        setSearchParams({ view: 'list' });
        loadTrashCount();
      }
    } catch (error) {
      console.error("Failed to delete/restore recipe:", error);
      toast.error('操作に失敗しました');
    } finally {
      loadTrashCount();
    }
  };

  const handleHardDeleteRecipe = async (recipe) => {
    try {
      await recipeService.hardDeleteRecipe(recipe.id);
      setRecipes(recipes.filter(r => r.id !== recipe.id));
      setSearchParams({ view: 'trash' });
      toast.success('レシピを完全に削除しました');
      loadDeletedRecipes(); // Reload list to reflect changes
      loadTrashCount(); // Update count
    } catch (error) {
      console.error("Failed to hard delete recipe:", error);
      toast.error('完全に削除することに失敗しました');
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
      if (isEdit && user.role !== 'admin') {
        const ownerTag = recipe.tags?.find(t => t.startsWith('owner:'));
        const isOwner =
          ownerTag === `owner:${user.id}` ||
          (user.displayId && ownerTag === `owner:${user.displayId}`);

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
      toast.error(`保存に失敗しました\nエラー: ${error.message || error.error_description || JSON.stringify(error)}`);
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
        loadDeletedRecipes();
      } else {
        await Promise.all(Array.from(selectedRecipeIds).map(id => recipeService.deleteRecipe(id)));
        setRecipes(recipes.filter(r => !selectedRecipeIds.has(r.id)));
        loadTrashCount();
      }
      setSelectedRecipeIds(new Set());
      setIsSelectMode(false);
      toast.success('削除しました');

    } catch (error) {
      console.error("Bulk delete failed", error);
      toast.warning('一部の削除に失敗した可能性があります');
      if (currentView === 'trash') loadDeletedRecipes();
      else loadRecipes();
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRestore = () => {
    if (selectedRecipeIds.size === 0) return;
    setShowBulkRestoreConfirm(true);
  };

  const cancelBulkRestore = () => {
    setShowBulkRestoreConfirm(false);
  };

  const confirmBulkRestore = async () => {
    setShowBulkRestoreConfirm(false);
    try {
      setLoading(true);
      for (const id of selectedRecipeIds) {
        await recipeService.restoreRecipe(id);
      }
      setRecipes(recipes.filter(r => !selectedRecipeIds.has(r.id)));
      loadTrashCount();
      setIsSelectMode(false);
      setSelectedRecipeIds(new Set());
      toast.success('復元しました');
      loadDeletedRecipes();
    } catch (error) {
      console.error("Bulk restore failed", error);
      toast.warning('一部の復元に失敗した可能性があります');
      loadDeletedRecipes();
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

  // View change loader (trash vs list) with auth gating.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (currentView === 'trash') loadDeletedRecipes();
    else if (currentView === 'list') loadRecipes();
  }, [currentView, authLoading, user?.id]);

  if (authLoading && !authStuckFallback) {
    return (
      <LoadingScreen
        label="レシピデータを読み込み中"
        subLabel="通信状況によって時間がかかる場合があります"
      />
    );
  }
  if (!user) return <LoginPage />;
  if (isPasswordRecovery) return <PasswordResetPage />;

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

      {showBulkRestoreConfirm && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', border: '2px solid #2f9e44', backgroundColor: 'white' }}>
            <h3 style={{ marginTop: 0, color: '#2f9e44', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>↩︎</span> {selectedRecipeIds.size}件のレシピを復元
            </h3>
            <p style={{ margin: '1rem 0', color: '#333' }}>
              選択したレシピを復元しますか？
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <Button variant="ghost" onClick={cancelBulkRestore}>キャンセル</Button>
              <Button
                variant="secondary"
                onClick={confirmBulkRestore}
                style={{ backgroundColor: '#2f9e44', color: 'white', border: 'none' }}
              >
                復元する
              </Button>
            </div>
          </Card>
        </div>
      )}
      {/* PC recommended warning on mobile for certain screens */}
      <Modal
        isOpen={!!pcRecommendModalView}
        onClose={() => setPcRecommendModalView(null)}
        title="PCかタブレットでの利用を推奨します"
        size="small"
      >
        <div style={{ color: '#333', lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            {PC_RECOMMEND_VIEWS[pcRecommendModalView] ? (
              <>「<strong>{PC_RECOMMEND_VIEWS[pcRecommendModalView]}</strong>」はスマホだと表示が崩れる/操作しづらい場合があります。</>
            ) : (
              <>この画面はスマホだと表示が崩れる/操作しづらい場合があります。</>
            )}
          </p>
          <p style={{ marginBottom: 0 }}>
            可能なら<strong>PCかタブレットで開いて</strong>操作してください。
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setPcRecommendModalView(null);
                setSearchParams({ view: 'list' });
              }}
            >
              一覧に戻る
            </Button>
            <Button variant="primary" onClick={() => setPcRecommendModalView(null)}>
              OK
            </Button>
          </div>
        </div>
      </Modal>

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
                        <>
                          <Button
                            onClick={() => {
                              setImportedData(null);
                              setSearchParams({ view: 'create' });
                            }}
                            className="primary-action-btn"
                          >
                            + レシピ追加
                          </Button>
                        </>
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
                    ☰
                  </button>

                  <div className={`secondary-actions ${isMenuOpen ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="slide-menu-close"
                      onClick={() => setIsMenuOpen(false)}
                      aria-label="メニューを閉じる"
                    >
                      ✕
                    </button>

                    {/* Logged-in user indicator */}
                    <div
                      className="slide-menu-user"
                      style={{
                        marginBottom: '1rem',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.25)',
                        background: 'rgba(0,0,0,0.15)',
                        color: 'white',
                        fontSize: '0.9rem',
                        lineHeight: 1.4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ fontWeight: 'bold' }}>
                          ログイン: {user?.displayId || user?.email || (user?.id ? `${String(user.id).slice(0, 8)}…` : '---')}
                        </div>
                        {user?.role === 'admin' && (
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: 'rgba(255,255,255,0.2)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            whiteSpace: 'nowrap'
                          }}>
                            管理者
                          </span>
                        )}
                      </div>
                      {user?.email && user?.displayId && (
                        <div style={{ opacity: 0.85, fontSize: '0.8rem', marginTop: '4px', wordBreak: 'break-all' }}>
                          {user.email}
                        </div>
                      )}
                    </div>

                    {currentView === 'list' && (
                      <>
                        <Button variant="secondary" onClick={() => { setImportMode('url'); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>🌐</span> Webから追加
                        </Button>
                        <Button variant="secondary" onClick={() => { setImportMode('image'); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>📷</span> 画像から追加
                        </Button>
                        <div className="menu-divider"></div>

                        <div className="pc-recommend-note">
                          <div className="pc-recommend-note__title">以下の操作はPCかタブレット推奨</div>
                        </div>

                        <Button variant="secondary" onClick={() => { setSearchParams({ view: 'inventory' }); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>📦</span> 在庫管理
                        </Button>
                        <Button variant="secondary" onClick={() => { setSearchParams({ view: 'planner' }); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>📅</span> 仕込みカレンダー
                        </Button>
                        <div className="menu-divider"></div>
                        <Button variant="secondary" onClick={() => { setSearchParams({ view: 'data' }); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>📊</span> データ管理
                        </Button>

                        {user?.role === 'admin' && (
                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'users' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>👥</span> ユーザー管理
                          </Button>
                        )}
                        <div className="menu-divider"></div>
                        <Button variant="secondary" onClick={() => { setSearchParams({ view: 'order-list' }); setIsMenuOpen(false); }}>
                          <span style={{ marginRight: '8px' }}>🛒</span> 発注リスト
                        </Button>

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
            <div className="list-toolbar">
              <div className="search-container search-container--compact">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="レシピ名、材料、メモから検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="public-recipe-toggles">
                <button
                  type="button"
                  className={`public-recipe-toggle-btn ${publicRecipeView === 'mine' ? 'active' : ''}`}
                  aria-pressed={publicRecipeView === 'mine'}
                  onClick={() => setPublicRecipeView('mine')}
                >
                  🟢 自分公開中
                </button>
                <button
                  type="button"
                  className={`public-recipe-toggle-btn ${publicRecipeView === 'others' ? 'active' : ''}`}
                  aria-pressed={publicRecipeView === 'others'}
                  onClick={() => setPublicRecipeView('others')}
                >
                  🌐 他ユーザー公開
                </button>
                {publicRecipeView !== 'none' && (
                  <button
                    type="button"
                    className="public-recipe-toggle-btn public-recipe-toggle-btn--hide"
                    onClick={() => setPublicRecipeView('none')}
                  >
                    ✕ 公開非表示
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="tag-filter-container">
            <select
              className="store-filter-select"
              value={
                selectedTag === NO_STORE_VALUE
                  ? NO_STORE_VALUE
                  : selectedTag === OTHER_STORE_VALUE
                    ? OTHER_STORE_VALUE
                    : (STORE_LIST.includes(selectedTag) ? selectedTag : "")
              }
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">店舗</option>
              {STORE_LIST.map(store => (
                <option key={store} value={store}>{store} ({storeCounts[normalizeKey(store)] || 0})</option>
              ))}
              <option value={NO_STORE_VALUE}>未登録 ({noStoreCount})</option>
              <option value={OTHER_STORE_VALUE}>その他 ({otherStoreCount})</option>
            </select>

            <select
              className="store-filter-select"
              value={allCourses.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">コース</option>
              {allCourses.sort().map(course => (
                <option key={course} value={course}>{course} ({courseCounts[normalizeKey(course)] || 0})</option>
              ))}
            </select>

            <select
              className="store-filter-select"
              value={allCategories.includes(selectedTag) ? selectedTag : ""}
              onChange={(e) => setSelectedTag(e.target.value || 'すべて')}
            >
              <option value="">カテゴリー</option>
              {allCategories.sort().map(cat => (
                <option key={cat} value={cat}>{cat} ({categoryCounts[normalizeKey(cat)] || 0})</option>
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
            <LoadingScreen
              label="レシピ一覧を読み込み中"
              variant="inline"
              showLogo={false}
            />
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
                        publicRecipeView={publicRecipeView}
                        showOwner={user?.role === 'admin'}
                        ownerLabelFn={getRecipeOwnerLabel}
                        currentUser={user}
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
                      publicRecipeView={publicRecipeView}
                      showOwner={user?.role === 'admin'}
                      ownerLabelFn={getRecipeOwnerLabel}
                      currentUser={user}
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
          ownerLabel={user?.role === 'admin' ? getRecipeOwnerLabel(selectedRecipe) : undefined}
          isDeleted={!!selectedRecipe.deletedAt}
          onBack={() => {
            const from = searchParams.get('from');
            if (from === 'planner') {
              setSearchParams({ view: 'planner' });
            } else if (selectedRecipe.deletedAt) {
              handleSwitchToTrash();
            } else {
              handleSwitchToMain();
            }
          }}
          backLabel={searchParams.get('from') === 'planner' ? '← カレンダーに戻る' : undefined}
          onList={searchParams.get('from') === 'planner' ? handleSwitchToMain : undefined}
          onEdit={() => setSearchParams({ view: 'edit', id: selectedRecipe.id, from: searchParams.get('from') })}
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

      {(currentView === 'data' || currentView === 'data-management') && (
        <DataManagement onBack={() => setSearchParams({ view: 'list' })} />
      )}


      {currentView === 'levain-guide' && (
        <LevainGuide onBack={() => setSearchParams({ view: 'list' })} />
      )}

      {currentView === 'users' && user?.role === 'admin' && (
        <UserManagement onBack={() => setSearchParams({ view: 'list' })} />
      )}

      {currentView === 'inventory' && (
        <Inventory onBack={() => setSearchParams({ view: 'list' })} />
      )}

      {currentView === 'planner' && (
        <Planner
          onBack={() => setSearchParams({ view: 'list' })}
          onSelectRecipe={(r) => handleSelectRecipe(r, { from: 'planner' })}
        />
      )}

      {currentView === 'order-list' && (
        <OrderList onBack={() => setSearchParams({ view: 'list' })} />
      )}
    </Layout>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
