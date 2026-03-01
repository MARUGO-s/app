const n=`.app-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.app-header {
    padding: 0;
    margin-bottom: 1rem;
}

.app-header__content {
    display: flex;
    justify-content: center;
    align-items: center;
}

.app-logo-image {
    height: 100px;
    /* Increased slightly for better visibility of script font */
    width: auto;
    object-fit: contain;
    cursor: pointer;
}

.app-main {
    flex: 1;
    width: 100%;
}

.app-footer {
    margin-top: var(--space-xl);
    padding: var(--space-lg) 0;
    text-align: center;
    color: hsl(var(--color-text-muted));
    font-size: 0.875rem;
}
`;export{n as default};
