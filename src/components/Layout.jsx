import React from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from './Button';
import './Layout.css';

export const Layout = ({ children }) => {
    // eslint-disable-next-line no-unused-vars
    const location = useLocation();

    return (
        <div className="app-layout">
            <header className="app-header">
                <div className="container app-header__content">
                    <img src={`${import.meta.env.BASE_URL}header-logo.png`} alt="Recipe Management" className="app-logo-image" />
                </div>
            </header>
            <main className="container app-main">
                {children}
            </main>
            <footer className="app-footer">
                <div className="container">
                    <p>© 2024 Recipe Management (レシピマネジメント)</p>
                </div>
            </footer>
        </div>
    );
};

