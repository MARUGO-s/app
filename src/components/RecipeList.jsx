import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import './RecipeList.css';

export const RecipeList = ({ recipes, onSelectRecipe }) => {
    return (
        <div className="recipe-grid">
            {recipes.map((recipe) => (
                <Card key={recipe.id} hoverable className="recipe-card" onClick={() => onSelectRecipe(recipe)}>
                    <div className="recipe-card__image-wrapper">
                        {recipe.image ? (
                            <img src={recipe.image} alt={recipe.title} className="recipe-card__image" />
                        ) : (
                            <div className="recipe-card__image placeholder" />
                        )}
                        <div className="recipe-card__overlay" />
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
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    );
};
