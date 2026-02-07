import React, { useState } from 'react';
import { plannerService } from '../services/plannerService';
import { recipeService } from '../services/recipeService';
import { inventoryService } from '../services/inventoryService';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import { csvUnitOverrideService } from '../services/csvUnitOverrideService';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { Button } from './Button';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { Modal } from './Modal';
import './OrderList.css';

export const OrderList = ({ onBack }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)); // +7 days

    const [orderItems, setOrderItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);

    // モーダル用のステート
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);

    const generateList = async () => {
        setLoading(true);
        try {
            if (!user?.id) {
                toast.error('ログインが必要です');
                setLoading(false);
                return;
            }

            // 1. Get Plans
            const allPlans = await plannerService.getAll(user.id);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const recipesToCook = [];

            Object.keys(allPlans).forEach(dateStr => {
                const planDate = new Date(dateStr);
                if (planDate >= start && planDate <= end) {
                    allPlans[dateStr].forEach(meal => {
                        recipesToCook.push(meal.recipeId);
                    });
                }
            });

            if (recipesToCook.length === 0) {
                toast.info('指定期間に予定がありません。仕込みカレンダーで予定を作成してください');
                setGenerated(false);
                return;
            }

            // 2. Fetch Recipes Details
            const allRecipes = await recipeService.fetchRecipes(user);
            const recipeDetails = recipesToCook.map(id => allRecipes.find(r => r.id === id)).filter(Boolean);

            const normalize = (s) => (s ?? '').toString().trim();
            const normalizeUnit = (u) => {
                const s = normalize(u);
                if (!s) return '';
                const lower = s.toLowerCase();
                if (lower === 'ｇ') return 'g';
                if (lower === 'ｍｌ') return 'ml';
                if (lower === 'ｃｃ') return 'cc';
                if (lower === 'ｋｇ') return 'kg';
                if (lower === 'ｌ') return 'l';
                return lower;
            };

            const isCountUnit = (uRaw) => {
                const u = normalize(uRaw);
                if (!u) return false;
                return ['本', '個', '袋', '枚', 'パック', '缶', '箱', 'PC', 'pc', '包'].includes(u);
            };

            const toBaseUnit = (qtyRaw, unitRaw) => {
                const qty = parseFloat(qtyRaw) || 0;
                const u = normalizeUnit(unitRaw);
                if (u === 'kg') return { qty: qty * 1000, unit: 'g' };
                if (u === 'g') return { qty, unit: 'g' };
                if (u === 'l') return { qty: qty * 1000, unit: 'ml' };
                if (u === 'cc') return { qty, unit: 'ml' };
                if (u === 'ml') return { qty, unit: 'ml' };
                return { qty, unit: normalize(unitRaw) || '' };
            };

            const normalizeByMasterIfNeeded = (name, qtyRaw, unitRaw, conv) => {
                const unit = normalize(unitRaw);
                const qty = parseFloat(qtyRaw) || 0;
                if (!conv) return toBaseUnit(qty, unit);
                const packetSize = parseFloat(conv.packetSize);
                const packetUnit = normalizeUnit(conv.packetUnit);
                if (!Number.isFinite(packetSize) || packetSize <= 0 || !packetUnit) return toBaseUnit(qty, unit);

                const masterIsMeasurable = ['g', 'kg', 'ml', 'cc', 'l'].includes(packetUnit);
                if (masterIsMeasurable && isCountUnit(unit)) {
                    const content = qty * packetSize;
                    return toBaseUnit(content, packetUnit);
                }
                return toBaseUnit(qty, unit);
            };

            // Load master + csv master + inventory in parallel
            const [conversions, csvPriceMap, inventoryRaw, csvUnitOverrides] = await Promise.all([
                unitConversionService.getAllConversions(),
                purchasePriceService.fetchPriceList(user.id),
                inventoryService.getAll(user.id),
                csvUnitOverrideService.getAll(user.id),
            ]);

            const convByKey = new Map();
            try {
                for (const [rawName, row] of (conversions || new Map()).entries()) {
                    const k = normalizeIngredientKey(rawName);
                    if (!k) continue;
                    if (!convByKey.has(k)) convByKey.set(k, row);
                }
            } catch {
                // ignore
            }

            const overrideByKey = new Map();
            try {
                for (const [rawName, unit] of (csvUnitOverrides || new Map()).entries()) {
                    const k = normalizeIngredientKey(rawName);
                    if (!k) continue;
                    if (!overrideByKey.has(k)) overrideByKey.set(k, unit);
                }
            } catch {
                // ignore
            }

            const inventoryByKey = new Map();
            try {
                (inventoryRaw || []).forEach((row) => {
                    const k = normalizeIngredientKey(row?.name);
                    if (!k) return;
                    if (!inventoryByKey.has(k)) inventoryByKey.set(k, row);
                });
            } catch {
                // ignore
            }

            // 3. Aggregate Ingredients (normalized)
            const totals = {}; // name -> { quantity, unit }

            recipeDetails.forEach(r => {
                const ingredients = r.ingredients || [];
                // Bread handling: combine flours and other
                const allIngs = [...ingredients, ...(r.flours || []), ...(r.breadIngredients || [])];

                allIngs.forEach(ing => {
                    if (!ing.name) return;
                    const name = normalize(ing.name);
                    const key = normalizeIngredientKey(name);
                    const conv = (key ? convByKey.get(key) : null) || (conversions?.get(name) || null);
                    const normalizedIng = normalizeByMasterIfNeeded(name, ing.quantity, ing.unit, conv);
                    const qty = normalizedIng.qty || 0;
                    const unit = normalizedIng.unit || '';

                    if (!totals[name]) {
                        totals[name] = { quantity: 0, unit: unit, count: 0 };
                    }
                    totals[name].quantity += qty;
                    // Unit mismatch handling is complex, ignoring for MVP (assuming consistent units)
                });
            });

            // 4. Subtract Inventory + 20% rule + pack-based ordering
            const results = Object.keys(totals).map(name => {
                const req = totals[name];
                const key = normalizeIngredientKey(name);
                const conv = (key ? convByKey.get(key) : null) || (conversions?.get(name) || null);
                const csvEntry = (key ? (csvPriceMap?.get(key) || null) : null); // { price, vendor, unit, dateStr }

                const stockItem = key ? (inventoryByKey.get(key) || null) : null;
                const stockNorm = normalizeByMasterIfNeeded(name, stockItem?.quantity ?? 0, stockItem?.unit ?? req.unit, conv);

                const required = req.quantity || 0;
                const stock = stockNorm.qty || 0;
                const unit = req.unit || stockNorm.unit || '';
                const remaining = stock - required;

                const packetSize = parseFloat(conv?.packetSize);
                const packetUnit = normalize(conv?.packetUnit);
                const hasPack = Number.isFinite(packetSize) && packetSize > 0 && !!packetUnit;

                const minRemaining = hasPack ? (packetSize * 0.2) : 0;
                const needsOrderByRule = hasPack ? (remaining < minRemaining) : false;

                // Ordering unit should be "元の単位（CSV）" first, optionally overridden by user.
                // This keeps the UI aligned with how vendors actually sell the item (袋/本/箱...).
                const csvOrderUnit = csvEntry?.unit ? String(csvEntry.unit).trim() : '';
                const overrideUnit = (key && overrideByKey.has(key)) ? String(overrideByKey.get(key)).trim() : '';
                const orderUnitLabel =
                    (overrideUnit ? overrideUnit : '') ||
                    (csvOrderUnit ? csvOrderUnit : '') ||
                    '袋';

                const packPrice =
                    (conv?.lastPrice !== null && conv?.lastPrice !== undefined && conv?.lastPrice !== '' ? parseFloat(conv.lastPrice) : null) ??
                    (csvEntry?.price !== null && csvEntry?.price !== undefined ? parseFloat(csvEntry.price) : null);

                let orderPacks = null;
                let orderQty = 0;
                let orderUnit = unit;

                if (hasPack) {
                    const additionalNeeded = Math.max(0, minRemaining - remaining);
                    orderPacks = Math.ceil(additionalNeeded / packetSize);
                    if (needsOrderByRule && orderPacks < 1) orderPacks = 1;
                    orderQty = orderPacks;
                    orderUnit = orderUnitLabel;
                } else {
                    orderQty = Math.max(0, required - stock);
                    orderUnit = unit;
                }

                // If we have master capacity, the rule is strictly "remaining < 20% of one pack".
                // If we don't have master capacity, fall back to old "shortage" logic.
                const shouldShow = hasPack ? needsOrderByRule : orderQty > 0.01;

                return {
                    name,
                    required,
                    stock,
                    remaining,
                    unit,
                    shouldShow,
                    toOrder: orderQty,
                    orderUnit,
                    orderPacks,
                    packSize: hasPack ? packetSize : null,
                    packUnit: hasPack ? packetUnit : null,
                    packPrice: Number.isFinite(packPrice) ? packPrice : null,
                    vendor: csvEntry?.vendor || stockItem?.vendor || '',
                };
            }).filter(i => i.shouldShow);

            setOrderItems(results);
            setGenerated(true);

        } catch (e) {
            console.error(e);
            toast.error('生成に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCopyModal = () => {
        setShowCopyModal(true);
    };

    const handleOpenPrintModal = () => {
        setShowPrintModal(true);
    };

    const getCopyText = () => {
        return orderItems.map(i => {
            if (Number.isFinite(i.orderPacks) && i.orderPacks !== null) {
                const packInfo = (i.packSize && i.packUnit) ? `（1${i.orderUnit}=${i.packSize}${i.packUnit}）` : '';
                return `・${i.name}: ${i.orderPacks}${i.orderUnit}${packInfo}`;
            }
            return `・${i.name}: ${Number(i.toOrder || 0).toFixed(1)}${i.unit}`;
        }).join('\n');
    };

    const handleCopyToClipboard = async () => {
        const textarea = document.getElementById('copy-textarea');
        if (textarea) {
            textarea.select();
            try {
                await navigator.clipboard.writeText(textarea.value);
                toast.success('クリップボードにコピーしました✓');
            } catch {
                // フォールバック: 古いブラウザ用
                document.execCommand('copy');
                toast.success('クリップボードにコピーしました✓');
            }
        }
    };

    return (
        <div className="order-list-container fade-in">
            <div className="container-header">
                <h2 className="section-title">🛒 発注リスト作成</h2>
                <div className="header-actions">
                    <Button variant="ghost" onClick={onBack}>← メニュー</Button>
                </div>
            </div>

            <div className="filter-card">
                <div className="date-range-inputs">
                    <div>
                        <label>開始日</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <span>〜</span>
                    <div>
                        <label>終了日</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <Button variant="primary" onClick={generateList} disabled={loading}>
                        {loading ? '計算中...' : 'リスト作成'}
                    </Button>
                </div>
            </div>

            {generated && (
                <div className="order-results">
                    <div className="results-header">
                        <h3>発注推奨リスト ({orderItems.length}件)</h3>
                        <div className="result-actions">
                            <Button variant="secondary" onClick={handleOpenCopyModal}>📋 コピー</Button>
                            <Button variant="secondary" onClick={handleOpenPrintModal}>🖨️ プレビュー</Button>
                        </div>
                    </div>

                    <table className="order-table">
                        <thead>
                            <tr>
                                <th>材料名</th>
                                <th style={{ textAlign: 'right' }}>必要量</th>
	                                <th style={{ textAlign: 'right' }}>残在庫</th>
                                <th style={{ textAlign: 'right' }}>発注量</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderItems.length === 0 ? (
                                <tr><td colSpan="4" style={{ textAlign: 'center' }}>発注が必要なものはありません（在庫で足ります）</td></tr>
                            ) : (
                                orderItems.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.name}</td>
                                        <td style={{ textAlign: 'right' }}>{item.required.toFixed(1)} {item.unit}</td>
	                                        <td style={{ textAlign: 'right' }}>
	                                            {Math.max(0, (item.remaining ?? 0)).toFixed(1)} {item.unit}
	                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
	                                            {Number.isFinite(item.orderPacks) && item.orderPacks !== null ? (
	                                                <>
	                                                    {item.orderPacks}{item.orderUnit}
	                                                    {(item.packSize && item.packUnit) && (
	                                                        <div style={{ fontSize: '0.75em', fontWeight: 'normal', color: '#666' }}>
	                                                            1{item.orderUnit} = {Number(item.packSize).toLocaleString()}{item.packUnit}
	                                                            {item.packPrice ? ` / ¥${Math.round(item.packPrice).toLocaleString()}` : ''}
	                                                        </div>
	                                                    )}
	                                                </>
	                                            ) : (
	                                                <>
	                                                    {item.toOrder.toFixed(1)} <span style={{ fontSize: '0.8em' }}>{item.unit}</span>
	                                                </>
	                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* コピー用モーダル */}
            <Modal
                isOpen={showCopyModal}
                onClose={() => setShowCopyModal(false)}
                title="📋 発注リストをコピー"
                size="medium"
            >
                <div className="copy-modal-content">
                    <p className="copy-instructions">
                        以下のテキストを選択してコピーできます。
                    </p>
                    <textarea
                        id="copy-textarea"
                        className="copy-textarea"
                        readOnly
                        value={getCopyText()}
                        onClick={(e) => e.target.select()}
                    />
                    <div className="modal-actions">
                        <Button variant="primary" onClick={handleCopyToClipboard}>
                            📋 クリップボードにコピー
                        </Button>
                        <Button variant="ghost" onClick={() => setShowCopyModal(false)}>
                            閉じる
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* 印刷プレビュー用モーダル */}
            <Modal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                title="🖨️ 発注リストプレビュー"
                size="large"
            >
                <div className="print-preview-content">
                    <div className="print-preview-header">
                        <h3>発注推奨リスト</h3>
                        <p className="print-period">
                            期間: {startDate} 〜 {endDate}
                        </p>
                    </div>
                    <table className="print-preview-table">
                        <thead>
                            <tr>
                                <th>材料名</th>
                                <th style={{ textAlign: 'right' }}>必要量</th>
	                                <th style={{ textAlign: 'right' }}>残在庫</th>
                                <th style={{ textAlign: 'right' }}>発注量</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderItems.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.name}</td>
                                    <td style={{ textAlign: 'right' }}>{item.required.toFixed(1)} {item.unit}</td>
	                                    <td style={{ textAlign: 'right' }}>
	                                        {Math.max(0, (item.remaining ?? 0)).toFixed(1)} {item.unit}
	                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
	                                        {Number.isFinite(item.orderPacks) && item.orderPacks !== null
	                                            ? `${item.orderPacks}${item.orderUnit}`
	                                            : `${item.toOrder.toFixed(1)} ${item.unit}`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="modal-actions">
                        <Button variant="primary" onClick={() => window.print()}>
                            🖨️ 印刷する
                        </Button>
                        <Button variant="ghost" onClick={() => setShowPrintModal(false)}>
                            閉じる
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
