import React from 'react';
import './FavoriteStarButton.css';

export const FavoriteStarButton = ({
    isFavorite = false,
    onToggle,
    size = 'md',
    className = '',
    title,
}) => {
    const label = isFavorite ? 'お気に入りを解除' : 'お気に入りに追加';

    return (
        <button
            type="button"
            className={`favorite-star-btn favorite-star-btn--${size} ${isFavorite ? 'is-favorite' : ''} ${className}`.trim()}
            aria-label={label}
            aria-pressed={isFavorite}
            title={title || label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle?.(e);
            }}
        >
            <span className="favorite-star-btn__icon" aria-hidden="true">
                {isFavorite ? '★' : '☆'}
            </span>
        </button>
    );
};
