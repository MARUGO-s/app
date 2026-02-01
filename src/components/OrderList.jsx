import React, { useState, useEffect } from 'react';
import { plannerService } from '../services/plannerService';
import { recipeService } from '../services/recipeService';
import { inventoryService } from '../services/inventoryService';
import { Button } from './Button';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
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

            // 3. Aggregate Ingredients
            const totals = {}; // name -> { quantity, unit }

            recipeDetails.forEach(r => {
                const ingredients = r.ingredients || [];
                // Bread handling: combine flours and other
                const allIngs = [...ingredients, ...(r.flours || []), ...(r.breadIngredients || [])];

                allIngs.forEach(ing => {
                    if (!ing.name) return;
                    const name = ing.name.trim();
                    const qty = parseFloat(ing.quantity) || 0;
                    const unit = ing.unit || '';

                    if (!totals[name]) {
                        totals[name] = { quantity: 0, unit: unit, count: 0 };
                    }
                    totals[name].quantity += qty;
                    // Unit mismatch handling is complex, ignoring for MVP (assuming consistent units)
                });
            });

            // 4. Subtract Inventory
            const inventory = await inventoryService.getAll(user.id);

            const results = Object.keys(totals).map(name => {
                const req = totals[name];
                const stockItem = inventory.find(i => i.name === name); // Simple match
                const stockQty = stockItem ? parseFloat(stockItem.quantity) : 0;

                const toOrder = Math.max(0, req.quantity - stockQty);

                return {
                    name,
                    required: req.quantity,
                    stock: stockQty,
                    toOrder: toOrder,
                    unit: req.unit
                };
            }).filter(i => i.toOrder > 0.01); // Filter out zero orders

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
        return orderItems.map(i => `・${i.name}: ${i.toOrder.toFixed(1)}${i.unit}`).join('\n');
    };

    const handleCopyToClipboard = async () => {
        const textarea = document.getElementById('copy-textarea');
        if (textarea) {
            textarea.select();
            try {
                await navigator.clipboard.writeText(textarea.value);
                toast.success('クリップボードにコピーしました✓');
            } catch (err) {
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
                                <th style={{ textAlign: 'right' }}>在庫引当</th>
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
                                        <td style={{ textAlign: 'right' }}>-{item.stock.toFixed(1)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                            {item.toOrder.toFixed(1)} <span style={{ fontSize: '0.8em' }}>{item.unit}</span>
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
                                <th style={{ textAlign: 'right' }}>在庫引当</th>
                                <th style={{ textAlign: 'right' }}>発注量</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderItems.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.name}</td>
                                    <td style={{ textAlign: 'right' }}>{item.required.toFixed(1)} {item.unit}</td>
                                    <td style={{ textAlign: 'right' }}>-{item.stock.toFixed(1)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                        {item.toOrder.toFixed(1)} {item.unit}
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
