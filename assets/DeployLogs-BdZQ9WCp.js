const n=`.deploy-logs-container {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
}

.deploy-logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 2px solid var(--border-color, #eee);
    padding-bottom: 15px;
}

.deploy-logs-header h2 {
    margin: 0;
    color: var(--text-primary, #333);
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    gap: 8px;
}

.deploy-logs-controls {
    display: flex;
    gap: 10px;
    align-items: center;
}

.deploy-logs-table-wrapper {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    overflow-x: auto;
}

.deploy-logs-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

.deploy-logs-table th,
.deploy-logs-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color, #eee);
    font-size: 0.95rem;
    color: #333;
}

.deploy-logs-table th {
    background-color: var(--bg-secondary, #f8f9fa);
    font-weight: 600;
    color: var(--text-secondary, #333);
    position: sticky;
    top: 0;
    z-index: 1;
}

.deploy-logs-table tbody tr:hover {
    background-color: rgba(0, 0, 0, 0.02);
}

.badge-project {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.85em;
    font-weight: 500;
    display: inline-block;
}

.badge-project[data-project="git"] { background-color: #24292e; color: white; }
.badge-project[data-project="supabase"] { background-color: #3ecf8e; color: white; }
.badge-project[data-project="frontend"] { background-color: #61dafb; color: #333; }
.badge-project[data-project="backend"] { background-color: #4CAF50; color: white; }

.badge-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.85em;
    font-weight: 500;
}

.badge-status.success { background-color: #e6f4ea; color: #1e8e3e; }
.badge-status.error { background-color: #fce8e6; color: #d93025; }
.badge-status.pending { background-color: #fef7e0; color: #ea8600; }

.log-message {
    max-width: 400px;
    padding: 0;
}

.log-message-content {
    max-width: 100%;
    overflow-x: auto;
    white-space: nowrap;
    padding: 12px 16px;
    /* Custom scrollbar for better appearance */
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
}

.log-message-content::-webkit-scrollbar {
    height: 6px;
}
.log-message-content::-webkit-scrollbar-track {
    background: transparent;
}
.log-message-content::-webkit-scrollbar-thumb {
    background-color: #cbd5e1;
    border-radius: 3px;
}

.add-log-modal {
    display: flex;
    flex-direction: column;
    gap: 15px;
    padding: 15px;
}

.add-log-modal .form-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.add-log-modal label {
    font-weight: 600;
    font-size: 0.9em;
    color: #555;
}

.add-log-modal select,
.add-log-modal input,
.add-log-modal textarea {
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
}
`;export{n as default};
