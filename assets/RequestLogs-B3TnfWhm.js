const n=`.request-logs {
    padding: 20px;
    color: #1f2937;
}

.request-logs__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.request-logs__header h1 {
    margin: 0;
    font-size: 1.5rem;
}

.request-logs__refresh {
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #111827;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
}

.request-logs__refresh:hover {
    background: #f9fafb;
}

.request-logs__refresh:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.request-logs__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 12px;
}

.request-logs__stat {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #ffffff;
    padding: 10px 12px;
}

.request-logs__stat-label {
    font-size: 0.75rem;
    color: #6b7280;
}

.request-logs__stat-value {
    margin-top: 4px;
    font-size: 1.04rem;
    font-weight: 800;
    color: #111827;
}

.request-logs__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.request-logs__bulk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
}

.request-logs__bulk-note {
    margin-bottom: 12px;
    font-size: 0.78rem;
    color: #6b7280;
}

.request-logs__action-btn {
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #111827;
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
}

.request-logs__action-btn:hover {
    background: #f9fafb;
}

.request-logs__action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.request-logs__action-btn--danger {
    border-color: #fecaca;
    background: #fef2f2;
    color: #991b1b;
}

.request-logs__action-btn--danger:hover {
    background: #fee2e2;
}

.request-logs__filters select,
.request-logs__filters input {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.88rem;
    background: #ffffff;
    color: #111827;
}

.request-logs__search {
    min-width: 280px;
    flex: 1;
}

.request-logs__loading,
.request-logs__empty {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #ffffff;
    padding: 18px;
    text-align: center;
    color: #6b7280;
}

.request-logs__table-wrap {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: auto;
    background: #ffffff;
}

.request-logs__table {
    width: 100%;
    border-collapse: collapse;
    min-width: 980px;
}

.request-logs__table th,
.request-logs__table td {
    border-bottom: 1px solid #e5e7eb;
    padding: 9px 10px;
    text-align: left;
    vertical-align: top;
    font-size: 0.82rem;
    line-height: 1.45;
}

.request-logs__table th {
    position: sticky;
    top: 0;
    background: #f8fafc;
    z-index: 1;
    color: #374151;
}

.request-logs__select-col {
    width: 44px;
    min-width: 44px;
    text-align: center !important;
}

.request-logs__badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.7rem;
    font-weight: 700;
    border: 1px solid transparent;
}

.request-logs__badge--feature {
    color: #1d4ed8;
    background: #eff6ff;
    border-color: #bfdbfe;
}

.request-logs__badge--bug {
    color: #9f1239;
    background: #fff1f2;
    border-color: #fecdd3;
}

.request-logs__badge--improvement {
    color: #065f46;
    background: #ecfdf5;
    border-color: #a7f3d0;
}

.request-logs__badge--other {
    color: #374151;
    background: #f3f4f6;
    border-color: #d1d5db;
}

.request-logs__status-select {
    border: 1px solid #d1d5db;
    border-radius: 7px;
    background: #ffffff;
    color: #111827;
    padding: 4px 8px;
    font-size: 0.78rem;
}

.request-logs__status-label {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 8px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #374151;
    font-size: 0.7rem;
    font-weight: 700;
}

.request-logs__delete-btn {
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #991b1b;
    border-radius: 7px;
    padding: 4px 8px;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
}

.request-logs__delete-btn:hover {
    background: #fee2e2;
}

.request-logs__delete-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

@media (max-width: 800px) {
    .request-logs {
        padding: 14px;
    }

    .request-logs__header {
        flex-direction: column;
        align-items: flex-start;
    }

    .request-logs__search {
        min-width: 100%;
    }
}
`;export{n as default};
