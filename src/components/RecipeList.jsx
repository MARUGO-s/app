import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import './RecipeList.css';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const SortableRecipeCard = ({ recipe, isSelected, isSelectMode, onSelectRecipe, onToggleSelection, disableDrag }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: recipe.id,
        disabled: disableDrag
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'pan-y',
        height: '100%',
        outline: 'none',
        cursor: disableDrag ? 'default' : 'grab'
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
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
                        <img src={recipe.image} alt={recipe.title} className="recipe-card__image" />
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
                            if (!recipe.tags) return null;
                            // Split by comma and clean
                            const allTags = recipe.tags.flatMap(t => (t || '').split(/[,、]/)).map(t => t.trim()).filter(Boolean);
                            // Prioritize 'URL取り込み'
                            const hasImport = allTags.includes('URL取り込み');
                            const displayTags = hasImport ? ['URL取り込み'] : allTags;

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
    return recipe.type === 'bread' || (recipe.tags && recipe.tags.some(t => /パン|Bread/i.test(t)));
};

const isDessert = (recipe) => {
    const isDessertTag = (t) => /デザート|Dessert/i.test(t);
    return /デザート|Dessert/i.test(recipe.category || '') || (recipe.tags && recipe.tags.some(isDessertTag));
};

const isSauce = (recipe) => {
    return /ソース|Sauce/i.test(recipe.category || '') || (recipe.tags && recipe.tags.some(t => /ソース|Sauce/i.test(t)));
};

const isDecoration = (recipe) => {
    // "飾り" or "Deco" or "Garnish"? 
    return /飾り|デコ|Decor/i.test(recipe.category || '') || (recipe.tags && recipe.tags.some(t => /飾り|デコ|Decor/i.test(t)));
};

export const RecipeList = ({ recipes, onSelectRecipe, isSelectMode, selectedIds, onToggleSelection, disableDrag, displayMode = 'normal' }) => {
    const [expandedSections, setExpandedSections] = useState({});

    const toggleSection = (sectionKey) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionKey]: !prev[sectionKey]
        }));
    };

    // 1. Filter into categories (Priority: Bread -> Sauce -> Decoration -> Dessert -> Cooking)
    // Adjust priority based on user likelyhood. Dessert might contain sauces?
    // User requested separation, so Sauce/Decoration should pull out from Dessert/Cooking.

    // Bread
    const breadRecipes = recipes.filter(r => isBread(r));
    const nonBread = recipes.filter(r => !isBread(r));

    // Sauce
    const sauceRecipes = nonBread.filter(r => isSauce(r));
    const nonSauce = nonBread.filter(r => !isSauce(r));

    // Decoration
    const decorationRecipes = nonSauce.filter(r => isDecoration(r));
    const nonDecoration = nonSauce.filter(r => !isDecoration(r));

    // Dressing (New)
    const isDressing = (r) => {
        const cat = r.category || '';
        const tags = r.tags || [];
        return /ドレッシング|Dressing|ヴィネグレット|Vinaigrette|マヨネーズ|Mayonnaise/i.test(cat) ||
            tags.some(t => /ドレッシング|Dressing|ヴィネグレット|Vinaigrette|マヨネーズ|Mayonnaise/i.test(t));
    };
    const dressingRecipes = nonDecoration.filter(r => isDressing(r));
    const nonDressing = nonDecoration.filter(r => !isDressing(r));

    // Dessert
    const dessertRecipes = nonDressing.filter(r => isDessert(r));

    // Cooking (Rest)
    const cookingRecipes = nonDressing.filter(r => !isDessert(r));

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
    const renderSection = (title, items, icon, sectionKey) => {
        if (items.length === 0) return null;

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
                        userSelect: 'none'
                    }}
                >
                    <span>{icon}</span> {title}
                    <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal' }}>({items.length})</span>
                    {!isAllMode && hasMore && (
                        <span className="section-toggle-btn">
                            {isExpanded ? '▲ 閉じる' : '▼ もっと見る'}
                        </span>
                    )}
                </h3>
                <div className="recipe-grid">
                    <SortableContext items={displayItems.map(r => r.id)} strategy={rectSortingStrategy}>
                        {displayItems.map((recipe) => {
                            const isSelected = selectedIds && selectedIds.has(recipe.id);
                            return (
                                <SortableRecipeCard
                                    key={recipe.id}
                                    recipe={recipe}
                                    isSelected={isSelected}
                                    isSelectMode={isSelectMode}
                                    onSelectRecipe={onSelectRecipe}
                                    onToggleSelection={onToggleSelection}
                                    disableDrag={disableDrag}
                                />
                            );
                        })}
                    </SortableContext>
                </div>
            </div>
        );
    };

    return (
        <div className="recipe-list-container">
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
