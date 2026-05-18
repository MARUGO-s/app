import React from 'react';
import './RecentRecipes.css';

export const FavoriteRecipes = ({ recipes, favoriteIds, onSelect, onToggleFavorite }) => {
    if (!favoriteIds || favoriteIds.size === 0) return null;

    const favoriteRecipes = [...favoriteIds]
        .map((id) => recipes.find((r) => String(r.id) === String(id)))
        .filter(Boolean)
        .slice(0, 10);

    if (favoriteRecipes.length === 0) return null;

    return (
        <div className="recent-recipes favorite-recipes">
            <h3 className="recent-header">お気に入り</h3>
            <div className="recent-list">
                {favoriteRecipes.map((recipe) => (
                    <div
                        key={recipe.id}
                        className="recent-item favorite-recipes__item"
                        onClick={() => onSelect(recipe)}
                    >
                        <div className="recent-thumbnail">
                            {recipe.image ? (
                                <img src={recipe.image} alt={recipe.title} />
                            ) : (
                                <div className="recent-placeholder" />
                            )}
                        </div>
                        <div className="recent-info">
                            <div className="recent-title">{recipe.title}</div>
                        </div>
                        {typeof onToggleFavorite === 'function' && (
                            <button
                                type="button"
                                className="favorite-recipes__star"
                                aria-label="お気に入りを解除"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleFavorite(recipe.id);
                                }}
                            >
                                ★
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
