import React, { useState } from 'react';
import { plannerService } from '../services/plannerService';
import { recipeService } from '../services/recipeService';
import { inventoryService } from '../services/inventoryService';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import { csvUnitOverrideService } from '../services/csvUnitOverrideService';
import { shortageService } from '../services/shortageService';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { Button } from './Button';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { Modal } from './Modal';
import './OrderList.css';

export const OrderList = ({ onBack, onNavigateToPlanner }) => {
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

    // DEBUG: Expose services for verification
    React.useEffect(() => {
        window.plannerService = plannerService;
        window.shortageService = shortageService;
        window.recipeService = recipeService;
    }, []);

    const generateList = async () => {
        setLoading(true);
        try {
            if (!user?.id) {
                toast.error('ログインが必要です');
                setLoading(false);
                return;
            }

            // Using the new shared service
            const results = await shortageService.calculateShortages(user, startDate, endDate);

            if (results.length === 0) {
                // Check if it's because of no plans or just no shortages?
                // The service returns [] if no plans OR no shortages.
                // For UI feedback, might be nice to know, but for now consistent behavior:
                // "No shortages" is a valid result.
                // However, the original code had a specific check for "no plans".
                // The service returns [] for both.
                // If we want to preserve "No plans" message, we might need to check plans first locally,
                // but simpler is to just show the empty list or a generic message.
                // The original code: if (recipesToCook.length === 0) toast.info...
                // The service returns empty array.
                // Let's rely on the service logic. If empty, it means no actions needed.
            }

            setOrderItems(results);
            setGenerated(true);

        } catch (e) {
            console.error(e);
            toast.error('生成に失敗しました: ' + (e.message || String(e)));
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
                    <Button variant="secondary" onClick={onNavigateToPlanner} style={{ marginRight: '8px' }}>📅 仕込みカレンダーへ</Button>
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
