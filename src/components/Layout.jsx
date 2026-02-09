import React from 'react';
import { useLocation } from 'react-router-dom';
import './Layout.css';

export const Layout = ({ children }) => {
    // eslint-disable-next-line no-unused-vars
    const location = useLocation();
    const qaHref = `${import.meta.env.BASE_URL}recipe.html`;

    return (
        <div className="app-layout">
            <header className="app-header">
                <div className="container app-header__content">
                    <div className="app-header__spacer" aria-hidden="true" />
                    <div className="app-header__logo">
                        <img src={`${import.meta.env.BASE_URL}header-logo.png`} alt="recipe management" className="app-logo-image" />
                    </div>
                    <div className="app-header__actions">
                        <a
                            className="btn btn--secondary btn--sm app-header__qa"
                            href={qaHref}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Q&A
                        </a>
                    </div>
                </div>
            </header>
            <main className="container app-main">
                {children}
            </main>
            <footer className="app-footer">
                <div className="container">
                    <p>© 2026 recipe management</p>
                </div>
            </footer>
        </div>
    );
};
