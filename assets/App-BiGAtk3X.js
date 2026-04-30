const e=`import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { RecipeCompositeCostPage } from './components/RecipeCompositeCostPage';
import { IncomingDeliveries } from './components/IncomingDeliveries';
import { IncomingStock } from './components/IncomingStock';
import { Planner } from './components/Planner';
import { OrderList } from './components/OrderList';
import ApiUsageLogs from './components/ApiUsageLogs';
import OperationQaLogs from './components/OperationQaLogs';
import { DeployLogs } from './components/DeployLogs';
import OperationAssistant from './components/OperationAssistant';
import RequestAssistant from './components/RequestAssistant';
import RequestLogs from './components/RequestLogs';
import { supabase } from './supabase';
import { recipeService } from './services/recipeService';
import { formatDisplayId } from './utils/formatUtils';
import { applyImportedRecipeType } from './utils/importRecipeType';
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
        src={\`\${import.meta.env.BASE_URL}header-logo.png\`}
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

const MOBILE_INITIAL_RECIPE_LIMIT = 24;
const DESKTOP_INITIAL_RECIPE_LIMIT = 120;
const MOBILE_RECIPE_PAGE_LIMIT = 64;
const DESKTOP_RECIPE_PAGE_LIMIT = 180;
const NO_STORE_VALUE = '__NO_STORE__';
const OTHER_STORE_VALUE = '__OTHER_STORE__';

const mergeRecipesById = (existing, incoming) => {
  const seen = new Set((existing || []).map(r => String(r.id)));
  const merged = [...(existing || [])];
  for (const recipe of (incoming || [])) {
    const key = String(recipe.id);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(recipe);
  }
  return merged;
};

const normalizeValue = (value) => (value || '').toString().replace(/\\s+/g, ' ').trim();
const normalizeKey = (value) => normalizeValue(value).toLowerCase();
const KNOWN_STORE_KEYS = new Set(STORE_LIST.map(store => normalizeKey(store)).filter(Boolean));

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
  const [isFromCache, setIsFromCache] = useState(false); // true when showing cached data
  const recipeLoadRequestRef = useRef(0);

  // Derived State from URL
  const rawView = searchParams.get('view');
  // Back-compat: previously exposed a create-mock view for the new layout.
  const currentView = (rawView === 'create-mock' ? 'create' : rawView) || 'list'; // 'list', 'detail', 'create', 'edit', 'data', 'trash'
  const selectedRecipeId = searchParams.get('id');

  const selectedRecipe = recipes.find(r => String(r.id) === selectedRecipeId) || null;
  const [editRecipe, setEditRecipe] = useState(null);
  const [isEditRecipeLoading, setIsEditRecipeLoading] = useState(false);

  const [selectedTag, setSelectedTag] = useState('すべて');
  const [importMode, setImportMode] = useState(null); // null | 'url' | 'image'
  const [importedData, setImportedData] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // New search state
  const [publicRecipeView, setPublicRecipeView] = useState('none'); // 'none' | 'mine' | 'others'
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRequestAssistantOpen, setIsRequestAssistantOpen] = useState(false);
  const [isOperationAssistantOpen, setIsOperationAssistantOpen] = useState(false);
  const [requestUnreadCount, setRequestUnreadCount] = useState(0);
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
    'incoming-deliveries': '入荷PDF',
    'incoming-stock': '入荷在庫',
    planner: '仕込みカレンダー',
    data: 'データ管理',
    users: 'ユーザー管理',
    'order-list': '発注リスト',
  };
  const shouldHideAssistantFabs = isRequestAssistantOpen || isOperationAssistantOpen;

  const loadRequestUnreadCount = useCallback(async () => {
    if (user?.role !== 'admin' || !user?.id) {
      setRequestUnreadCount(0);
      return;
    }
    try {
      const { data: stateRows, error: stateError } = await supabase
        .from('user_request_view_states')
        .select('last_seen_at')
        .eq('user_id', user.id)
        .limit(1);
      if (stateError) throw stateError;

      const lastSeenAt = stateRows?.[0]?.last_seen_at || null;
      let query = supabase
        .from('user_requests')
        .select('id', { count: 'exact', head: true });
      if (lastSeenAt) {
        query = query.gt('created_at', lastSeenAt);
      }

      const { count, error } = await query;
      if (error) throw error;
      setRequestUnreadCount(Number.isFinite(Number(count)) ? Number(count) : 0);
    } catch (error) {
      console.error('要望の未確認件数取得に失敗:', error);
      setRequestUnreadCount(0);
    }
  }, [user?.id, user?.role]);

  const markRequestsAsSeen = useCallback(async () => {
    if (user?.role !== 'admin' || !user?.id) return;
    const nowIso = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('user_request_view_states')
        .upsert({
          user_id: user.id,
          last_seen_at: nowIso,
          updated_at: nowIso,
        }, { onConflict: 'user_id' });
      if (error) throw error;
      setRequestUnreadCount(0);
    } catch (error) {
      console.error('要望既読更新に失敗:', error);
    }
  }, [user?.id, user?.role]);

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
    const key = \`pc-recommend-shown:\${currentView}\`;
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

  useEffect(() => {
    loadRequestUnreadCount();
  }, [loadRequestUnreadCount]);

  useEffect(() => {
    if (!isMenuOpen) return;
    if (user?.role !== 'admin') return;
    loadRequestUnreadCount();
  }, [isMenuOpen, user?.role, loadRequestUnreadCount]);

  useEffect(() => {
    if (currentView !== 'requests') return;
    if (user?.role !== 'admin') return;
    markRequestsAsSeen();
  }, [currentView, user?.role, markRequestsAsSeen]);

  useEffect(() => {
    if (currentView !== 'requests') return;
    if (user?.role === 'admin') return;
    setSearchParams({ view: 'list' });
  }, [currentView, user?.role, setSearchParams]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isMenuOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMenuOpen]);

  // If auth init gets stuck for some reason, don't trap the UI on Loading forever.
  useEffect(() => {
    if (!authLoading) {
      setAuthStuckFallback(false);
      return;
    }
    const t = setTimeout(() => setAuthStuckFallback(true), 3500);
    return () => clearTimeout(t);
  }, [authLoading]);

  // FAST PATH: Load cached recipes immediately while auth is still resolving.
  // This eliminates the perceived wait time after login.
  useEffect(() => {
    // Try to show cached recipes as soon as we have *any* user info (even from cache)
    if (recipes.length > 0) return; // Already have data
    if (currentView === 'trash') return; // Don't show cached data for trash

    // Try cached user from localStorage for the userId
    let cachedUserId = user?.id;
    if (!cachedUserId) {
      try {
        const cachedUser = JSON.parse(localStorage.getItem('auth_user_cache') || 'null');
        cachedUserId = cachedUser?.id;
      } catch { /* ignore */ }
    }
    if (!cachedUserId) return;

    const cached = recipeService.getCachedRecipes(cachedUserId);
    if (cached && cached.length > 0) {
      setRecipes(cached);
      setIsFromCache(true);
      setLoading(false); // Show cached list immediately
    }
  }, [user?.id]); // Run once when user becomes available (or from cache)

  // Load lightweight side data once auth is ready.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    loadTrashCount();
    loadRecentHistory();
  }, [authLoading, user?.id]);

  // Clear cross-account residue immediately on account switch/logout.
  useEffect(() => {
    setRecentIds([]);
  }, [user?.id]);

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
    return raw.length > 12 ? \`\${raw.slice(0, 8)}…\` : raw;
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
    if (!user) return;

    const requestId = recipeLoadRequestRef.current + 1;
    recipeLoadRequestRef.current = requestId;
    const isStaleRequest = () => recipeLoadRequestRef.current !== requestId;
    const isTransientRecipeLoadError = (error) => recipeService.isTransientError(error);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const fetchChunkWithRetry = async (params) => {
      const attempts = [
        { timeoutMs: 12000, backoffMs: 0 },
        { timeoutMs: 18000, backoffMs: 500 },
      ];

      let lastError = null;
      for (let i = 0; i < attempts.length; i += 1) {
        const { timeoutMs, backoffMs } = attempts[i];
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }

        try {
          return await recipeService.fetchRecipes(user, {
            timeoutMs,
            includeIngredients: false,
            includeSources: false,
            skipCacheSave: true,
            returnMeta: true,
            ...params,
          });
        } catch (error) {
          lastError = error;
          const isLastAttempt = i === attempts.length - 1;
          if (!isTransientRecipeLoadError(error) || isLastAttempt) {
            throw error;
          }
        }
      }

      throw lastError || new Error('recipe fetch failed');
    };

    const initialLimit = isMobileScreen ? MOBILE_INITIAL_RECIPE_LIMIT : DESKTOP_INITIAL_RECIPE_LIMIT;
    const pageLimit = isMobileScreen ? MOBILE_RECIPE_PAGE_LIMIT : DESKTOP_RECIPE_PAGE_LIMIT;

    try {
      if (!isFromCache) {
        setLoading(true);
      }

      const firstChunk = await fetchChunkWithRetry({
        offset: 0,
        limit: initialLimit,
      });
      if (isStaleRequest()) return;

      let mergedRecipes = firstChunk?.recipes || [];
      let hasMoreRaw = firstChunk?.hasMoreRaw === true;
      let offset = initialLimit;

      setRecipes(mergedRecipes);

      let hasShownInitialList = false;
      if (!isFromCache && (mergedRecipes.length > 0 || !hasMoreRaw)) {
        setLoading(false);
        hasShownInitialList = true;
      }

      while (hasMoreRaw) {
        const nextChunk = await fetchChunkWithRetry({
          offset,
          limit: pageLimit,
        });
        if (isStaleRequest()) return;

        const chunkRecipes = nextChunk?.recipes || [];
        if (chunkRecipes.length > 0) {
          mergedRecipes = mergeRecipesById(mergedRecipes, chunkRecipes);
          setRecipes(mergedRecipes);

          if (!isFromCache && !hasShownInitialList) {
            setLoading(false);
            hasShownInitialList = true;
          }
        }

        offset += pageLimit;
        hasMoreRaw = nextChunk?.hasMoreRaw === true;

        if (chunkRecipes.length === 0 && !hasMoreRaw) {
          break;
        }
      }

      if (isStaleRequest()) return;
      recipeService.saveCachedRecipes(mergedRecipes, user.id);
    } catch (error) {
      if (isStaleRequest()) return;
      console.error("Failed to fetch recipes:", error);
      const hasVisibleCachedList = isFromCache && recipes.length > 0;
      if (!(hasVisibleCachedList && isTransientRecipeLoadError(error))) {
        toast.error(\`レシピの読み込みに時間がかかっています。\\nネットワークをご確認の上、再読み込みしてください。\\n(\${error?.message || 'unknown error'})\`);
      }
    } finally {
      if (!isStaleRequest()) {
        setLoading(false);
        setIsFromCache(false);
      }
    }
  };

  const {
    allCourses,
    allCategories,
    storeCounts,
    noStoreCount,
    otherStoreCount,
    courseCounts,
    categoryCounts,
  } = useMemo(() => {
    const nextAllCourses = [...new Set(recipes.map(r => normalizeValue(r.course)).filter(Boolean))];
    const nextAllCategories = [...new Set(recipes.map(r => normalizeValue(r.category)).filter(Boolean))];

    const nextStoreCounts = recipes.reduce((acc, r) => {
      const key = normalizeKey(r.storeName);
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const nextNoStoreCount = recipes.reduce((acc, r) => {
      const key = normalizeKey(r.storeName);
      return key ? acc : acc + 1;
    }, 0);

    const nextOtherStoreCount = recipes.reduce((acc, r) => {
      const key = normalizeKey(r.storeName);
      if (!key) return acc;
      return KNOWN_STORE_KEYS.has(key) ? acc : acc + 1;
    }, 0);

    const nextCourseCounts = recipes.reduce((acc, r) => {
      const key = normalizeKey(r.course);
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const nextCategoryCounts = recipes.reduce((acc, r) => {
      const key = normalizeKey(r.category);
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      allCourses: nextAllCourses,
      allCategories: nextAllCategories,
      storeCounts: nextStoreCounts,
      noStoreCount: nextNoStoreCount,
      otherStoreCount: nextOtherStoreCount,
      courseCounts: nextCourseCounts,
      categoryCounts: nextCategoryCounts,
    };
  }, [recipes]);

  // Filter recipes based on Tag/Category/Store AND Search Query
  const filteredRecipes = useMemo(() => {
    const normalizedSelectedTag = normalizeKey(selectedTag);
    const query = searchQuery.toLowerCase().trim();

    return recipes.filter(recipe => {
      const storeKey = normalizeKey(recipe.storeName);
      const matchesTag =
        selectedTag === 'すべて' ||
        (selectedTag === 'recent' && recentIds.includes(recipe.id)) ||
        (recipe.tags && recipe.tags.includes(selectedTag)) ||
        (selectedTag === NO_STORE_VALUE && !storeKey) ||
        (selectedTag === OTHER_STORE_VALUE && storeKey && !KNOWN_STORE_KEYS.has(storeKey)) ||
        (recipe.category && normalizeKey(recipe.category) === normalizedSelectedTag) ||
        (recipe.course && normalizeKey(recipe.course) === normalizedSelectedTag) ||
        (recipe.storeName && storeKey === normalizedSelectedTag);

      if (!matchesTag) return false;
      if (!query) return true;

      return (
        (recipe.title || '').toLowerCase().includes(query) ||
        (recipe.description && recipe.description.toLowerCase().includes(query)) ||
        (Array.isArray(recipe.ingredients) && recipe.ingredients.some(ing => (ing?.name || '').toLowerCase().includes(query)))
      );
    });
  }, [recipes, selectedTag, recentIds, searchQuery]);

  const resetListFilters = () => {
    setSelectedTag('すべて');
    setSearchQuery('');
    setPublicRecipeView('none');
    setDisplayMode('normal');
  };

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
      recipeLoadRequestRef.current += 1; // Cancel any in-flight incremental list loading.
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
  };

  const handleSwitchToMain = () => {
    setSearchParams({ view: 'list' });
  };

  const handleLogout = async () => {
    setIsMenuOpen(false);
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
      toast.warning('ログアウトに失敗しました。再度お試しください。');
    }
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
          ownerTag === \`owner:\${user.id}\` ||
          (user.displayId && ownerTag === \`owner:\${user.displayId}\`);

        // If it has an owner tag and I am NOT the owner, I cannot overwrite it.
        // stricter: If I am NOT the confirmed owner, FORCE copy. (Protects legacy/admin recipes without tags)
        if (!isOwner) {
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
      toast.error(\`保存に失敗しました\\nエラー: \${error.message || error.error_description || JSON.stringify(error)}\`);
    }
  };

  // Ensure Edit view always has a full recipe (steps + recipe_sources) before saving,
  // otherwise partial list-view objects can accidentally overwrite steps/sourceUrl.
  useEffect(() => {
    let cancelled = false;

    const loadEditRecipe = async () => {
      if (currentView !== 'edit' || !selectedRecipeId) {
        setEditRecipe(null);
        setIsEditRecipeLoading(false);
        return;
      }

      setIsEditRecipeLoading(true);
      try {
        const data = await recipeService.getRecipe(selectedRecipeId);
        if (cancelled) return;
        setEditRecipe(data);
      } catch (e) {
        console.error('Failed to load edit recipe details', e);
        if (cancelled) return;
        // Fallback to whatever we have so the user can still open the form.
        setEditRecipe(selectedRecipe);
        toast.warning('編集用の詳細データ取得に失敗しました。内容が欠けている可能性があります。');
      } finally {
        if (!cancelled) setIsEditRecipeLoading(false);
      }
    };

    loadEditRecipe();
    return () => {
      cancelled = true;
    };
    // selectedRecipe is only used as a fallback if detail fetch fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, selectedRecipeId]);

  const handleImportRecipe = (recipeData, sourceUrl = '', importOptions = {}) => {
    const importTypeMode = importOptions?.mode === 'image'
      ? (importOptions?.recipeType === 'bread' ? 'bread' : 'normal')
      : 'auto';
    const typedRecipeData = applyImportedRecipeType(recipeData, importTypeMode);

    // Force RecipeForm remount even when importing multiple times in the same "create" view.
    // (RecipeForm initializes local state from initialData only on mount.)
    try {
      typedRecipeData.__importId = (globalThis.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : \`\${Date.now()}_\${Math.random().toString(16).slice(2)}\`;
    } catch {
      typedRecipeData.__importId = \`\${Date.now()}_\${Math.random().toString(16).slice(2)}\`;
    }

    typedRecipeData.sourceUrl = sourceUrl;
    if (sourceUrl) {
      typedRecipeData.category = 'URL取り込み';
    }
    setImportedData(typedRecipeData);
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
    // Check if we have cached recipes to show (if so, we'll skip this full-screen loading)
    let hasCachedData = false;
    try {
      const cachedUser = JSON.parse(localStorage.getItem('auth_user_cache') || 'null');
      if (cachedUser?.id) {
        hasCachedData = !!recipeService.getCachedRecipes(cachedUser.id);
      }
    } catch { /* ignore */ }

    if (!hasCachedData) {
      return (
        <LoadingScreen
          label="初回データを読み込み中"
          subLabel="初回はサーバーからデータを取得するため少しお時間がかかります"
        />
      );
    }
    // If cached data exists, skip full-screen loading → the cached list will render below
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
              {currentView === 'trash' ? 'ゴミ箱 (削除済み)' : \`レシピ一覧\`}
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

                  <div className={\`secondary-actions \${isMenuOpen ? 'open' : ''}\`}>
                    <button
                      type="button"
                      className="slide-menu-close"
                      onClick={() => setIsMenuOpen(false)}
                      aria-label="メニューを閉じる"
                    >
                      ✕
                    </button>

                    <div className="secondary-actions-content">
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
                            ログイン: {formatDisplayId(user?.displayId || user?.email || (user?.id ? \`\${String(user.id).slice(0, 8)}…\` : '---'))}
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

                      <Button
                        variant="secondary"
                        onClick={() => {
                          window.open(\`\${import.meta.env.BASE_URL}recipe.html\`, '_blank', 'noopener,noreferrer');
                          setIsMenuOpen(false);
                        }}
                      >
                        <span style={{ marginRight: '8px' }}>❓</span> Q&A
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() => {
                          window.open(\`\${import.meta.env.BASE_URL}recipe_management.pdf\`, '_blank', 'noopener,noreferrer');
                          setIsMenuOpen(false);
                        }}
                      >
                        <span style={{ marginRight: '8px' }}>📘</span> アプリガイド
                      </Button>

                      <div className="menu-divider"></div>

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
                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'incoming-deliveries' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>📄</span> 入荷PDF
                          </Button>
                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'incoming-stock' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>📥</span> 入荷在庫
                          </Button>
                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'planner' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>📅</span> 仕込みカレンダー
                          </Button>
                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'order-list' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>🛒</span> 発注リスト
                          </Button>
                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'composite-cost' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>🥪</span> 合成原価
                          </Button>
                          <div className="menu-divider"></div>

                          <Button variant="secondary" onClick={() => { setSearchParams({ view: 'data' }); setIsMenuOpen(false); }}>
                            <span style={{ marginRight: '8px' }}>📊</span> データ管理
                          </Button>

                          {user?.role === 'admin' && (
                            <>
                              <Button variant="secondary" onClick={() => { setSearchParams({ view: 'users' }); setIsMenuOpen(false); }}>
                                <span style={{ marginRight: '8px' }}>👥</span> ユーザー管理
                              </Button>
                              <Button variant="secondary" onClick={() => { setSearchParams({ view: 'deploy-logs' }); setIsMenuOpen(false); }}>
                                <span style={{ marginRight: '8px' }}>🚀</span> デプロイ履歴
                              </Button>
                              <Button variant="secondary" onClick={() => { setSearchParams({ view: 'api-logs' }); setIsMenuOpen(false); }}>
                                <span style={{ marginRight: '8px' }}>📊</span> API使用ログ
                              </Button>
                              <Button variant="secondary" onClick={() => { setSearchParams({ view: 'operation-logs' }); setIsMenuOpen(false); }}>
                                <span style={{ marginRight: '8px' }}>🧾</span> 操作質問ログ
                              </Button>
                              <Button variant="secondary" onClick={() => { setSearchParams({ view: 'requests' }); setIsMenuOpen(false); }}>
                                <span style={{ marginRight: '8px' }}>📨</span> 要望一覧
                                {requestUnreadCount > 0 && (
                                  <span className="request-badge">
                                    {requestUnreadCount > 99 ? '99+' : requestUnreadCount}
                                  </span>
                                )}
                              </Button>
                            </>
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

                      <Button variant="ghost" onClick={handleLogout}>
                        <span style={{ marginRight: '8px' }}>🚪</span> ログアウト
                      </Button>
                    </div>
                  </div>

                  {/* Backdrop for closing menu */}
                  <div
                    className={\`menu-backdrop \${isMenuOpen ? 'open' : ''}\`}
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
                  className={\`public-recipe-toggle-btn \${publicRecipeView === 'mine' ? 'active' : ''}\`}
                  aria-pressed={publicRecipeView === 'mine'}
                  onClick={() => setPublicRecipeView('mine')}
                >
                  🟢 自分公開中
                </button>
                <button
                  type="button"
                  className={\`public-recipe-toggle-btn \${publicRecipeView === 'others' ? 'active' : ''}\`}
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
                className={\`tag-filter-btn \${displayMode === 'normal' ? 'active' : ''}\`}
                onClick={() => setDisplayMode('normal')}
                style={{ minWidth: 'auto', padding: '4px 12px' }}
              >
                通常
              </button>
              <button
                className={\`tag-filter-btn \${displayMode === 'all' ? 'active' : ''}\`}
                onClick={() => setDisplayMode('all')}
                style={{ minWidth: 'auto', padding: '4px 12px' }}
              >
                全表示
              </button>
            </div>
          </div>

          {loading ? (
            <LoadingScreen
              label={isFromCache ? "最新データに更新中" : "レシピ一覧を読み込み中"}
              subLabel={isFromCache ? undefined : "初回はサーバーからデータを取得するため少しお時間がかかります"}
              variant="inline"
              showLogo={false}
            />
          ) : (
            recipes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                {currentView === 'trash' ? 'ゴミ箱は空です' : 'レシピがありません'}
                {selectedTag !== 'すべて' && <p>条件を変更して検索してください</p>}
              </div>
            ) : filteredRecipes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                条件に一致するレシピがありません
                <p style={{ marginTop: '0.5rem' }}>検索/絞り込み/公開表示の条件を確認してください</p>
                <div style={{ marginTop: '1rem' }}>
                  <Button variant="secondary" size="sm" onClick={resetListFilters}>
                    フィルターをリセット
                  </Button>
                </div>
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
                    displayMode={displayMode}
                    publicRecipeView={publicRecipeView}
                    showOwner={user?.role === 'admin'}
                    ownerLabelFn={getRecipeOwnerLabel}
                    currentUser={user}
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
          onOpenCompositeCost={() => setSearchParams({
            view: 'composite-cost',
            baseId: String(selectedRecipe.id),
            from: 'detail',
          })}
        />
      )}

      {currentView === 'edit' && selectedRecipeId && (
        isEditRecipeLoading ? (
          <LoadingScreen
            label="レシピを読み込み中"
            subLabel="作り方とURLを取得しています"
          />
        ) : (
          editRecipe && (
            <RecipeForm
              key={\`edit-\${selectedRecipeId}\`}
              initialData={editRecipe}
              onCancel={() => setSearchParams({ view: 'detail', id: selectedRecipeId })}
              onSave={(updatedRecipe) => handleSaveRecipe(updatedRecipe, true)}
            />
          )
        )
      )}

      {currentView === 'create' && (
        <RecipeForm
          key={importedData?.__importId ? \`create-form-imported-\${importedData.__importId}\` : 'create-form'}
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

      {currentView === 'composite-cost' && (
        <RecipeCompositeCostPage
          initialRecipeId={searchParams.get('baseId') || ''}
          onBack={() => {
            const from = searchParams.get('from');
            const baseId = searchParams.get('baseId');
            if (from === 'detail' && baseId) {
              setSearchParams({ view: 'detail', id: baseId });
              return;
            }
            setSearchParams({ view: 'list' });
          }}
        />
      )}

      {currentView === 'incoming-deliveries' && (
        <IncomingDeliveries onBack={() => setSearchParams({ view: 'list' })} />
      )}

      {currentView === 'incoming-stock' && (
        <IncomingStock onBack={() => setSearchParams({ view: 'list' })} />
      )}

      {currentView === 'planner' && (
        <Planner
          onBack={() => setSearchParams({ view: 'list' })}
          onSelectRecipe={(r) => handleSelectRecipe(r, { from: 'planner' })}
          onNavigateToOrderList={() => setSearchParams({ view: 'order-list' })}
        />
      )}

      {currentView === 'order-list' && (
        <OrderList
          onBack={() => setSearchParams({ view: 'list' })}
          onNavigateToPlanner={() => setSearchParams({ view: 'planner' })}
        />
      )}

      {currentView === 'deploy-logs' && user?.role === 'admin' && (
        <DeployLogs onBack={() => setSearchParams({ view: 'list' })} />
      )}

      {currentView === 'api-logs' && user?.role === 'admin' && (
        <>
          <div style={{ padding: '20px 20px 0', textAlign: 'left' }}>
            <Button onClick={() => setSearchParams({ view: 'list' })}>
              ← レシピリストに戻る
            </Button>
          </div>
          <ApiUsageLogs />
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Button onClick={() => setSearchParams({ view: 'list' })}>
              ← レシピリストに戻る
            </Button>
          </div>
        </>
      )}

      {currentView === 'operation-logs' && user?.role === 'admin' && (
        <>
          <div style={{ padding: '20px 20px 0', textAlign: 'left' }}>
            <Button onClick={() => setSearchParams({ view: 'list' })}>
              ← レシピリストに戻る
            </Button>
          </div>
          <OperationQaLogs />
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Button onClick={() => setSearchParams({ view: 'list' })}>
              ← レシピリストに戻る
            </Button>
          </div>
        </>
      )}
      {currentView === 'requests' && user?.role === 'admin' && (
        <>
          <div style={{ padding: '20px 20px 0', textAlign: 'left' }}>
            <Button onClick={() => setSearchParams({ view: 'list' })}>
              ← レシピリストに戻る
            </Button>
          </div>
          <RequestLogs userRole={user?.role} />
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Button onClick={() => setSearchParams({ view: 'list' })}>
              ← レシピリストに戻る
            </Button>
          </div>
        </>
      )}
      <RequestAssistant
        currentView={currentView}
        userRole={user?.role}
        hideFab={shouldHideAssistantFabs}
        onModalOpenChange={setIsRequestAssistantOpen}
      />
      <OperationAssistant
        currentView={currentView}
        userRole={user?.role}
        hideFab={shouldHideAssistantFabs}
        onModalOpenChange={setIsOperationAssistantOpen}
      />
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
`;export{e as default};
