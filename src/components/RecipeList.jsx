import React, { useState } from 'react';
import { Card } from './Card';
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

const RecipeCard = ({ recipe, isSelected, isSelectMode, onSelectRecipe, onToggleSelection, showOwner, ownerLabelFn, index = 0, mobileView = false }) => {
    const style = {
        touchAction: 'pan-y',
        height: '100%',
        outline: 'none',
        cursor: 'default'
    };

    const eagerThreshold = mobileView ? 4 : 8;
    const loadingMode = index < eagerThreshold ? 'eager' : 'lazy';
    const fetchPriority = index < eagerThreshold ? 'high' : 'low';
    const imageSrc = toOptimizedImageSrc(recipe.image, { mobile: mobileView });

    return (
        <div style={style}>
            <Card
                hoverable
                className={`recipe-card ${isSelected ? 'selected' : ''} ${recipe.type === 'bread' ? 'recipe-card--bread' : ''} ${(/デザート|Dessert/i.test(recipe.category || '') || (recipe.tags && recipe.tags.some(t => /デザート|Dessert/i.test(t)))) ? 'recipe-card--dessert' : ''} ${recipe.category === 'URL取り込み' || recipe.sourceUrl ? 'recipe-card--url' : ''}`}
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
                            // Prioritize 'URL取り込み'
                            const hasImport = visibleTags.includes('URL取り込み');
                            const displayTags = hasImport ? ['URL取り込み'] : visibleTags;

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

const isBread = (recipe) => {
    const tags = normalizeTags(recipe.tags);
    return recipe.type === 'bread' || tags.some(t => /パン|Bread/i.test(t));
};

const isDessert = (recipe) => {
    const isDessertTag = (t) => /デザート|Dessert/i.test(t);
    const tags = normalizeTags(recipe.tags);
    return /デザート|Dessert/i.test(recipe.category || '') || tags.some(isDessertTag);
};

const isSauce = (recipe) => {
    const tags = normalizeTags(recipe.tags);
    return /ソース|Sauce/i.test(recipe.category || '') || tags.some(t => /ソース|Sauce/i.test(t));
};

const isDecoration = (recipe) => {
    // "飾り" or "Deco" or "Garnish"? 
    const tags = normalizeTags(recipe.tags);
    return /飾り|デコ|Decor/i.test(recipe.category || '') || tags.some(t => /飾り|デコ|Decor/i.test(t));
};

const isDressing = (recipe) => {
    const cat = recipe.category || '';
    const tags = normalizeTags(recipe.tags);
    return /ドレッシング|Dressing|ヴィネグレット|Vinaigrette|マヨネーズ|Mayonnaise/i.test(cat) ||
        tags.some(t => /ドレッシング|Dressing|ヴィネグレット|Vinaigrette|マヨネーズ|Mayonnaise/i.test(t));
};

const splitRecipesBySection = (list) => {
    // Bread
    const breadRecipes = list.filter(r => isBread(r));
    const nonBread = list.filter(r => !isBread(r));

    // Sauce
    const sauceRecipes = nonBread.filter(r => isSauce(r));
    const nonSauce = nonBread.filter(r => !isSauce(r));

    // Decoration
    const decorationRecipes = nonSauce.filter(r => isDecoration(r));
    const nonDecoration = nonSauce.filter(r => !isDecoration(r));

    // Dressing
    const dressingRecipes = nonDecoration.filter(r => isDressing(r));
    const nonDressing = nonDecoration.filter(r => !isDressing(r));

    // Dessert
    const dessertRecipes = nonDressing.filter(r => isDessert(r));

    // Cooking (Rest)
    const cookingRecipes = nonDressing.filter(r => !isDessert(r));

    return {
        cookingRecipes,
        breadRecipes,
        dessertRecipes,
        sauceRecipes,
        dressingRecipes,
        decorationRecipes,
    };
};

export const RecipeList = ({ recipes, onSelectRecipe, isSelectMode, selectedIds, onToggleSelection, displayMode = 'normal', publicRecipeView = 'none', showOwner = false, ownerLabelFn, currentUser = null }) => {
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

    // 1. Filter into categories (Priority: Public -> Bread -> Sauce -> Decoration -> Dessert -> Cooking)
    // Adjust priority based on user likelyhood. Dessert might contain sauces?
    // User requested separation, so Sauce/Decoration should pull out from Dessert/Cooking.

    // Public category (all published recipes)
    const publicRecipes = recipes.filter(r => isPublicRecipe(r));
    const myPublicRecipes = publicRecipes.filter(r => isOwnedByCurrentUser(r));
    const otherUsersPublicRecipes = publicRecipes.filter(r => !isOwnedByCurrentUser(r));
    const nonPublicShared = recipes.filter(r => !isPublicRecipe(r));

    // If all available recipes are public, avoid looking "empty" by auto-showing a public section.
    const effectivePublicRecipeView = (() => {
        if (publicRecipeView !== 'none') return publicRecipeView;
        if (publicRecipes.length === 0 || nonPublicShared.length > 0) return 'none';
        if (myPublicRecipes.length > 0) return 'mine';
        return 'others';
    })();

    const {
        cookingRecipes,
        breadRecipes,
        dessertRecipes,
        sauceRecipes,
        dressingRecipes,
        decorationRecipes,
    } = splitRecipesBySection(nonPublicShared);

    // Dynamic limit based on screen width
    // Mobile/Tablet (< 1024px): 8 items
    // Desktop (>= 1024px): 9 items
    const [limit, setLimit] = useState(typeof window !== 'undefined' && window.innerWidth >= 1024 ? 9 : 8);

    React.useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setLimit(9);
            } else {
                setLimit(8);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
                {items.length === 0 && (
                    <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        {emptyMessage || `${title}はありません`}
                    </div>
                )}
            </div>
        );
    };

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

        const grouped = splitRecipesBySection(items);

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
                    <>
                        {renderSection("料理", grouped.cookingRecipes, "🍽️", `${sectionPrefix}-cooking`)}
                        {renderSection("パン", grouped.breadRecipes, "🍞", `${sectionPrefix}-bread`)}
                        {renderSection("デザート", grouped.dessertRecipes, "🍰", `${sectionPrefix}-dessert`)}
                        {renderSection("ソース", grouped.sauceRecipes, "🥣", `${sectionPrefix}-sauce`)}
                        {renderSection("ドレッシング", grouped.dressingRecipes, "🥗", `${sectionPrefix}-dressing`)}
                        {renderSection("飾り", grouped.decorationRecipes, "✨", `${sectionPrefix}-decoration`)}
                    </>
                )}
            </div>
        );
    };

    const shouldShowPublicHiddenHint =
        effectivePublicRecipeView === 'none' &&
        publicRecipes.length > 0 &&
        nonPublicShared.length === 0;

    return (
        <div className="recipe-list-container">
            {renderPublicRecipeSections()}
            {shouldShowPublicHiddenHint && (
                <div className="recipe-list-empty-hint">
                    公開レシピは非表示です。上の「自分公開中」または「他ユーザー公開」を押すと表示されます。
                </div>
            )}
            {renderSection("料理", cookingRecipes, "🍽️", "cooking")}
            {renderSection("パン", breadRecipes, "🍞", "bread")}
            {renderSection("デザート", dessertRecipes, "🍰", "dessert")}
            {renderSection("ソース", sauceRecipes, "🥣", "sauce")}
            {renderSection("ドレッシング", dressingRecipes, "🥗", "dressing")}
            {renderSection("飾り", decorationRecipes, "✨", "decoration")}

            {/* Fallback if no recipes at all */}
            {recipes.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                    レシピがありません。
                </div>
            )}
        </div>
    );
};
