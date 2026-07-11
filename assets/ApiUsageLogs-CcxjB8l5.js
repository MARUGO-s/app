const n=`/* Dark theme friendly styles */

.api-usage-logs {
  padding: 20px;
  color: inherit;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.logs-header h1 {
  font-size: 24px;
  margin: 0;
}

.export-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
}

.export-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.05);
  /* Slightly lighter than bg */
  padding: 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-label {
  opacity: 0.7;
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
}

.secondary-stat {
  font-size: 0.85em;
  opacity: 0.6;
  margin-top: 4px;
}

.provider-summary {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
}

.provider-summary__heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 12px;
}

.provider-summary__heading h2 {
  margin: 0;
  font-size: 16px;
}

.provider-summary__heading p {
  margin: 0;
  font-size: 12px;
  opacity: 0.65;
}

.provider-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: 10px;
}

.provider-summary-card {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
}

.provider-summary-card strong {
  font-size: 14px;
}

.provider-summary-card span,
.provider-summary-card small {
  font-size: 12px;
  opacity: 0.7;
}

.provider-summary-card b {
  font-size: 18px;
}

.provider-summary-card--openai { border-color: rgba(167, 139, 250, 0.55); }
.provider-summary-card--perplexity { border-color: rgba(45, 212, 191, 0.55); }
.provider-summary-card--groq { border-color: rgba(251, 146, 60, 0.55); }

/* Tabs */
.logs-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 1px;
}

.log-tab {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.log-tab:hover {
  color: rgba(255, 255, 255, 0.9);
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 6px 6px 0 0;
}

.log-tab.active {
  color: #4dabf7;
  /* Blueish */
  border-bottom-color: #4dabf7;
}

/* Filters */
.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
  border-radius: 8px;
}

.filters select,
.filters input {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
}

.refresh-btn {
  margin-left: auto;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
}

.refresh-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Table */
.logs-table-container {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  overflow-x: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.logs-table th {
  padding: 12px 16px;
  text-align: left;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

.logs-table td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.logs-table tr:hover td {
  background-color: rgba(255, 255, 255, 0.05);
}

/* Status Badges - ONLY apply to first column */
.status-success td:first-child {
  border-left: 4px solid rgba(64, 192, 87, 0.5);
}

.status-error td:first-child {
  border-left: 4px solid rgba(250, 82, 82, 0.5);
  background-color: rgba(250, 82, 82, 0.1);
}

.status-rate_limited td:first-child {
  border-left: 4px solid rgba(250, 176, 5, 0.5);
}

/* API Badges */
.api-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  /* Badges need contrast */
}

.api-gemini {
  background: #e7f5ff;
  color: #1c7ed6;
}

.api-openai {
  background: #f3f0ff;
  color: #7950f2;
}

.api-deepl {
  background: #e6fcf5;
  color: #0ca678;
}

.api-groq {
  background: #ffe8cc;
  color: #e8590c;
}

.api-perplexity {
  background: #ccfbf1;
  color: #0f766e;
}

.tokens {
  font-family: monospace;
  font-size: 12px;
  opacity: 0.7;
}

.audio-sec {
  font-weight: bold;
  color: #ff922b;
}

.cost {
  font-weight: 600;
}

.cost--unpriced {
  color: #fbbf24;
}

.cost-breakdown {
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.88;
  min-width: 220px;
}

.cost-breakdown-total {
  margin-top: 2px;
  font-weight: 700;
}

.cost-breakdown--unpriced {
  color: #fbbf24;
  min-width: 180px;
}

.error-msg {
  color: #ff6b6b;
  font-size: 12px;
  display: block;
  max-width: 400px;
  max-height: 100px;
  overflow-y: auto;
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 1.4;
}

.no-logs {
  padding: 40px;
  text-align: center;
  opacity: 0.6;
}
`;export{n as default};
