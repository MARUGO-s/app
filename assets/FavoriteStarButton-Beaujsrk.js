const n=`.favorite-star-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    border-radius: 999px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.favorite-star-btn:hover {
    transform: scale(1.06);
    background: rgba(0, 0, 0, 0.6);
}

.favorite-star-btn.is-favorite {
    background: rgba(217, 96, 38, 0.92);
    color: #fff7e6;
}

.favorite-star-btn--sm {
    width: 30px;
    height: 30px;
    font-size: 1rem;
}

.favorite-star-btn--md {
    width: 36px;
    height: 36px;
    font-size: 1.15rem;
}

.favorite-star-btn--lg {
    width: 42px;
    height: 42px;
    font-size: 1.35rem;
}

.favorite-star-btn__icon {
    display: block;
    transform: translateY(-1px);
}

.recipe-card__favorite {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 12;
}

.recipe-list-table__favorite-cell {
    width: 40px;
    padding: 6px 4px !important;
    text-align: center;
    vertical-align: middle;
}

.recipe-list-table__favorite-cell .favorite-star-btn {
    background: transparent;
    color: #bbb;
}

.recipe-list-table__favorite-cell .favorite-star-btn.is-favorite {
    background: transparent;
    color: #d96026;
}

.recipe-list-table__favorite-cell .favorite-star-btn:hover {
    background: rgba(217, 96, 38, 0.12);
    transform: none;
}
`;export{n as default};
