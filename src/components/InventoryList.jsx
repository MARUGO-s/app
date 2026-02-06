import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Button } from './Button';
import { Input } from './Input';

const InventoryItemRow = ({ item, isLowStock, onUpdateQuantity, onDelete, onToggleTax }) => {
    const [localQuantity, setLocalQuantity] = React.useState(item.quantity === '' ? '' : (parseFloat(item.quantity) || 0));

    // Sync from parent prop if it changes externally (e.g. reload) - keeping basic sync
    React.useEffect(() => {
        setLocalQuantity(item.quantity === '' ? '' : (parseFloat(item.quantity) || 0));
    }, [item.quantity]);

    const price = parseFloat(item.price) || 0;
    const isTax10 = item?.tax10 === true || item?.tax10 === 1 || item?.tax10 === '1' || item?.tax10 === 'true';
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

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    };

    const moveCaretToEnd = (e) => {
        const el = e?.target;
        if (!el) return;
        // Ensure caret moves to end even if user clicks middle
        requestAnimationFrame(() => {
            try {
                const len = String(el.value ?? '').length;
                el.setSelectionRange(len, len);
            } catch {
                // Some input types/browsers don't support selection ranges
            }
        });
    };

    return (
        <tr className={isLowStock(item) ? 'low-stock' : ''}>
            <td style={{ textAlign: 'center' }}>
                <input
                    type="checkbox"
                    checked={isTax10}
                    onChange={(e) => onToggleTax && onToggleTax(item, e.target.checked)}
                    title="10%対象"
                    className="inventory-tax-checkbox"
                />
            </td>
            <td>
                {item.name}
                {isLowStock(item) && <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: 'red' }}>⚠️</span>}
            </td>
            <td style={{ textAlign: 'right' }}>
                {price > 0 ? `¥${price.toLocaleString()}` : '-'}
            </td>
            <td>{item.unit}</td>
            <td style={{ textAlign: 'right', fontSize: '0.85rem', color: '#666' }}>
                {capacityLabel}
            </td>
            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                <input
                    type="text"
                    inputMode="decimal"
                    value={localQuantity}
                    onChange={(e) => setLocalQuantity(e.target.value)}
                    className="inventory-quantity-input no-print"
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onFocus={moveCaretToEnd}
                    onClick={moveCaretToEnd}
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
            <td style={{ textAlign: 'right' }}>
                {totalValue > 0 ? `¥${Math.round(totalValue).toLocaleString()}` : '-'}
            </td>
            <td style={{ fontSize: '0.8rem', color: '#666' }}>
                {item.vendor || '-'}
            </td>
            <td style={{ textAlign: 'center' }}>
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

export const InventoryList = ({ items, loading, onSearch, searchQuery, onEdit, onDelete, onUpdateQuantity, onToggleTax }) => {
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
                                <th>単位</th>
                                <th style={{ textAlign: 'right' }}>内容量</th>
                                <th style={{ textAlign: 'right' }}>在庫数</th>
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
                                    onDelete={onDelete}
                                    onToggleTax={onToggleTax}
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
