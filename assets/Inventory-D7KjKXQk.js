const n=`.inventory-container {
    padding: 1rem;
    height: 100vh;
    display: flex;
    flex-direction: column;
}

.inventory-split-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
}

/* Left Panel: CSV Source */
.inventory-left-panel {
    width: 300px;
    /* Fixed width */
    background-color: #ffffff;
    border-right: 1px solid #444;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    border-radius: 8px;
    color: #333;
    /* Force text color to dark for white background */
}

.inventory-csv-list {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.inventory-csv-list .section-title {
    color: #333;
    /* Ensure title is visible */
    margin-bottom: 1rem;
    font-size: 1.1rem;
    font-weight: bold;
}

.csv-upload-section {
    margin-bottom: 1rem;
}

/* File input text visibility */
.file-input {
    color: #333;
}

.csv-search {
    margin-bottom: 0.5rem;
}

.csv-items-container {
    flex: 1;
    overflow-y: auto;
    border: 1px solid #eee;
    background-color: #f9f9f9;
    padding: 0.5rem;
    border-radius: 4px;
}

.csv-draggable-item {
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background-color: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: grab;
    transition: transform 0.1s, box-shadow 0.1s;
    user-select: none;
    color: #333;
    /* Ensure item text is dark */
}

.csv-draggable-item:hover {
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    background-color: #f0f8ff;
}

.csv-draggable-item:active {
    cursor: grabbing;
}

.csv-item-name {
    font-weight: bold;
    font-size: 0.9rem;
    color: #333;
}

.csv-item-details {
    font-size: 0.8rem;
    color: #666;
}

.empty-msg {
    color: #666;
    text-align: center;
    margin-top: 2rem;
}

/* Right Panel: Inventory List */
.inventory-right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #333;
    /* Dark background for panel to match app theme if needed, or transparent */
    border-radius: 8px;
    padding: 1rem;
}

.inventory-list-droppable {
    position: relative;
    /* For overlay positioning */
    height: 100%;
    display: flex;
    flex-direction: column;
}

.highlight-drop {
    border: 2px dashed #4a90e2;
    background-color: rgba(74, 144, 226, 0.1);
}

/* Existing Styles (Keep or Adapt) */
.inventory-edit-container {
    max-width: 600px;
    margin: 2rem auto;
}

.inventory-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

/* Header button row (responsive) */
.inventory-header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
}

.inventory-header-actions__btn {
    white-space: nowrap;
}

.inventory-header-actions__btn--compact {
    padding: 4px 8px;
    font-size: 0.85rem;
}

/* Controls bar (vendor/search/actions) */
.inventory-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 1rem;
    padding: 10px;
    background-color: #eee;
    border-radius: 4px;
    color: #333;
}

.inventory-controls__row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}

.inventory-controls__field {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 220px;
    flex: 1 1 260px;
}

.inventory-controls__label {
    font-weight: bold;
    white-space: nowrap;
}

.inventory-controls__select {
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #ccc;
    font-size: 1rem;
    min-width: 180px;
    flex: 1 1 240px;
}

.inventory-controls__search {
    min-width: 200px;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #ccc;
    font-size: 1rem;
    outline: none;
    flex: 2 1 280px;
}

.inventory-controls__btn {
    padding: 8px 16px;
    font-size: 0.9rem;
    cursor: pointer;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
}

.inventory-controls__btn[data-active="true"] {
    background: #2ecc71;
    color: white;
    border-color: #27ae60;
    font-weight: bold;
}

.inventory-controls__summary-range {
    font-size: 0.9rem;
    color: #555;
}

.inventory-summary {
    background: #fff;
    color: #333;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.inventory-summary__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.inventory-summary__title {
    font-size: 1.1rem;
    font-weight: bold;
}

.inventory-summary__meta {
    font-size: 0.9rem;
    color: #555;
    margin-top: 4px;
}

.inventory-summary__note {
    font-size: 0.85rem;
    color: #888;
    margin-top: 6px;
}

.inventory-summary__table-wrap {
    overflow-x: auto;
}

.inventory-summary__actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
}

.inventory-summary__table {
    width: 100%;
    border-collapse: collapse;
}

.inventory-summary__table th,
.inventory-summary__table td {
    padding: 10px 12px;
    border-bottom: 1px solid #eee;
}

.inventory-summary__drag {
    width: 40px;
    text-align: center;
    color: #999;
}

.inventory-summary__drag-handle {
    display: inline-block;
    cursor: grab;
    user-select: none;
    font-size: 1.1rem;
    line-height: 1;
}

.inventory-summary__drag-handle:active {
    cursor: grabbing;
}

.inventory-summary__table th {
    background: #f5f5f5;
    text-align: left;
    font-weight: 600;
}

.inventory-summary__row td {
    transition: background-color 0.2s ease;
}

.inventory-summary__row--selected td {
    background: #fff7ed;
}

.inventory-summary__vendor-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: none;
    background: transparent;
    color: #1f2937;
    cursor: pointer;
    font: inherit;
    padding: 0;
    text-align: left;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 3px;
    transition: color 0.2s ease, text-decoration-color 0.2s ease;
}

.inventory-summary__vendor-btn:hover {
    color: #d35400;
    text-decoration-color: #d35400;
}

.inventory-summary__vendor-btn:focus-visible {
    outline: 2px solid #d35400;
    outline-offset: 2px;
    border-radius: 2px;
}

.inventory-summary__vendor-btn-icon {
    color: #9ca3af;
    font-size: 0.8rem;
    flex: 0 0 auto;
}

.inventory-summary__detail-row > td {
    background: #fffcf8;
    border-bottom: 1px solid #eee;
}

.inventory-summary__inline-detail {
    padding: 12px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.inventory-summary__inline-detail-head {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.inventory-summary__inline-detail-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #111827;
}

.inventory-summary__inline-detail-total {
    font-size: 0.92rem;
    font-weight: 700;
    color: #111827;
}

.inventory-summary__inline-detail-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-left: auto;
}

.inventory-summary__inline-breakdown {
    background: #fffdf9;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
}

.inventory-summary__inline-breakdown-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
}

.inventory-summary__inline-breakdown-row:last-child {
    border-bottom: none;
}

.inventory-summary__inline-breakdown-row--unknown {
    background: #f8fafc;
}

.inventory-summary__inline-breakdown-label {
    font-size: 0.88rem;
    color: #4b5563;
}

.inventory-summary__inline-breakdown-value {
    font-size: 0.95rem;
    font-weight: 700;
    color: #111827;
    text-align: right;
}

.inventory-summary__inline-detail-subtotal {
    font-size: 0.88rem;
    color: #4b5563;
}

.inventory-summary__inline-items-wrap {
    overflow-x: auto;
}

.inventory-summary__inline-items-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
}

.inventory-summary__inline-items-table th,
.inventory-summary__inline-items-table td {
    border-bottom: 1px solid #f1f5f9;
    padding: 8px 10px;
    font-size: 0.86rem;
    white-space: nowrap;
}

.inventory-summary__inline-items-row--category-start td {
    border-top: 3px solid #94a3b8;
}

.inventory-summary__inline-items-table th {
    background: #f8fafc;
    text-align: left;
    font-weight: 600;
}

.inventory-summary__empty {
    text-align: center;
    color: #888;
    padding: 16px 0;
}

@media (max-width: 700px) {
    .inventory-header-actions {
        justify-content: stretch;
    }

    /* Make actions stack nicely on narrow screens */
    .inventory-header-actions .btn {
        flex: 1 1 calc(50% - 10px);
    }

    /* Big primary action takes full width */
    .inventory-header-actions__btn--main {
        flex: 1 1 100% !important;
    }

    /* コントロールバーを縦レイアウトに */
    .inventory-controls {
        padding: 8px;
        gap: 8px;
    }

    .inventory-controls__row--filters {
        flex-direction: column;
        align-items: stretch;
        /* Prevent the filters row from stretching tall */
        flex: none;
    }

    .inventory-controls__field {
        width: 100%;
        min-width: 0;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        /* Desktop uses flex: 1 ...; on mobile this causes huge blank space */
        flex: none;
    }

    .inventory-controls__label {
        font-size: 0.85rem;
    }

    .inventory-controls__select,
    .inventory-controls__search {
        width: 100%;
        min-width: 0;
        flex: none;
        height: 40px;
        font-size: 0.9rem;
        padding: 6px;
    }

    .inventory-controls__row--actions {
        justify-content: stretch;
        flex-wrap: wrap;
    }

    .inventory-controls__btn {
        flex: 1 1 calc(50% - 5px);
        min-width: 0;
        padding: 8px 12px;
        font-size: 0.85rem;
    }

    /* 棚卸し一覧ボタンは全幅 */
    .inventory-controls__btn[data-active="true"] {
        flex: 1 1 100%;
    }
}

/* Mobile table compaction */
@media (max-width: 700px) {

    /* テーブルコンテナをスクロール可能に */
    .inventory-table-container {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }

    /* テーブル自体は最小幅を確保して横スクロール対応 */
    .inventory-table {
        min-width: 700px;
        /* 最小幅を確保してレイアウト崩れを防ぐ */
        table-layout: auto;
    }

    .inventory-table th,
    .inventory-table td {
        padding: 8px 6px;
        font-size: 0.85rem;
        white-space: nowrap;
        /* テキストの折り返しを防ぐ */
    }

    /* 品名カラムだけは折り返しを許可 */
    .inventory-table td:nth-child(2) {
        word-break: break-word;
        white-space: normal;
        max-width: 180px;
        min-width: 120px;
    }

    /* ヘッダーテキストが縦にならないようにする */
    .inventory-table th {
        white-space: nowrap;
        font-size: 0.8rem;
    }

    .inventory-quantity-input {
        width: 64px !important;
        font-size: 0.9rem;
    }

    /* 各カラムに最小幅を設定 */
    .inventory-table th:nth-child(1),
    /* 10% */
    .inventory-table td:nth-child(1) {
        min-width: 50px;
    }

    .inventory-table th:nth-child(3),
    /* 仕入れ値 */
    .inventory-table td:nth-child(3) {
        min-width: 80px;
    }

    .inventory-table th:nth-child(4),
    /* 単位 */
    .inventory-table td:nth-child(4) {
        min-width: 50px;
    }

    .inventory-table th:nth-child(5),
    /* 内容量 */
    .inventory-table td:nth-child(5) {
        min-width: 90px;
    }

    .inventory-table th:nth-child(6),
    /* 在庫数 */
    .inventory-table td:nth-child(6) {
        min-width: 90px;
    }

    .inventory-table th:nth-child(7),
    /* 在庫金額 */
    .inventory-table td:nth-child(7) {
        min-width: 90px;
    }

    .inventory-table th:nth-child(8),
    /* 業者名 */
    .inventory-table td:nth-child(8) {
        min-width: 100px;
        max-width: 150px;
    }

    .inventory-table th:nth-child(9),
    /* アクション */
    .inventory-table td:nth-child(9) {
        min-width: 70px;
    }
}

.inventory-table-container {
    flex: 1;
    overflow-y: auto;
    background-color: #fff;
    /* Table container white background */
    border-radius: 4px;
    overflow-anchor: none;
    /* Prevent scroll jumps on content update */
}

.inventory-table {
    width: 100%;
    border-collapse: collapse;
    color: #333;
    /* Text inside table should be dark */
}

.inventory-table th,
.inventory-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
}

.inventory-table th {
    background-color: #f0f0f0;
    /* Light grey header */
    color: #333;
    /* Dark text for header */
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 10;
}

/* Hide number input steppers (▲▼) for inventory quantity */
.inventory-quantity-input::-webkit-outer-spin-button,
.inventory-quantity-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.inventory-quantity-input[type="number"] {
    -moz-appearance: textfield;
    /* Firefox */
    appearance: textfield;
}

.inventory-tax-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
}

.snapshot-tax-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 4px;
    font-size: 0.7rem;
    line-height: 1.2;
    color: #555;
    background: #fdecec;
    border: 1px solid #f5c2c2;
    border-radius: 4px;
    vertical-align: middle;
}

.inventory-table tr:hover {
    background-color: #f5f5f5;
}

.low-stock {
    background-color: #fff3e0;
}

.warning-badge {
    background-color: #ffe0b2;
    color: #e65100;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
    display: inline-flex;
    align-items: center;
    line-height: 1.2;
}

.warning-badge[data-tooltip] {
    position: relative;
    cursor: help;
}

.warning-badge[data-tooltip]::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 50%;
    top: calc(100% + 8px);
    transform: translate(-50%, -4px);
    opacity: 0;
    pointer-events: none;
    white-space: nowrap;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(17, 24, 39, 0.92);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    transition: opacity 0.12s ease, transform 0.12s ease;
    z-index: 40;
    will-change: opacity, transform;
}

.warning-badge[data-tooltip]:hover::after,
.warning-badge[data-tooltip]:focus-visible::after {
    opacity: 1;
    transform: translate(-50%, 0);
}

.form-group {
    margin-bottom: 1rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: #333;
    /* Ensure label text is dark */
    font-weight: 500;
}

/* Ensure Input components inside form have dark text */
.form-group input,
.form-group select,
.form-group textarea {
    color: #333;
}

.form-row {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
}

.form-row .form-group {
    flex: 1;
}

.form-actions {
    margin-top: 2rem;
}

@media print {
    @page {
        size: A4;
        margin: 10mm;
    }

    body {
        background: white;
        font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
    }

    /* Hide everything by default */
    body * {
        visibility: hidden;
    }

    /* Show only inventory container */
    .inventory-container,
    .inventory-container * {
        visibility: visible;
    }

    /* Hide specific non-print elements */
    .container-header,
    .inventory-controls,
    .inventory-left-panel,
    .header-actions,
    .inventory-tabs,
    .dnd-context-overlay,
    .inventory-table th:nth-child(9),
    .inventory-table td:nth-child(9),
    button {
        display: none !important;
    }

    /* Layout Reset */
    .inventory-container {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        margin: 0;
        padding: 0;
        background: white;
    }

    .inventory-split-layout {
        display: block !important;
        grid-template-columns: 1fr !important;
    }

    .inventory-right-panel {
        padding: 0 !important;
        border: none !important;
        width: 100% !important;
        background: transparent !important;
    }

    /* Table Styles */
    .inventory-table {
        width: 100% !important;
        border-collapse: collapse !important;
        font-size: 10px !important;
        table-layout: fixed;
    }

    .inventory-table th,
    .inventory-table td {
        border: 1px solid #000 !important;
        padding: 4px 6px !important;
        color: #000 !important;
        vertical-align: middle;
    }

    .inventory-table th {
        background-color: transparent !important;
        font-weight: normal;
        text-align: left;
    }

    /* Column Widths */
    .inventory-table th:nth-child(1),
    .inventory-table td:nth-child(1) {
        width: 5%;
        text-align: center;
    }

    .inventory-table th:nth-child(2),
    .inventory-table td:nth-child(2) {
        width: 30%;
        text-align: left;
    }

    .inventory-table th:nth-child(3),
    .inventory-table td:nth-child(3) {
        width: 10%;
        text-align: right;
    }

    .inventory-table th:nth-child(4),
    .inventory-table td:nth-child(4) {
        width: 6%;
        text-align: center;
    }

    .inventory-table th:nth-child(5),
    .inventory-table td:nth-child(5) {
        width: 10%;
        text-align: right;
    }

    .inventory-table th:nth-child(6),
    .inventory-table td:nth-child(6) {
        width: 8%;
        text-align: right;
    }

    .inventory-table th:nth-child(7),
    .inventory-table td:nth-child(7) {
        width: 12%;
        text-align: right;
        font-size: 9px !important;
    }

    .inventory-table th:nth-child(8),
    .inventory-table td:nth-child(8) {
        width: 19%;
        text-align: left;
        font-size: 9px !important;
    }

    /* Input Styles - Hide in print, use print-only text instead */
    .inventory-quantity-input.no-print {
        display: none !important;
    }

    .print-only {
        display: block !important;
        text-align: right;
        font-size: 10px;
        width: 100%;
    }

    /* Remove extra elements */
    .inventory-table span[style*="color: red"],
    .inventory-container::before {
        display: none !important;
    }

    tr {
        break-inside: avoid;
    }
}
`;export{n as default};
