import React from 'react';
import './Layout.css';

export const Layout = ({ children }) => {
    return (
        <div className="app-layout">
            <header className="app-header">
                <div className="header-container">
                    <a href="#" className="app-logo" onClick={(e) => { e.preventDefault(); window.location.reload(); }}>
                        🥕 Recipe Keeper
                    </a>
                </div>
            </header>
            <main className="main-content">
                {children}
            </main>
        </div>
    );
};
