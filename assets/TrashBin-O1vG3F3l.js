const e=`import React, { useState, useEffect, useCallback } from 'react';
import { trashService } from '../services/trashService.js';
import { DeleteConfirmModal } from './DeleteConfirmModal.jsx';
import { Button } from './Button.jsx';

/**
 * ゴミ箱コンポーネント
 * 価格データCSVと材料マスターのゴミ箱を表示し、完全削除・復元を行う
 */
export const TrashBin = () => {
    const [priceCsvTrash, setPriceCsvTrash] = useState([]);
    const [ingredientTrash, setIngredientTrash] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // 選択状態
    const [selectedPriceCsv, setSelectedPriceCsv] = useState(new Set());
    const [selectedIngredient, setSelectedIngredient] = useState(new Set());

    // 削除確認モーダル
    const [deleteModal, setDeleteModal] = useState(null); // { type: 'price'|'ingredient'|'all', ids: [] }
    const [deleteLoading, setDeleteLoading] = useState(false);

    // 復元ローディング
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null); // { type: 'success'|'error', text: string }

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [pc, im] = await Promise.all([
                trashService.listPriceCsvTrash(),
                trashService.listIngredientTrash(),
            ]);
            setPriceCsvTrash(pc);
            setIngredientTrash(im);
        } catch (e) {
            console.error(e);
            setError('ゴミ箱データの取得に失敗しました: ' + (e?.message || String(e)));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const showStatus = (type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg(null), 4000);
    };

    // ---- 価格データCSV ----
    const togglePriceCsv = (id) => {
        setSelectedPriceCsv(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleRestorePriceCsv = async () => {
        const ids = Array.from(selectedPriceCsv);
        if (ids.length === 0) return;
        setRestoreLoading(true);
        try {
            const results = await trashService.restorePriceCsvFromTrash(ids);
            const failed = (results || []).filter(r => r.error);
            showStatus('success', \`\${ids.length - failed.length}件を復元しました\${failed.length > 0 ? \`（\${failed.length}件失敗）\` : ''}\`);
            setSelectedPriceCsv(new Set());
            await load();
        } catch (e) {
            showStatus('error', '復元に失敗しました: ' + (e?.message || String(e)));
        } finally {
            setRestoreLoading(false);
        }
    };

    const handlePermanentDeletePriceCsv = async () => {
        const ids = deleteModal?.ids || [];
        setDeleteLoading(true);
        try {
            await trashService.permanentlyDeletePriceCsvTrash(ids);
            showStatus('success', \`\${ids.length}件を完全削除しました\`);
            setSelectedPriceCsv(new Set());
            setDeleteModal(null);
            await load();
        } catch (e) {
            showStatus('error', '完全削除に失敗しました: ' + (e?.message || String(e)));
        } finally {
            setDeleteLoading(false);
        }
    };

    // ---- 材料マスター ----
    const toggleIngredient = (id) => {
        setSelectedIngredient(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleRestoreIngredient = async (id) => {
        setRestoreLoading(true);
        try {
            await trashService.restoreIngredientFromTrash(id);
            showStatus('success', '材料マスターを復元しました');
            setSelectedIngredient(new Set());
            await load();
        } catch (e) {
            showStatus('error', '復元に失敗しました: ' + (e?.message || String(e)));
        } finally {
            setRestoreLoading(false);
        }
    };

    const handlePermanentDeleteIngredient = async () => {
        const ids = deleteModal?.ids || [];
        setDeleteLoading(true);
        try {
            await trashService.permanentlyDeleteIngredientTrash(ids);
            showStatus('success', \`\${ids.length}件を完全削除しました\`);
            setSelectedIngredient(new Set());
            setDeleteModal(null);
            await load();
        } catch (e) {
            showStatus('error', '完全削除に失敗しました: ' + (e?.message || String(e)));
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteModal) return;
        if (deleteModal.type === 'price') {
            await handlePermanentDeletePriceCsv();
        } else {
            await handlePermanentDeleteIngredient();
        }
    };

    const isLoading = loading || restoreLoading || deleteLoading;
    const isEmpty = priceCsvTrash.length === 0 && ingredientTrash.length === 0;

    return (
        <div style={{ padding: '1rem', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.4rem' }}>🗑️ ゴミ箱</h3>
                <Button variant="ghost" onClick={load} disabled={isLoading} style={{ fontSize: '0.85rem' }}>
                    {loading ? '読み込み中...' : '🔄 更新'}
                </Button>
            </div>

            {error && (
                <div className="status-msg error" style={{ marginBottom: '1rem' }}>{error}</div>
            )}
            {statusMsg && (
                <div className={\`status-msg \${statusMsg.type}\`} style={{ marginBottom: '1rem' }}>{statusMsg.text}</div>
            )}

            {!loading && isEmpty && (
                <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '3rem', fontSize: '1rem' }}>
                    ゴミ箱は空です
                </div>
            )}

            {/* ---- 価格データCSV ---- */}
            {priceCsvTrash.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem' }}>💰 価格データCSV（{priceCsvTrash.length}件）</h4>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <Button
                                variant="secondary"
                                onClick={handleRestorePriceCsv}
                                disabled={selectedPriceCsv.size === 0 || isLoading}
                            >
                                復元（{selectedPriceCsv.size}件選択中）
                            </Button>
                            <Button
                                variant="danger"
                                onClick={() => setDeleteModal({ type: 'price', ids: selectedPriceCsv.size > 0 ? Array.from(selectedPriceCsv) : priceCsvTrash.map(r => r.id) })}
                                disabled={isLoading}
                            >
                                {selectedPriceCsv.size > 0 ? \`選択を完全削除（\${selectedPriceCsv.size}件）\` : '全件完全削除'}
                            </Button>
                        </div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#f8f9fa' }}>
                                    <th style={{ width: 36, padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                                        <input type="checkbox"
                                            checked={selectedPriceCsv.size === priceCsvTrash.length}
                                            onChange={e => setSelectedPriceCsv(e.target.checked ? new Set(priceCsvTrash.map(r => r.id)) : new Set())}
                                        />
                                    </th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#111' }}>ファイル名</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#111', whiteSpace: 'nowrap' }}>削除日時</th>
                                </tr>
                            </thead>
                            <tbody>
                                {priceCsvTrash.map(row => (
                                    <tr key={row.id} onClick={() => togglePriceCsv(row.id)} style={{ cursor: 'pointer', background: selectedPriceCsv.has(row.id) ? '#fef2f2' : undefined }}>
                                        <td style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                                            <input type="checkbox" checked={selectedPriceCsv.has(row.id)} onChange={() => togglePriceCsv(row.id)} onClick={e => e.stopPropagation()} />
                                        </td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#1f2937' }}>{row.file_name}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#6b7280', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                            {new Date(row.deleted_at).toLocaleString('ja-JP')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ---- 材料マスター ---- */}
            {ingredientTrash.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem' }}>📦 材料マスター（{ingredientTrash.length}件）</h4>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <Button
                                variant="danger"
                                onClick={() => setDeleteModal({ type: 'ingredient', ids: selectedIngredient.size > 0 ? Array.from(selectedIngredient) : ingredientTrash.map(r => r.id) })}
                                disabled={isLoading}
                            >
                                {selectedIngredient.size > 0 ? \`選択を完全削除（\${selectedIngredient.size}件）\` : '全件完全削除'}
                            </Button>
                        </div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#f8f9fa' }}>
                                    <th style={{ width: 36, padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                                        <input type="checkbox"
                                            checked={selectedIngredient.size === ingredientTrash.length}
                                            onChange={e => setSelectedIngredient(e.target.checked ? new Set(ingredientTrash.map(r => r.id)) : new Set())}
                                        />
                                    </th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#111' }}>ラベル</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#111' }}>件数</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#111', whiteSpace: 'nowrap' }}>削除日時</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #eee', color: '#111' }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ingredientTrash.map(row => (
                                    <tr key={row.id} style={{ background: selectedIngredient.has(row.id) ? '#fef2f2' : undefined }}>
                                        <td style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                                            <input type="checkbox" checked={selectedIngredient.has(row.id)} onChange={() => toggleIngredient(row.id)} />
                                        </td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#1f2937' }}>{row.label}</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#374151' }}>{(row.item_count || 0).toLocaleString()}件</td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#6b7280', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                            {new Date(row.deleted_at).toLocaleString('ja-JP')}
                                        </td>
                                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleRestoreIngredient(row.id)}
                                                disabled={isLoading}
                                            >
                                                復元
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={!!deleteModal}
                onClose={() => setDeleteModal(null)}
                onConfirm={handleConfirmDelete}
                title="ゴミ箱から完全削除"
                description={
                    <span>
                        選択したデータを<strong>完全に削除</strong>します。<br />
                        この操作は取り消せず、復元もできません。
                    </span>
                }
                loading={deleteLoading}
            />
        </div>
    );
};
`;export{e as default};
