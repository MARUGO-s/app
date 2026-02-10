import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { incomingDeliveryService } from '../services/incomingDeliveryService.js';
import { incomingStockService } from '../services/incomingStockService.js';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import { Input } from './Input';
import './IncomingStock.css';

const toBaseName = (fileName) => String(fileName || '').replace(/\.json$/i, '');

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
};

export const IncomingStock = ({ onBack }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [deliveries, setDeliveries] = React.useState([]); // json file list
  const [appliedSet, setAppliedSet] = React.useState(new Set());
  const [stock, setStock] = React.useState({ items: [] });
  const [applyLoading, setApplyLoading] = React.useState(null); // null | 'all' | baseName
  const [activeTab, setActiveTab] = React.useState('need_order'); // 'need_order' | vendorName

  // Consume Modal State
  const [consumeModalOpen, setConsumeModalOpen] = React.useState(false);
  const [consumeTarget, setConsumeTarget] = React.useState(null); // { name, unit, currentQty }
  const [consumeAmount, setConsumeAmount] = React.useState('');
  const [consumeLoading, setConsumeLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, applied, currentStock] = await Promise.all([
        incomingDeliveryService.listJsonFiles(),
        incomingStockService.listAppliedBaseNames(),
        incomingStockService.loadStock(),
      ]);
      setDeliveries(list || []);
      setAppliedSet(applied || new Set());
      setStock(currentStock || { items: [] });
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const applyOne = async (fileName) => {
    const baseName = toBaseName(fileName);
    setApplyLoading(baseName);
    setError('');
    try {
      const parsed = await incomingDeliveryService.downloadJson(fileName);
      const res = await incomingStockService.applyDeliverySet({ baseName, parsed });
      if (res?.status === 'already_applied') {
        setError('このPDFはすでに反映済みです（重複加算しません）');
      }
      await reload();
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setApplyLoading(null);
    }
  };

  const applyAll = async () => {
    setApplyLoading('all');
    setError('');
    try {
      // Work on a snapshot of the current list to avoid state churn.
      const list = await incomingDeliveryService.listJsonFiles();
      const applied = await incomingStockService.listAppliedBaseNames();

      for (const f of (list || [])) {
        const fileName = f?.name;
        if (!fileName) continue;
        const baseName = toBaseName(fileName);
        if (applied.has(baseName)) continue;

        const parsed = await incomingDeliveryService.downloadJson(fileName);
        const res = await incomingStockService.applyDeliverySet({ baseName, parsed });
        if (res?.status === 'applied') applied.add(baseName);
      }

      await reload();
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setApplyLoading(null);
    }
  };

  const openConsumeModal = (item) => {
    setConsumeTarget(item);
    setConsumeAmount('');
    setConsumeModalOpen(true);
    setError('');
  };

  const addToConsumeAmount = (val) => {
    setConsumeAmount((prev) => {
      const current = parseFloat(prev) || 0;
      const next = current + val;
      // Precision handling for float addition
      return String(Math.round(next * 100) / 100);
    });
  };

  const handleConsume = async () => {
    if (!consumeTarget) return;
    const amount = Number(consumeAmount);
    if (!consumeAmount || isNaN(amount) || amount <= 0) {
      setError('有効な数量を入力してください');
      return;
    }

    setConsumeLoading(true);
    setError('');
    try {
      // Delta is negative for consumption
      await incomingStockService.updateStockItem({
        name: consumeTarget.name,
        unit: consumeTarget.unit,
        vendor: consumeTarget.vendor,
        delta: -amount
      });

      // Optimistic update: update local state directly instead of reloading
      // from Storage (which may return cached/stale data).
      setStock(prev => ({
        ...prev,
        items: (prev.items || []).map(item => {
          const isMatch =
            item.name === consumeTarget.name &&
            (item.unit || '') === (consumeTarget.unit || '') &&
            (item.vendor || '') === (consumeTarget.vendor || '');

          if (isMatch) {
            const newQty = Math.max(0, (item.quantity || 0) - amount);
            return { ...item, quantity: Math.round(newQty * 1000) / 1000 };
          }
          return item;
        })
      }));

      setConsumeModalOpen(false);
      setConsumeTarget(null);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      setConsumeLoading(false);
    }
  };

  // Delete Item State
  const [deleteItemOpen, setDeleteItemOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState(null); // { name, unit, vendor }
  const [deleteItemLoading, setDeleteItemLoading] = React.useState(false);

  // Clear All State
  const [clearAllOpen, setClearAllOpen] = React.useState(false);
  const [clearAllLoading, setClearAllLoading] = React.useState(false);

  const handleDeleteItemClick = (item) => {
    setItemToDelete(item);
    setDeleteItemOpen(true);
    setError('');
  };

  const handleExecuteDeleteItem = async () => {
    if (!itemToDelete) return;
    setDeleteItemLoading(true);
    setError('');
    try {
      await incomingStockService.deleteStockItem({
        name: itemToDelete.name,
        unit: itemToDelete.unit,
        vendor: itemToDelete.vendor
      });

      // Optimistic update
      setStock(prev => ({
        ...prev,
        items: (prev.items || []).filter(item => {
          const isMatch =
            item.name === itemToDelete.name &&
            (item.unit || '') === (itemToDelete.unit || '') &&
            (item.vendor || '') === (itemToDelete.vendor || '');
          return !isMatch;
        })
      }));

      setDeleteItemOpen(false);
      setItemToDelete(null);
    } catch (e) {
      console.error(e);
      setError('削除に失敗しました: ' + (e.message || String(e)));
    } finally {
      setDeleteItemLoading(false);
    }
  };

  // Delete PDF State
  const [deletePdfOpen, setDeletePdfOpen] = React.useState(false);
  const [pdfToDelete, setPdfToDelete] = React.useState(null); // { name, baseName }
  const [deletePdfLoading, setDeletePdfLoading] = React.useState(false);

  const handleDeletePdfClick = (file) => {
    const baseName = toBaseName(file.name);
    setPdfToDelete({ name: file.name, baseName });
    setDeletePdfOpen(true);
    setError('');
  };

  const handleExecuteDeletePdf = async () => {
    if (!pdfToDelete) return;
    setDeletePdfLoading(true);
    setError('');
    try {
      // 1. Delete PDF/JSON files
      await incomingDeliveryService.deleteDeliverySet(pdfToDelete.baseName);

      // 2. Delete applied marker (if exists)
      // We do this regardless of whether it was applied or not, just in case.
      await incomingStockService.deleteAppliedMarker(pdfToDelete.baseName);

      await reload();
      setDeletePdfOpen(false);
      setPdfToDelete(null);
    } catch (e) {
      console.error(e);
      setError('PDF削除に失敗しました: ' + (e.message || String(e)));
    } finally {
      setDeletePdfLoading(false);
    }
  };

  const handleExecuteClearAll = async () => {
    setClearAllLoading(true);
    setError('');
    try {
      await incomingStockService.clearStock();
      await reload();
      setClearAllOpen(false);
    } catch (e) {
      console.error(e);
      setError('消去に失敗しました: ' + (e.message || String(e)));
    } finally {
      setClearAllLoading(false);
    }
  };

  return (
    <div className="incoming-stock">
      <div className="incoming-stock__header">
        <h2 className="incoming-stock__title">入荷在庫（PDF反映）</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="secondary" onClick={() => setSearchParams({ view: 'incoming-deliveries' })}>
            📄 入荷PDFへ
          </Button>
          <Button variant="ghost" onClick={onBack}>← 戻る</Button>
        </div>
      </div>

      {error && (
        <Card className="incoming-stock__error">
          {error}
        </Card>
      )}

      <Card className="incoming-stock__card">
        <div className="incoming-stock__card-head">
          <h3 className="incoming-stock__section-title">入荷PDFから反映</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={reload} disabled={loading || !!applyLoading}>
              更新
            </Button>
            <Button variant="primary" onClick={applyAll} disabled={loading || !!applyLoading}>
              {applyLoading === 'all' ? '反映中…' : '未反映をすべて反映'}
            </Button>
            <Button
              variant="secondary"
              style={{ marginLeft: 'auto', color: '#d32f2f', borderColor: '#d32f2f' }}
              onClick={() => setClearAllOpen(true)}
              disabled={loading || !!applyLoading || !stock?.items?.length}
            >
              ⚠ 在庫を全消去
            </Button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '10px 0', opacity: 0.75 }}>読み込み中…</div>
        ) : deliveries.length === 0 ? (
          <div style={{ padding: '10px 0', opacity: 0.75 }}>保存された入荷PDFがありません（先に「入荷PDF」で保存してください）</div>
        ) : (
          <div className="incoming-stock__file-list">
            {deliveries.map((f) => {
              const baseName = toBaseName(f?.name);
              const isApplied = appliedSet.has(baseName);
              return (
                <div key={f.name} className="incoming-stock__file-row">
                  <div className="incoming-stock__file-info">
                    <div style={{ fontWeight: 700 }}>{baseName}</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                      更新: {formatDateTime(f.updated_at || f.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isApplied ? (
                      <span className="incoming-stock__badge">反映済み</span>
                    ) : (
                      <span className="incoming-stock__badge incoming-stock__badge--pending">未反映</span>
                    )}
                    <Button
                      variant={isApplied ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => applyOne(f.name)}
                      disabled={!!applyLoading || isApplied}
                    >
                      {applyLoading === baseName ? '反映中…' : (isApplied ? '反映済み' : '在庫に反映')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ color: '#d32f2f', marginLeft: '4px' }}
                      onClick={() => handleDeletePdfClick(f)}
                      disabled={!!applyLoading}
                      title="PDFと解析データを削除"
                    >
                      🗑
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && (
          <div style={{ marginTop: '10px', fontSize: '0.85rem', opacity: 0.75 }}>
            反映済み: <strong>{appliedSet.size}</strong> 件 / 保存済みPDF: <strong>{deliveries.length}</strong> 件
          </div>
        )}
      </Card>

      <Card className="incoming-stock__card">
        <div className="incoming-stock__card-head">
          <h3 className="incoming-stock__section-title">入荷在庫（別管理）</h3>
        </div>

        <div className="incoming-stock__tabs">
          <button
            className={`incoming-stock__tab-button ${activeTab === 'need_order' ? 'incoming-stock__tab-button--active' : ''}`}
            onClick={() => setActiveTab('need_order')}
          >
            ⚠ 要発注
            <span className="incoming-stock__tab-count">
              {(stock?.items || []).filter(i => (i.quantity || 0) <= 0).length}
            </span>
          </button>

          {Array.from(new Set((stock?.items || []).map(i => i.vendor || '（取引先なし）'))).sort().map(vendorName => (
            <button
              key={vendorName}
              className={`incoming-stock__tab-button ${activeTab === vendorName ? 'incoming-stock__tab-button--active' : ''}`}
              onClick={() => setActiveTab(vendorName)}
            >
              {vendorName}
            </button>
          ))}
        </div>

        {(() => {
          // Filter items based on activeTab
          let currentList = [];
          if (activeTab === 'need_order') {
            currentList = (stock?.items || []).filter(i => (i.quantity || 0) <= 0);
          } else {
            const targetVendor = activeTab === '（取引先なし）' ? '' : activeTab;
            currentList = (stock?.items || []).filter(i => (i.vendor || '') === targetVendor);
          }

          if (currentList.length === 0) {
            return (
              <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>
                {activeTab === 'need_order'
                  ? '現在、発注が必要な商品（在庫0）はありません。'
                  : 'この取引先の在庫はありません。'}
              </div>
            );
          }

          return (
            <div className="incoming-stock__table-wrap">
              <table className="incoming-stock__table">
                <thead>
                  <tr>
                    <th style={{ width: '50%' }}>材料/商品</th>
                    <th style={{ width: '20%', textAlign: 'right' }}>現在在庫</th>
                    <th style={{ width: '10%' }}>単位</th>
                    <th style={{ width: '20%', textAlign: 'center' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {currentList.map((it) => (
                    <tr key={`${it.vendor}@@${it.name}@@${it.unit || ''}`}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{it.name}</div>
                        {activeTab === 'need_order' && it.vendor && (
                          <div style={{ fontSize: '0.8rem', color: '#666' }}>{it.vendor}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: (it.quantity || 0) <= 0 ? '#ef4444' : 'inherit' }}>
                        {Number.isFinite(it.quantity) ? it.quantity : '-'}
                      </td>
                      <td>{it.unit || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <Button variant="secondary" size="sm" onClick={() => openConsumeModal(it)}>
                            使用/入庫
                          </Button>
                          <Button variant="ghost" size="sm" style={{ color: '#d32f2f' }} onClick={() => handleDeleteItemClick(it)}>
                            🗑
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Card>

      <Modal
        isOpen={consumeModalOpen}
        onClose={() => setConsumeModalOpen(false)}
        title="在庫を使用"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>対象商品</div>
            <div style={{ fontWeight: 'bold' }}>{consumeTarget?.name}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>現在の在庫</div>
            <div>{consumeTarget?.quantity} {consumeTarget?.unit}</div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>使用量</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Input
                type="text"
                inputMode="decimal"
                value={consumeAmount}
                onChange={(e) => setConsumeAmount(e.target.value)}
                readOnly
                placeholder="0"
                style={{ width: '100%', fontSize: '1.2rem', padding: '10px', textAlign: 'center', backgroundColor: '#f9f9f9', cursor: 'default' }}
              />
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{consumeTarget?.unit}</span>
            </div>

            <div className="incoming-stock__calc-grid">
              <button className="incoming-stock__calc-btn" onClick={() => addToConsumeAmount(0.1)}>+0.1</button>
              <button className="incoming-stock__calc-btn" onClick={() => addToConsumeAmount(0.5)}>+0.5</button>
              <button className="incoming-stock__calc-btn" onClick={() => addToConsumeAmount(1)}>+1</button>
              <button className="incoming-stock__calc-btn" onClick={() => addToConsumeAmount(5)}>+5</button>
              <button className="incoming-stock__calc-btn" onClick={() => addToConsumeAmount(10)}>+10</button>
              <button
                className="incoming-stock__calc-btn incoming-stock__calc-btn--clear"
                onClick={() => setConsumeAmount('')}
              >
                クリア
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="ghost" onClick={() => setConsumeModalOpen(false)} disabled={consumeLoading}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleConsume} disabled={consumeLoading || !consumeAmount}>
              {consumeLoading ? '処理中…' : '使用する'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Item Modal */}
      <Modal
        isOpen={deleteItemOpen}
        onClose={() => setDeleteItemOpen(false)}
        title="在庫の削除"
        size="small"
      >
        <div style={{ lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            「{itemToDelete?.name}」を在庫リストから削除しますか？<br />
            <span style={{ fontSize: '0.85rem', color: '#666' }}>※誤って追加された場合などに使用してください。</span>
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button variant="ghost" onClick={() => setDeleteItemOpen(false)} disabled={deleteItemLoading}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={handleExecuteDeleteItem} disabled={deleteItemLoading}>
              {deleteItemLoading ? '削除中…' : '削除する'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete PDF Modal */}
      <Modal
        isOpen={deletePdfOpen}
        onClose={() => setDeletePdfOpen(false)}
        title="PDFファイルの削除"
        size="small"
      >
        <div style={{ lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            「{pdfToDelete?.baseName}」を削除しますか？
          </p>
          <p style={{ fontSize: '0.9rem', color: '#333' }}>
            ファイルは削除されますが、<strong>これまでに在庫に加算された数量は取り消されません</strong>。<br />
            （必要であれば、在庫リストから個別に削除または数量調整してください）
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <Button variant="ghost" onClick={() => setDeletePdfOpen(false)} disabled={deletePdfLoading}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={handleExecuteDeletePdf} disabled={deletePdfLoading}>
              {deletePdfLoading ? '削除中…' : '削除する'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear All Modal */}
      <Modal
        isOpen={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        title="在庫の全消去"
        size="small"
      >
        <div style={{ lineHeight: 1.6 }}>
          <p style={{ marginTop: 0, fontWeight: 'bold', color: '#d32f2f' }}>
            現在の「入荷在庫」をすべて消去しますか？
          </p>
          <p style={{ fontSize: '0.9rem', color: '#333' }}>
            入荷PDFデータ自体は消えませんが、すべての在庫数がリセットされ、反映状態もクリアされます。<br />
            この操作は取り消せません。
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <Button variant="ghost" onClick={() => setClearAllOpen(false)} disabled={clearAllLoading}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={handleExecuteClearAll} disabled={clearAllLoading}>
              {clearAllLoading ? '消去中…' : '全て消去する'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

