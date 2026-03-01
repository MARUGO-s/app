const n=`.request-assistant-fab {
    position: fixed;
    right: 16px;
    bottom: 74px;
    z-index: 1099;
    border: 1px solid rgba(255, 255, 255, 0.5);
    background: linear-gradient(135deg, #0f766e, #0e7490);
    color: #ffffff;
    border-radius: 999px;
    padding: 9px 14px;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.28);
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.request-assistant-fab:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.32);
}

.request-assistant-fab:active {
    transform: translateY(0);
}

.request-assistant-modal {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.request-assistant-hint {
    font-size: 0.82rem;
    color: #4b5563;
    background: #f7f7f7;
    border: 1px solid #ececec;
    border-radius: 8px;
    padding: 8px 10px;
}

.request-assistant-current-view {
    font-size: 0.78rem;
    color: #0f766e;
    background: #f0fdfa;
    border: 1px solid #99f6e4;
    border-radius: 8px;
    padding: 6px 9px;
}

.request-assistant-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.request-assistant-label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.8rem;
    color: #374151;
    font-weight: 700;
}

.request-assistant-label input,
.request-assistant-label select,
.request-assistant-label textarea {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.9rem;
    color: #111827;
    background: #ffffff;
    font-weight: 500;
}

.request-assistant-label textarea {
    resize: vertical;
    min-height: 108px;
}

.request-assistant-label input:focus,
.request-assistant-label select:focus,
.request-assistant-label textarea:focus {
    outline: none;
    border-color: #0e7490;
    box-shadow: 0 0 0 3px rgba(14, 116, 144, 0.15);
}

.request-assistant-message {
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.8rem;
    line-height: 1.45;
}

.request-assistant-message--success {
    color: #166534;
    background: #f0fdf4;
    border: 1px solid #86efac;
}

.request-assistant-message--error {
    color: #991b1b;
    background: #fef2f2;
    border: 1px solid #fecaca;
}

.request-assistant-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

@media (max-width: 700px) {
    .request-assistant-fab {
        right: 12px;
        bottom: 66px;
        padding: 8px 12px;
        font-size: 0.8rem;
    }
}
`;export{n as default};
