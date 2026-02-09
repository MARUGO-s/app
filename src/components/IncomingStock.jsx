import React from 'react';
import { incomingDeliveryService } from '../services/incomingDeliveryService.js';
import { incomingStockService } from '../services/incomingStockService.js';
import { Button } from './Button';
import { Card } from './Card';
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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [deliveries, setDeliveries] = React.useState([]); // json file list
  const [appliedSet, setAppliedSet] = React.useState(new Set());
  const [stock, setStock] = React.useState({ items: [] });
  const [applyLoading, setApplyLoading] = React.useState(null); // null | 'all' | baseName

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

  return (
    <div className="incoming-stock">
      <div className="incoming-stock__header">
        <h2 className="incoming-stock__title">入荷在庫（PDF反映）</h2>
        <Button variant="ghost" onClick={onBack}>← 戻る</Button>
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

        {stock?.items?.length ? (
          <div className="incoming-stock__table-wrap">
            <table className="incoming-stock__table">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>材料/商品</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>数量</th>
                  <th style={{ width: '20%' }}>単位</th>
                </tr>
              </thead>
              <tbody>
                {stock.items.map((it) => (
                  <tr key={`${it.name}@@${it.unit || ''}`}>
                    <td>{it.name}</td>
                    <td style={{ textAlign: 'right' }}>{Number.isFinite(it.quantity) ? it.quantity : '-'}</td>
                    <td>{it.unit || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '10px 0', opacity: 0.75 }}>
            まだ入荷在庫はありません（上で「在庫に反映」してください）
          </div>
        )}
      </Card>
    </div>
  );
};

