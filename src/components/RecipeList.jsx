import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import './RecipeList.css';

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export const RecipeList = ({ recipes, onSelectRecipe, isSelectMode, selectedIds, onToggleSelection }) => {
    return (
        <div className="recipe-grid">
            {recipes.map((recipe) => {
                const isSelected = selectedIds && selectedIds.has(recipe.id);
                return (
                    <Card
                        key={recipe.id}
                        hoverable
                        className={`recipe-card ${isSelected ? 'selected' : ''} ${recipe.type === 'bread' ? 'recipe-card--bread' : ''}`}
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
                                {recipe.tags && recipe.tags.slice(0, 2).map((tag, index) => (
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
                );
            })}
        </div>
    );
};
