import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { normalizeNumericInput } from '../utils/normalizeNumericInput.js';

const normalizeUnit = (u) => {
    const s = String(u ?? '').trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    if (lower === 'ｇ') return 'g';
    if (lower === 'ｍｌ') return 'ml';
    if (lower === 'ｃｃ') return 'cc';
    if (lower === 'ｋｇ') return 'kg';
    if (lower === 'ｌ') return 'l';
    return lower;
};

const unitConversionFactor = (fromUnitRaw, toUnitRaw) => {
    const from = normalizeUnit(fromUnitRaw);
    const to = normalizeUnit(toUnitRaw);
    if (!from || !to) return null;
    if (from === to) return 1;

    // g <-> kg
    if (from === 'kg' && to === 'g') return 1000;
    if (from === 'g' && to === 'kg') return 1 / 1000;

    // ml/cc <-> l (treat cc as ml)
    const f = from === 'cc' ? 'ml' : from;
    const t = to === 'cc' ? 'ml' : to;
    if (f === 'l' && t === 'ml') return 1000;
    if (f === 'ml' && t === 'l') return 1 / 1000;

    return null;
};

const isCountUnit = (uRaw) => {
    const u = String(uRaw ?? '').trim();
    if (!u) return false;
    return ['本', '個', '袋', '枚', 'パック', '缶', '箱', 'pc', 'PC', '包'].includes(u);
};

const formatNumber = (value) => {
    if (!Number.isFinite(value)) return '-';
    const rounded = Math.round(value * 100) / 100;
    if (Number.isInteger(rounded)) return rounded.toLocaleString();
    return rounded.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
};

const InventoryItemRow = ({ item, isLowStock, onUpdateQuantity, onDelete, onToggleTax, onEdit, onRequestUnitSync }) => {
    const [localQuantity, setLocalQuantity] = React.useState(item.quantity === '' ? '' : (parseFloat(item.quantity) || 0));

    const normalizeItemCategory = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) return '';
        if (normalized === 'food_alcohol') return 'food';
        if (['food', 'alcohol', 'soft_drink', 'supplies'].includes(normalized)) return normalized;
        return '';
    };

    const categoryLabelMap = {
        food: '食材',
        alcohol: 'アルコール',
        soft_drink: 'ソフトドリンク',
        supplies: '備品'
    };

    // Sync from parent prop if it changes externally (e.g. reload) - keeping basic sync
    React.useEffect(() => {
        setLocalQuantity(item.quantity === '' ? '' : (parseFloat(item.quantity) || 0));
    }, [item.quantity]);

    const price = parseFloat(item.price) || 0;
    const purchasePriceLabel = (() => {
        if (!Number.isFinite(price) || price <= 0) return '-';

        const originalUnitRaw = item?._csv?.unit;
        const originalUnit = String(originalUnitRaw || '').trim();
        const currentUnit = String(item?.unit || '').trim();
        if (!originalUnit) {
            return `¥${formatNumber(price)}`;
        }

        const currentUnitNorm = normalizeUnit(currentUnit);
        const originalUnitNorm = normalizeUnit(originalUnit);

        if (originalUnitNorm === currentUnitNorm) {
            return `¥${formatNumber(price)}/${originalUnit}`;
        }

        // Convert price-per-currentUnit -> price-per-originalUnit.
        // If 1 originalUnit == N currentUnit, then price/originalUnit = price/currentUnit * N.
        const factor = unitConversionFactor(originalUnitNorm, currentUnitNorm);
        if (factor !== null) {
            return `¥${formatNumber(price * factor)}/${originalUnit}`;
        }

        // Order-unit (袋/本/箱...) -> measurable unit: use packetSize when available.
        const packetSize = parseFloat(item?._master?.packetSize);
        const packetUnit = String(item?._master?.packetUnit || '').trim();
        const packetUnitNorm = normalizeUnit(packetUnit);
        if (isCountUnit(originalUnit) && Number.isFinite(packetSize) && packetSize > 0 && packetUnitNorm === currentUnitNorm) {
            return `¥${formatNumber(price * packetSize)}/${originalUnit}`;
        }

        // Fallback: show current unit price explicitly.
        return `¥${formatNumber(price)}/${currentUnit || '-'}`;
    })();
    const normalizedCategory = normalizeItemCategory(item?._master?.itemCategory);
    const categoryBasedTax10 = normalizedCategory === 'alcohol' || normalizedCategory === 'supplies';
    const isTax10Override = item?.tax10_override === true || item?.tax10_override === 1 || item?.tax10_override === '1' || item?.tax10_override === 'true';
    const isTax10 = normalizedCategory
        ? (isTax10Override ? (item?.tax10 === true || item?.tax10 === 1 || item?.tax10 === '1' || item?.tax10 === 'true') : categoryBasedTax10)
        : (item?.tax10 === true || item?.tax10 === 1 || item?.tax10 === '1' || item?.tax10 === 'true');
    const taxTitle = normalizedCategory
        ? (isTax10Override
            ? `区分「${categoryLabelMap[normalizedCategory] || normalizedCategory}」（自動: ${categoryBasedTax10 ? '10%' : '8%'}）/ 手動設定`
            : `区分「${categoryLabelMap[normalizedCategory] || normalizedCategory}」により${isTax10 ? '10%' : '8%'}（自動）`)
        : '10%対象';
    const taxMultiplier = isTax10 ? 1.1 : 1.08;
    // Calculate total value based on LOCAL input immediately
    const currentQty = localQuantity === '' ? 0 : parseFloat(localQuantity);
    const totalValue = price * currentQty * taxMultiplier;

    const capacityLabel = React.useMemo(() => {
        const sizeRaw = item?._master?.packetSize;
        const unit = item?._master?.packetUnit;
        const size = parseFloat(sizeRaw);
        if (!Number.isFinite(size) || size <= 0) return '-';
        const formatted = Number.isInteger(size) ? size.toLocaleString() : size.toLocaleString(undefined, { maximumFractionDigits: 3 });
        return `${formatted}${unit ? String(unit) : ''}`;
    }, [item?._master?.packetSize, item?._master?.packetUnit]);

    const handleBlur = () => {
        const val = parseFloat(localQuantity);
        if (!isNaN(val) && val !== item.quantity) {
            onUpdateQuantity(item.id, val);
        }
    };

    const selectAllText = (el) => {
        if (!el) return;
        // Delay so click/mouseup doesn't collapse the selection.
        setTimeout(() => {
            try {
                el.select();
            } catch {
                // Some input types/browsers don't support select()
            }
        }, 0);
    };

    const getQtyInputsInTable = (currentEl) => {
        const table = currentEl?.closest?.('table');
        const root = table || document;
        return Array.from(root.querySelectorAll('input.inventory-quantity-input'));
    };

    const focusAdjacentQtyInput = (currentEl, delta) => {
        const inputs = getQtyInputsInTable(currentEl).filter((el) => !el.disabled);
        const idx = inputs.indexOf(currentEl);
        if (idx < 0) return false;
        const next = inputs[idx + delta];
        if (!next) return false;

        requestAnimationFrame(() => {
            // Keep the next input visible when typing through long lists.
            try {
                next.scrollIntoView({ block: 'nearest' });
            } catch {
                // ignore
            }
            next.focus();
            selectAllText(next);
        });
        return true;
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            focusAdjacentQtyInput(e.currentTarget, e.shiftKey ? -1 : 1);
            e.currentTarget.blur();
            return;
        }

        if (e.key === 'Tab') {
            const moved = focusAdjacentQtyInput(e.currentTarget, e.shiftKey ? -1 : 1);
            if (moved) {
                e.preventDefault();
                e.currentTarget.blur();
            }
        }
    };

    const masterUnit = item?._master?.packetUnit || '';
    const unitMismatch = !!masterUnit && normalizeUnit(masterUnit) !== normalizeUnit(item?.unit);

    return (
        <tr className={isLowStock(item) ? 'low-stock' : ''}>
            <td style={{ textAlign: 'center' }}>
                <input
                    type="checkbox"
                    checked={isTax10}
                    onChange={(e) => onToggleTax && onToggleTax(item, e.target.checked)}
                    title={taxTitle}
                    className="inventory-tax-checkbox"
                />
            </td>
            <td>
                {item.name}
                {isLowStock(item) && (
                    <span
                        className="warning-badge"
                        data-tooltip="発注点以下"
                        style={{ marginLeft: '6px' }}
                    >
                        発注推奨
                    </span>
                )}
            </td>
            <td style={{ textAlign: 'right' }}>
                {purchasePriceLabel}
            </td>
            <td style={{ textAlign: 'right', fontSize: '0.85rem', color: '#666' }}>
                {capacityLabel}
            </td>
            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                <input
                    type="text"
                    inputMode="decimal"
                    value={localQuantity}
                    onChange={(e) => setLocalQuantity(normalizeNumericInput(e.target.value))}
                    className="inventory-quantity-input no-print"
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onFocus={(e) => selectAllText(e.target)}
                    onClick={(e) => selectAllText(e.target)}
                    style={{
                        width: '80px',
                        textAlign: 'right',
                        padding: '4px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        background: 'transparent'
                    }}
                />
                <span className="print-only" style={{ display: 'none' }}>
                    {localQuantity}
                </span>
            </td>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{item.unit}</span>
                    {unitMismatch && typeof onRequestUnitSync === 'function' && (
                        <button
                            type="button"
                            onClick={() => onRequestUnitSync(item)}
                            title={`マスター単位（${masterUnit}）に合わせる`}
                            style={{
                                border: '1px solid #ddd',
                                background: '#fff',
                                borderRadius: '999px',
                                padding: '0 6px',
                                fontSize: '0.8rem',
                                lineHeight: 1.6,
                                cursor: 'pointer',
                                opacity: 0.85
                            }}
                        >
                            ↺
                        </button>
                    )}
                </div>
            </td>
            <td style={{ textAlign: 'right' }}>
                {totalValue > 0 ? `¥${Math.round(totalValue).toLocaleString()}` : '-'}
            </td>
            <td style={{ fontSize: '0.8rem', color: '#666' }}>
                {item.vendor || '-'}
            </td>
            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {typeof onEdit === 'function' && (
                    <button
                        type="button"
                        onClick={() => onEdit(item)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.7 }}
                        title="編集"
                    >
                        ✎
                    </button>
                )}
                <button
                    onClick={() => onDelete(item)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.6 }}
                    title="リストから除外する"
                >
                    🗑️
                </button>
            </td>
        </tr>
    );
};

export const InventoryList = ({ items, loading, onDelete, onUpdateQuantity, onToggleTax, onEdit, onRequestUnitSync }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: 'inventory-list-droppable',
    });

    const isLowStock = (item) => item.threshold > 0 && item.quantity <= item.threshold;

    const [sortConfig, setSortConfig] = React.useState({ key: null, direction: 'asc' }); // key: 'vendor'

    const handleSort = (key) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const sortedItems = React.useMemo(() => {
        if (!sortConfig.key) return items;
        const data = [...items];

        if (sortConfig.key === 'vendor') {
            data.sort((a, b) => {
                const av = (a?.vendor || '').toString();
                const bv = (b?.vendor || '').toString();
                const cmp = av.localeCompare(bv, 'ja');
                if (cmp !== 0) return sortConfig.direction === 'asc' ? cmp : -cmp;

                // secondary: name for stable feel
                const an = (a?.name || '').toString();
                const bn = (b?.name || '').toString();
                const cmp2 = an.localeCompare(bn, 'ja');
                return sortConfig.direction === 'asc' ? cmp2 : -cmp2;
            });
        }
        return data;
    }, [items, sortConfig]);

    return (
        <div
            ref={setNodeRef}
            className={`inventory-list-droppable ${isOver ? 'highlight-drop' : ''}`}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: isOver ? '#f0f9ff' : 'transparent',
                transition: 'background-color 0.2s',
                borderRadius: '8px',
                padding: '8px'
            }}
        >


            <div className="inventory-table-container">
                {loading ? <p>Loading...</p> : (
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'center', width: '50px' }}>10%</th>
                                <th>品名</th>
                                <th style={{ textAlign: 'right' }}>仕入れ値</th>
                                <th style={{ textAlign: 'right' }}>内容量</th>
                                <th style={{ textAlign: 'right' }}>在庫数</th>
                                <th>単位</th>
                                <th style={{ textAlign: 'right' }}>在庫金額(税込)</th>
                                <th
                                    onClick={() => handleSort('vendor')}
                                    title="クリックで業者名ソート"
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    業者名 {sortConfig.key === 'vendor' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                </th>
                                <th style={{ width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedItems.map(item => (
                                <InventoryItemRow
                                    key={item.id}
                                    item={item}
                                    isLowStock={isLowStock}
                                    onUpdateQuantity={onUpdateQuantity}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    onToggleTax={onToggleTax}
                                    onRequestUnitSync={onRequestUnitSync}
                                />
                            ))}
                            {sortedItems.length === 0 && (
                                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
                                    {isOver ? 'ここにドロップして新規登録' : 'データがありません'}
                                </td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            {(() => {
                                const totals = items.reduce((acc, item) => {
                                    const price = parseFloat(item.price) || 0;
                                    const qty = item.quantity === '' ? 0 : (parseFloat(item.quantity) || 0);
                                    const tax = item?.tax10 === true || item?.tax10 === 1 || item?.tax10 === '1' || item?.tax10 === 'true' ? 1.1 : 1.08;
                                    const base = price * qty;
                                    acc.net += base;
                                    acc.taxed += base * tax;
                                    return acc;
                                }, { net: 0, taxed: 0 });
                                return (
                                    <tr style={{ fontWeight: 'bold', backgroundColor: '#f9f9f9' }}>
                                        <td colSpan="6" style={{ textAlign: 'right', paddingRight: '10px' }}>
                                            合計（税抜 / 税込）:
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            ¥{Math.round(totals.net).toLocaleString()} / ¥{Math.round(totals.taxed).toLocaleString()}
                                        </td>
                                        <td colSpan="2"></td>
                                    </tr>
                                );
                            })()}
                        </tfoot>
                    </table>
                )}
            </div>

            {isOver && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    border: '2px dashed #3498db',
                    borderRadius: '8px',
                    pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem', color: '#3498db', fontWeight: 'bold'
                }}>
                    + 新規登録
                </div>
            )}
        </div>
    );
};
