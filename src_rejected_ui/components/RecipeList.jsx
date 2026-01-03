import React from 'react';
import './RecipeList.css';

export const RecipeList = ({ recipes, onSelectRecipe }) => {
    return (
        <div className="recipe-list">
            {recipes.map((recipe) => (
                <div key={recipe.id} className="recipe-card" onClick={() => onSelectRecipe(recipe)}>
                    <div className="recipe-card__image-wrapper">
                        {recipe.image ? (
                            <img src={recipe.image} alt={recipe.title} className="recipe-card__image" />
                        ) : (
                            <div className="recipe-card__placeholder" style={{
                                width: '100%', height: '100%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#757575', fontSize: '2rem'
                            }}>
                                🥘
                            </div>
                        )}
                    </div>
                    <div className="recipe-card__footer">
                        <span className="recipe-title">{recipe.title}</span>
                        {/* Optional: Add a count or small icon if needed, e.g. serving size or time */}
                        {recipe.servings && <span className="recipe-count-badge">{recipe.servings}</span>}
                    </div>
                </div>
            ))}
        </div>
    );
};
