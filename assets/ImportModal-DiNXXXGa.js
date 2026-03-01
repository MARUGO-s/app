const n=`.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
}

.fade-in {
    animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.import-modal-card {
    width: 90%;
    max-width: 500px;
    padding: 1.5rem;
    animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
    from {
        transform: translateY(20px);
        opacity: 0;
    }

    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.import-modal-card h3.modal-title {
    margin-top: 0;
    margin-bottom: 0.8rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid #eee;
    color: hsl(var(--color-primary));
}

.import-mode-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 0.8rem;
}

.tab-btn {
    padding: 6px 14px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.85rem;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
}

.tab-btn.active.tab-import-web {
    background-color: #e3f2fd;
    color: #1976d2;
    border-color: #bbdefb;
    font-weight: bold;
}

.tab-btn.active.tab-import-image {
    background-color: #e8f5e9;
    color: #2e7d32;
    border-color: #c8e6c9;
    font-weight: bold;
}

.import-url-input {
    width: 100%;
    padding: 0.6rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.95rem;
    margin: 0.5rem 0 1rem;
    box-sizing: border-box;
}

.import-url-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(239, 83, 80, 0.2);
}

.error-text {
    color: var(--color-danger);
    font-size: 0.9rem;
    margin-bottom: 1rem;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.8rem;
    margin-top: 0.5rem;
}

.image-upload-wrapper {
    margin: 1rem 0;
    text-align: center;
}

.image-upload-input {
    display: none;
}

.image-upload-label {
    display: block;
    padding: 2rem;
    border: 2px dashed #ccc;
    border-radius: 8px;
    cursor: pointer;
    background: #f9f9f9;
    color: #666;
    transition: all 0.2s ease;
}

.image-upload-label.drag-active {
    border-color: var(--color-primary);
    background: #f0f9ff;
    color: var(--color-primary);
}

.image-upload-preview {
    max-width: 100%;
    max-height: 200px;
    border-radius: 4px;
}

.image-upload-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 0.75rem;
    flex-wrap: wrap;
}

.image-upload-actions .btn {
    min-width: 140px;
}

.image-engine-panel {
    margin: 0.75rem 0 0.5rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
}

.image-engine-label {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #e2e8f0;
}

.image-engine-select {
    width: 100%;
    margin-top: 8px;
    padding: 0.6rem 0.55rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: #333;
    font-size: 0.95rem;
    color: #e2e8f0;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23e2e8f0%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
    background-repeat: no-repeat;
    background-position: right 10px top 50%;
    background-size: 10px auto;
}

.image-engine-help {
    margin-top: 0.35rem;
    font-size: 0.78rem;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.6);
}

/* 解析中は全面白オーバーレイではなく、中央のポップアップのみ表示 */
.analyze-status-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    animation: popupFadeIn 0.2s ease-out;
}

.analyze-status-popup-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 280px;
    max-width: 90vw;
    padding: 1.5rem;
    background: var(--color-bg, #fff);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.analyze-status-popup .analyze-status-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #333;
    margin: 0 0 0.5rem 0;
}

.analyze-status-popup .analyze-status-actions {
    margin-top: 1rem;
    display: flex;
    justify-content: center;
}

@keyframes popupFadeIn {
    from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.96);
    }

    to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }
}

.spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #ddd;
    /* Darker grey for visibility */
    border-top: 4px solid var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

/* Progress Log Container - Premium Modern Style */
.progress-log-container {
    width: 100%;
    max-width: 420px;
    margin-top: 1.5rem;
    font-size: 0.9rem;
    text-align: left;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    background: #333 !important;
    /* Dark Slate/Grey */
    color: #e2e8f0;
    /* Off-white for readability */
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.progress-log {
    max-height: 200px;
    overflow-y: auto;
    padding: 1rem 1.25rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    background: #333 !important;
    color: #e2e8f0;
}

.log-entry {
    margin-bottom: 8px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    opacity: 0;
    animation: fadeIn 0.4s ease forwards;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.log-entry:last-child {
    border-bottom: none;
    margin-bottom: 0;
    font-weight: 500;
}

.log-message {
    word-break: break-word;
    color: #e2e8f0;
    /* Explicitly set text color */
}


@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fadeIn {
    to {
        opacity: 1;
    }
}

/* Custom Scrollbar for log */
.progress-log::-webkit-scrollbar {
    width: 6px;
}

.progress-log::-webkit-scrollbar-track {
    background: transparent;
}

.progress-log::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.progress-log::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}`;export{n as default};
