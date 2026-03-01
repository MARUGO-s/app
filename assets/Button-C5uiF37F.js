const n=`.btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    /* Boxy is more pro */
    font-family: var(--font-family-main);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
    gap: var(--space-sm);
    outline: none;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Sizes */
.btn--sm {
    height: 28px;
    padding: 0 0.75rem;
    font-size: 0.8rem;
}

.btn--md {
    height: 36px;
    padding: 0 1rem;
    font-size: 0.9rem;
}

.btn--lg {
    height: 44px;
    padding: 0 1.5rem;
    font-size: 1rem;
}

.btn--block {
    width: 100%;
    display: flex;
}

/* Variants */
.btn--primary {
    background-color: hsl(var(--color-primary)) !important;
    background-image: none !important;
    color: white !important;
    border-color: hsl(var(--color-primary)) !important;
    box-shadow: none !important;
}

.btn--primary:not(:disabled):hover {
    background-color: hsl(var(--color-primary-hover)) !important;
}

.btn--secondary {
    background-color: white !important;
    background-image: none !important;
    color: #333 !important;
    /* Explicit dark text for white button */
    border-color: hsl(var(--color-border-dark)) !important;
    box-shadow: none !important;
}

.btn--secondary:not(:disabled):hover {
    background-color: hsl(var(--color-bg-surface)) !important;
    border-color: hsl(var(--color-text-muted)) !important;
}

.btn--ghost {
    background: transparent;
    color: hsl(var(--color-text-muted));
    border-color: transparent;
}

.btn--ghost:not(:disabled):hover {
    color: #333;
    /* Dark text on hover */
    background: hsl(var(--color-bg-surface));
}

/* Loading Spinner */
.btn__spinner {
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.btn--danger {
    background: #dc3545;
    color: white;
    border-color: #dc3545;
}

.btn--danger:not(:disabled):hover {
    background: #c82333;
    border-color: #bd2130;
}`;export{n as default};
