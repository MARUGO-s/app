const n=`/* トーストコンテナ */
.toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 400px;
    pointer-events: none;
}

/* 個別のトースト */
.toast {
    display: flex;
    align-items: center;
    gap: 12px;
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
    min-width: 300px;
    max-width: 400px;
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
    position: relative;
    border-left: 4px solid;
}

.toast.removing {
    animation: slideOut 0.3s ease-out forwards;
}

/* アニメーション */
@keyframes slideIn {
    from {
        transform: translateX(400px);
        opacity: 0;
    }

    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOut {
    from {
        transform: translateX(0);
        opacity: 1;
    }

    to {
        transform: translateX(400px);
        opacity: 0;
    }
}

/* トーストアイコン */
.toast-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
    color: white;
}

/* メッセージ */
.toast-message {
    flex: 1;
    font-size: 14px;
    line-height: 1.4;
    color: #1f2937;
}

/* 閉じるボタン */
.toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px;
    font-size: 18px;
    line-height: 1;
    transition: color 0.2s;
}

.toast-close:hover {
    color: #4b5563;
}

/* 種類別のスタイル */
.toast-success {
    border-left-color: #10b981;
}

.toast-success .toast-icon {
    background: #10b981;
}

.toast-error {
    border-left-color: #ef4444;
}

.toast-error .toast-icon {
    background: #ef4444;
}

.toast-warning {
    border-left-color: #f59e0b;
}

.toast-warning .toast-icon {
    background: #f59e0b;
}

.toast-info {
    border-left-color: #3b82f6;
}

.toast-info .toast-icon {
    background: #3b82f6;
}

/* レスポンシブ対応 */
@media (max-width: 600px) {
    .toast-container {
        top: 10px;
        right: 10px;
        left: 10px;
        max-width: none;
    }

    .toast {
        min-width: auto;
        max-width: none;
    }

    @keyframes slideIn {
        from {
            transform: translateY(-100px);
            opacity: 0;
        }

        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateY(0);
            opacity: 1;
        }

        to {
            transform: translateY(-100px);
            opacity: 0;
        }
    }
}`;export{n as default};
