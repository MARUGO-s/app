import React from 'react';
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
                className={`recipe-card ${isSelected ? 'selected' : ''} ${recipe.type === 'bread' ? 'recipe-card--bread' : ''}`}
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
                        {recipe.tags && recipe.tags.filter(t => t && t.trim()).slice(0, 2).map((tag, index) => (
                            <span key={`${tag}-${index}`} className="recipe-tag">{tag}</span>
                        ))}
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

export const RecipeList = ({ recipes, onSelectRecipe, isSelectMode, selectedIds, onToggleSelection, disableDrag }) => {
    return (
        <div className="recipe-grid">
            <SortableContext items={recipes.map(r => r.id)} strategy={rectSortingStrategy}>
                {recipes.map((recipe) => {
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
    );
};
