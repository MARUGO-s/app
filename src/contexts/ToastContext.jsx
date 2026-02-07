import React, { useState, useCallback } from 'react';
import { ToastContainer } from '../components/Toast';
import { ToastContext } from './toastContext';

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info') => {
        const id = Date.now() + Math.random(); // より一意なIDを生成
        setToasts(prev => {
            // 最大5件まで表示
            const newToasts = [...prev, { id, message, type }];
            return newToasts.slice(-5);
        });
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const value = {
        showToast,
        success: (message) => showToast(message, 'success'),
        error: (message) => showToast(message, 'error'),
        warning: (message) => showToast(message, 'warning'),
        info: (message) => showToast(message, 'info'),
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};
