import React from 'react';
import './RecentRecipes.css';

export const RecentRecipes = ({ recipes, recentIds, onSelect }) => {
    if (!recentIds || recentIds.length === 0) return null;

    // Filter and sort recipes based on recentIds order
    const recentRecipes = recentIds
        .map(id => recipes.find(r => r.id === id))
        .filter(Boolean)
        .slice(0, 7); // Limit to 7 items as requested

    if (recentRecipes.length === 0) return null;

    return (
        <div className="recent-recipes">
            <h3 className="recent-header">最近見た</h3>
            <div className="recent-list">
                {recentRecipes.map(recipe => (
                    <div
                        key={recipe.id}
                        className="recent-item"
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
                    </div>
                ))}
            </div>
        </div>
    );
};
