const t=`import React, { useEffect } from 'react';
import './Toast.css';

export const Toast = ({ id, message, type = 'info', onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(id);
        }, 3000);

        return () => clearTimeout(timer);
    }, [id, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success':
                return '✓';
            case 'error':
                return '✕';
            case 'warning':
                return '⚠';
            case 'info':
            default:
                return 'ℹ';
        }
    };

    return (
        <div className={\`toast toast-\${type}\`}>
            <div className="toast-icon">{getIcon()}</div>
            <div className="toast-message">{message}</div>
            <button
                className="toast-close"
                onClick={() => onClose(id)}
                aria-label="閉じる"
            >
                ✕
            </button>
        </div>
    );
};

export const ToastContainer = ({ toasts, onRemove }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    id={toast.id}
                    message={toast.message}
                    type={toast.type}
                    onClose={onRemove}
                />
            ))}
        </div>
    );
};
`;export{t as default};
