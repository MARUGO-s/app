const n=`.recent-recipes {
    background: transparent;
    width: 100%;
}

.recent-header {
    font-size: 1rem;
    font-weight: 700;
    color: hsl(var(--color-primary));
    margin: 0 0 var(--space-sm) 0;
    padding-left: 2px;
    border-bottom: 2px solid hsl(var(--color-primary));
    padding-bottom: 4px;
    display: inline-block;
}

.recent-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}

.recent-item {
    display: flex;
    gap: var(--space-sm);
    cursor: pointer;
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition: background-color 0.2s;
    background-color: transparent;
}

.recent-item:hover {
    background-color: rgba(255, 255, 255, 0.4);
}

.recent-thumbnail {
    width: 80px;
    height: 60px;
    /* 4:3 aspect ratio approx */
    flex-shrink: 0;
    background-color: hsl(var(--color-bg-surface));
    border-radius: var(--radius-sm);
    overflow: hidden;
}

.recent-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.recent-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%);
}

.recent-info {
    flex: 1;
    display: flex;
    align-items: center;
    /* Center vertically */
    padding: 6px 8px;
    background-color: #d96026;
    color: white;
    border-radius: var(--radius-sm);
    min-height: 60px;
    /* Match thumbnail height approx */
}

.recent-title {
    font-size: 0.85rem;
    line-height: 1.3;
    color: white;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-weight: 500;
    margin: 0;
}`;export{n as default};
