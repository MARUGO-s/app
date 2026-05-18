import React, { useState } from 'react';
import { Card } from './Card';
import { normalizeRecipeCategory } from '../constants/recipeCategories';
import {
    RECIPE_LIST_COURSE_ICONS,
    RECIPE_LIST_COURSE_ORDER,
    normalizeRecipeCourse,
    splitRecipesByCourse,
} from '../constants/recipeCourses';
import './RecipeList.css';

const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(max-width: 700px)')?.matches ?? false;
};

const toOptimizedImageSrc = (src, { mobile = false } = {}) => {
    if (!src || typeof src !== 'string') return src;
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;

    // Supabase Image Transform (if available)
    // Keep quality moderate on mobile to reduce transfer size.
    if (src.includes('/storage/v1/object/public/')) {
        const width = mobile ? 360 : 640;
        const quality = mobile ? 55 : 68;
        const separator = src.includes('?') ? '&' : '?';
        return `${src}${separator}width=${width}&quality=${quality}&resize=contain`;
    }

    return src;
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const normalizeTags = (rawTags) => {
    if (Array.isArray(rawTags)) {
        return rawTags
            .flatMap(tag => String(tag || '').split(/[,、]/))
            .map(tag => tag.trim())
            .filter(Boolean);
    }
    if (typeof rawTags === 'string') {
        return rawTags
            .split(/[,、]/)
            .map(tag => tag.trim())
            .filter(Boolean);
    }
    return [];
};

/** recipeService._resolveMasterOwnerTags と同じ既定値 */
const DEFAULT_MASTER_OWNER_TAGS = new Set(['owner:yoshito', 'owner:admin']);

const displayMeta = (value) => {
    const text = String(value ?? '').trim();
    return text || '—';
};

const RecipeListTable = ({
    recipes,
    isSelectMode,
    selectedIds,
    onSelectRecipe,
    onToggleSelection,
    showOwner,
    ownerLabelFn,
}) => (
    <div className="recipe-list-table-wrap" role="region" aria-label="レシピ一覧（リスト表示）">
        <table className="recipe-list-table">
            <thead>
                <tr>
                    <th>レシピ名</th>
                    <th>店舗</th>
                    <th>コース</th>
                    <th>カテゴリー</th>
                    <th>国</th>
                    {showOwner && <th>作成者</th>}
                    <th>登録日</th>
                </tr>
            </thead>
            <tbody>
                {recipes.map((recipe) => {
                    const isSelected = selectedIds && selectedIds.has(recipe.id);
                    return (
                        <tr
                            key={recipe.id}
                            className={`recipe-list-table__row ${isSelected ? 'recipe-list-table__row--selected' : ''}`}
                            onClick={() => {
                                if (isSelectMode) {
                                    onToggleSelection(recipe.id);
                                } else {
                                    onSelectRecipe(recipe);
                                }
                            }}
                        >
                            <td className="recipe-list-table__title" title={recipe.title}>
                                {isSelectMode && (
                                    <span className={`recipe-list-table__checkbox ${isSelected ? 'checked' : ''}`} aria-hidden="true" />
                                )}
                                <span className="recipe-list-table__title-text">{recipe.title}</span>
                            </td>
                            <td className="recipe-list-table__cell--meta" title={displayMeta(recipe.storeName)}>
                                {displayMeta(recipe.storeName)}
                            </td>
                            <td className="recipe-list-table__cell--meta" title={displayMeta(recipe.course)}>
                                {displayMeta(recipe.course)}
                            </td>
                            <td className="recipe-list-table__cell--meta" title={displayMeta(recipe.category)}>
                                {displayMeta(recipe.category)}
                            </td>
                            <td className="recipe-list-table__cell--meta" title={displayMeta(recipe.country)}>
                                {displayMeta(recipe.country)}
                            </td>
                            {showOwner && (
                                <td className="recipe-list-table__cell--meta">
                                    {typeof ownerLabelFn === 'function' ? displayMeta(ownerLabelFn(recipe)) : '—'}
                                </td>
                            )}
                            <td className="recipe-list-table__cell--date">{formatDate(recipe.created_at)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

const RecipeCard = ({ recipe, isSelected, isSelectMode, onSelectRecipe, onToggleSelection, showOwner, ownerLabelFn, index = 0, mobileView = false }) => {
    const style = {
        height: '100%',
        outline: 'none',
    };

    const eagerThreshold = mobileView ? 4 : 8;
    const loadingMode = index < eagerThreshold ? 'eager' : 'lazy';
    const fetchPriority = index < eagerThreshold ? 'high' : 'low';
    const imageSrc = toOptimizedImageSrc(recipe.image, { mobile: mobileView });

    return (
        <div style={style}>
            <Card
                hoverable
                className={`recipe-card ${isSelected ? 'selected' : ''} ${recipe.type === 'bread' ? 'recipe-card--bread' : ''} ${normalizeRecipeCategory(recipe.category, recipe) === 'デザート・お菓子' ? 'recipe-card--dessert' : ''} ${normalizeRecipeCategory(recipe.category, recipe) === '取り込み' || recipe.sourceUrl ? 'recipe-card--url' : ''}`}
                style={{ height: '100%' }}
                onClick={() => {
                    if (isSelectMode) {
                        onToggleSelection(recipe.id);
                    } else {
                        onSelectRecipe(recipe);
                    }
                }}
            >
                <div className="recipe-card__image-wrapper">
                    {recipe.image ? (
                        <img
                            src={imageSrc}
                            alt={recipe.title}
                            className="recipe-card__image"
                            loading={loadingMode}
                            decoding="async"
                            fetchPriority={fetchPriority}
                            sizes={mobileView ? '(max-width: 700px) 45vw, 320px' : '(max-width: 1024px) 33vw, 280px'}
                        />
                    ) : (
                        <div className="recipe-card__image placeholder" />
                    )}
                    <div className="recipe-card__overlay" />

                    {isSelectMode && (
                        <div className="recipe-card__selection-overlay">
                            <div className={`selection-checkbox ${isSelected ? 'checked' : ''}`} />
                        </div>
                    )}

                    <div className="recipe-card__tags">
                        {(() => {
                            const allTags = normalizeTags(recipe.tags);
                            if (allTags.length === 0) return null;
                            // Filter out internal tags (like owner:*)
                            const visibleTags = allTags.filter(t => !t.startsWith('owner:'));
                            const hasImport = visibleTags.some((tag) => /^(取り込み|URL取り込み|PDF取り込み)$/i.test(tag));
                            const displayTags = hasImport ? ['取り込み'] : visibleTags;

                            return displayTags.slice(0, 1).map((tag, index) => (
                                <span key={`${tag}-${index}`} className="recipe-tag">{tag}</span>
                            ));
                        })()}
                    </div>
                </div>
                <div className="recipe-card__content">
                    <h3 className="recipe-title">{recipe.title}</h3>
                    <p className="recipe-desc">{recipe.description}</p>
                    <div className="recipe-meta">
                        {recipe.storeName && <span>🏢 {recipe.storeName}</span>}
                        {recipe.country && <span>🌍 {recipe.country}</span>}
                        {showOwner && typeof ownerLabelFn === 'function' && (
                            <span className="recipe-owner">👤 {ownerLabelFn(recipe)}</span>
                        )}
                        <div className="recipe-dates">
                            <span className="recipe-date">📅 登録: {formatDate(recipe.created_at)}</span>
                            {recipe.updated_at && (
                                <span className="recipe-date">🔄 更新: {formatDate(recipe.updated_at)}</span>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export const RecipeList = ({ recipes, onSelectRecipe, isSelectMode, selectedIds, onToggleSelection, displayMode = 'normal', layoutMode = 'card', publicRecipeView = 'none', showOwner = false, ownerLabelFn, currentUser = null }) => {
    const [expandedSections, setExpandedSections] = useState({});
    const [isMobileView, setIsMobileView] = useState(() => isMobileViewport());

    React.useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mql = window.matchMedia('(max-width: 700px)');
        const onChange = () => setIsMobileView(!!mql.matches);
        onChange();
        if (mql.addEventListener) mql.addEventListener('change', onChange);
        else mql.addListener(onChange);
        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', onChange);
            else mql.removeListener(onChange);
        };
    }, []);

    const toggleSection = (sectionKey) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionKey]: !prev[sectionKey]
        }));
    };

    const isPublicRecipe = (recipe) => {
        const tags = normalizeTags(recipe?.tags).map(t => t.toLowerCase());
        return tags.includes('public');
    };

    const isOwnedByCurrentUser = (recipe) => {
        if (!currentUser) return false;
        const ownerTags = normalizeTags(recipe?.tags).filter(tag => tag.startsWith('owner:'));
        if (ownerTags.length === 0) return false;
        const myOwnerTags = new Set([
            currentUser?.id ? `owner:${currentUser.id}` : null,
            currentUser?.displayId ? `owner:${currentUser.displayId}` : null
        ].filter(Boolean));
        return ownerTags.some(tag => myOwnerTags.has(tag));
    };

    const isMasterSharedRecipe = (recipe) => {
        if (!currentUser?.showMasterRecipes) return false;
        const ownerTags = normalizeTags(recipe?.tags).filter(tag => tag.startsWith('owner:'));
        return ownerTags.some(tag => DEFAULT_MASTER_OWNER_TAGS.has(tag));
    };

    // メイン一覧: 自分のレシピ + 非公開 + マスター共有（fetchRecipes と同じ見える範囲）
    const isMainListRecipe = (recipe) => {
        if (isOwnedByCurrentUser(recipe)) return true;
        if (!isPublicRecipe(recipe)) return true;
        if (isMasterSharedRecipe(recipe)) return true;
        return false;
    };

    const publicRecipes = recipes.filter(r => isPublicRecipe(r));
    const myPublicRecipes = publicRecipes.filter(r => isOwnedByCurrentUser(r));
    const otherUsersPublicRecipes = publicRecipes.filter(
        r => !isOwnedByCurrentUser(r) && !isMasterSharedRecipe(r),
    );
    const mainListRecipes = recipes.filter(isMainListRecipe);

    // メインに出せるレシピがあるときは自動で「自分が公開中」だけにしない
    const effectivePublicRecipeView = (() => {
        if (publicRecipeView !== 'none') return publicRecipeView;
        if (mainListRecipes.length > 0) return 'none';
        if (publicRecipes.length === 0) return 'none';
        if (myPublicRecipes.length > 0) return 'mine';
        return 'others';
    })();

    const courseBuckets = splitRecipesByCourse(mainListRecipes);

    const isListLayout = layoutMode === 'list';

    // カード: 8〜9件 / リスト: コンパクトなので多めに表示
    const [limit, setLimit] = useState(() => {
        if (typeof window === 'undefined') return 9;
        const wide = window.innerWidth >= 1024;
        if (isListLayout) return wide ? 30 : 24;
        return wide ? 9 : 8;
    });

    React.useEffect(() => {
        const handleResize = () => {
            const wide = window.innerWidth >= 1024;
            if (isListLayout) {
                setLimit(wide ? 30 : 24);
            } else {
                setLimit(wide ? 9 : 8);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isListLayout]);

    // Helper to render a section
    const renderSection = (title, items, icon, sectionKey, { showWhenEmpty = false, emptyMessage = '' } = {}) => {
        if (items.length === 0 && !showWhenEmpty) return null;

        // If displayMode is 'all', show everything. 
        // If 'normal', use expansion logic.
        const isAllMode = displayMode === 'all';

        // Determine items to display
        let displayItems = items;
        let isExpanded = false;
        let hasMore = false;

        if (!isAllMode) {
            isExpanded = expandedSections[sectionKey];
            hasMore = items.length > limit;
            displayItems = isExpanded ? items : items.slice(0, limit);
        }

        return (
            <div className="recipe-section" style={{ marginBottom: '2rem' }}>
                <h3
                    onClick={() => !isAllMode && hasMore && toggleSection(sectionKey)}
                    style={{
                        fontSize: '1.2rem',
                        borderLeft: '4px solid var(--color-primary)',
                        paddingLeft: '10px',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: (!isAllMode && hasMore) ? 'pointer' : 'default',
                        userSelect: 'none',
                        color: '#ffffff' // White text as requested
                    }}
                >
                    <span>{icon}</span> {title}
                    <span style={{ fontSize: '0.8rem', color: '#ccc', fontWeight: 'normal' }}>({items.length})</span>
                    {!isAllMode && hasMore && (
                        <span className="section-toggle-btn">
                            {isExpanded ? '▲ 閉じる' : '▼ もっと見る'}
                        </span>
                    )}
                </h3>
                {isListLayout ? (
                    <RecipeListTable
                        recipes={displayItems}
                        isSelectMode={isSelectMode}
                        selectedIds={selectedIds}
                        onSelectRecipe={onSelectRecipe}
                        onToggleSelection={onToggleSelection}
                        showOwner={showOwner}
                        ownerLabelFn={ownerLabelFn}
                    />
                ) : (
                    <div className="recipe-grid">
                        {displayItems.map((recipe, index) => {
                            const isSelected = selectedIds && selectedIds.has(recipe.id);
                            return (
                                <RecipeCard
                                    key={recipe.id}
                                    recipe={recipe}
                                    isSelected={isSelected}
                                    isSelectMode={isSelectMode}
                                    onSelectRecipe={onSelectRecipe}
                                    onToggleSelection={onToggleSelection}
                                    showOwner={showOwner}
                                    ownerLabelFn={ownerLabelFn}
                                    index={index}
                                    mobileView={isMobileView}
                                />
                            );
                        })}
                    </div>
                )}
                {items.length === 0 && (
                    <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        {emptyMessage || `${title}はありません`}
                    </div>
                )}
            </div>
        );
    };

    const renderCourseSections = (buckets, sectionPrefix = '') => (
        RECIPE_LIST_COURSE_ORDER.map((courseKey) => renderSection(
            courseKey,
            buckets[courseKey] || [],
            RECIPE_LIST_COURSE_ICONS[courseKey] || '📁',
            sectionPrefix ? `${sectionPrefix}-${courseKey}` : courseKey,
        )).concat(
            (buckets['未分類']?.length ?? 0) > 0
                ? [renderSection(
                    '未分類',
                    buckets['未分類'] || [],
                    RECIPE_LIST_COURSE_ICONS['未分類'],
                    sectionPrefix ? `${sectionPrefix}-未分類` : '未分類',
                )]
                : [],
        )
    );

    const renderPublicRecipeSections = () => {
        if (effectivePublicRecipeView !== 'mine' && effectivePublicRecipeView !== 'others') return null;

        const isMine = effectivePublicRecipeView === 'mine';
        const title = isMine ? '自分が公開中' : '他ユーザー公開';
        const icon = isMine ? '🟢' : '🌐';
        const sectionPrefix = isMine ? 'public-mine' : 'public-others';
        const items = isMine ? myPublicRecipes : otherUsersPublicRecipes;
        const emptyMessage = isMine
            ? '自分が公開中のレシピはありません'
            : '他ユーザーの公開レシピはありません';

        const grouped = splitRecipesByCourse(items);

        return (
            <div className="public-recipes-block">
                <div className="public-recipes-block__header">
                    <span>{icon}</span>
                    <span>{title}</span>
                    <span className="public-recipes-block__count">({items.length})</span>
                </div>

                {items.length === 0 ? (
                    <div className="public-recipes-block__empty">{emptyMessage}</div>
                ) : (
                    <>{renderCourseSections(grouped, sectionPrefix)}</>
                )}
            </div>
        );
    };

    return (
        <div className={`recipe-list-container${isListLayout ? ' recipe-list-container--list' : ''}`}>
            {renderPublicRecipeSections()}
            {renderCourseSections(courseBuckets)}

            {/* Fallback if no recipes at all */}
            {recipes.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                    レシピがありません。
                </div>
            )}
        </div>
    );
};
