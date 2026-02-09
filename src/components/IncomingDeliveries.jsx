import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '../supabase.js';
import { incomingDeliveryService } from '../services/incomingDeliveryService.js';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { parseDeliveryPdfFile } from '../utils/parseDeliveryPdf.js';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import './IncomingDeliveries.css';

const toBaseName = (fileName) => String(fileName || '').replace(/\.json$/i, '');

const truncateText = (value, max = 800) => {
  const s = String(value ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
};

const tryParseJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const extractServerErrorMessage = (body) => {
  const parsed = tryParseJson(body);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed?.error || parsed?.message || parsed?.msg || null;
};

const formatInvokeError = (err) => {
  if (!err) return '不明なエラーです';

  const status = err?.context?.status ?? err?.status ?? null;
  const body = err?.context?.body ?? null;
  const serverMessage = extractServerErrorMessage(body);
  const baseMessage = serverMessage || err?.message || String(err);

  const lines = [baseMessage];
  if (status != null) lines.push(`status: ${status}`);

  // If server didn't give a clear JSON { error }, show a small body snippet.
  if (!serverMessage && body) {
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
    const trimmed = String(bodyText || '').trim();
    if (trimmed && trimmed !== baseMessage) {
      lines.push(`body: ${truncateText(trimmed, 500)}`);
    }
  }

  const hints = [];
  if (status === 404 || /function not found/i.test(String(body || ''))) {
    hints.push('ローカルの場合: `supabase functions serve parse-delivery-pdf --env-file supabase/functions/.env` を実行してください');
  }

  if (/azure/i.test(String(baseMessage))) {
    hints.push('Azureの環境変数が未設定の可能性があります: `AZURE_DI_ENDPOINT` と `AZURE_DI_KEY`（または `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` / `AZURE_DOCUMENT_INTELLIGENCE_KEY`）を `supabase/functions/.env` に追加してください');
  }

  if (/google_api_key/i.test(String(baseMessage))) {
    hints.push('`GOOGLE_API_KEY` が未設定の可能性があります（Supabase Functionsの環境変数）');
  }

  if (hints.length) lines.push(hints.join('\n'));

  return lines.join('\n');
};

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

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('PDFの読み込みに失敗しました'));
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(file);
});

const stripDataUrlPrefix = (dataUrl) => {
  const s = String(dataUrl || '');
  const comma = s.indexOf(',');
  if (comma >= 0) return s.slice(comma + 1).trim();
  return s.trim();
};

const safeNumber = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value || '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const normalizeUnit = (value) => String(value || '').trim();

export const IncomingDeliveries = ({ onBack }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listLoading, setListLoading] = React.useState(true);
  const [files, setFiles] = React.useState([]);
  const [selectedPdf, setSelectedPdf] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [parsed, setParsed] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const [detailModal, setDetailModal] = React.useState(null); // { baseName, data }
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [deleteConfirm, setDeleteConfirm] = React.useState(null); // { baseName }
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const [aggregateLoading, setAggregateLoading] = React.useState(false);
  const [aggregate, setAggregate] = React.useState(null); // [{name, unit, qty}]

  const reloadList = React.useCallback(async () => {
    setListLoading(true);
    setError('');
    try {
      const list = await incomingDeliveryService.listJsonFiles();
      setFiles(list || []);
    } catch (e) {
      console.error(e);
      setError('入荷データの一覧取得に失敗しました');
      setFiles([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reloadList();
  }, [reloadList]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedPdf(file);
      setParsed(null);
      setAggregate(null);
      setError('');
    } else {
      // Optional: Show error for non-PDF
      // setError('PDFファイルのみアップロード可能です');
    }
  };

  const handleParsePdf = async () => {
    if (!selectedPdf) return;
    setError('');
    setParsing(true);
    setParsed(null);
    setAggregate(null);
    try {
      // Prefer local parsing (no external API). This avoids "終わらない" issues when
      // Edge Function / external AI APIs are unavailable.
      const localParsed = await parseDeliveryPdfFile(selectedPdf);
      setParsed(localParsed || null);
    } catch (e) {
      console.error(e);
      setError(`PDF解析に失敗しました:\n${e?.message || String(e)}`);
    } finally {
      setParsing(false);
    }
  };

  const handleSaveParsed = async () => {
    if (!selectedPdf || !parsed) return;
    setError('');
    setSaving(true);
    try {
      await incomingDeliveryService.saveDeliverySet({ pdfFile: selectedPdf, parsed });
      setSelectedPdf(null);
      setParsed(null);
      await reloadList();
    } catch (e) {
      console.error(e);
      setError(`保存に失敗しました: ${e?.message || String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (fileName) => {
    const baseName = toBaseName(fileName);
    setDetailLoading(true);
    setError('');
    try {
      const data = await incomingDeliveryService.downloadJson(fileName);
      setDetailModal({ baseName, data });
    } catch (e) {
      console.error(e);
      setError(`詳細の取得に失敗しました: ${e?.message || String(e)}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm?.baseName) return;
    setDeleteLoading(true);
    setError('');
    try {
      await incomingDeliveryService.deleteDeliverySet(deleteConfirm.baseName);
      setDeleteConfirm(null);
      await reloadList();
    } catch (e) {
      console.error(e);
      setError(`削除に失敗しました: ${e?.message || String(e)}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const buildAggregateFromData = (allData) => {
    const acc = new Map(); // key -> { name, unit, qty }
    const pushItem = (item) => {
      const name = String(item?.name || '').trim();
      if (!name) return;
      const unit = normalizeUnit(item?.deliveryUnit || item?.unit || item?.unitName || '');
      const qty = safeNumber(item?.deliveryQty ?? item?.quantity ?? item?.qty);
      if (!Number.isFinite(qty) || qty === null) return;
      const key = `${normalizeIngredientKey(name)}@@${unit || ''}`;
      const prev = acc.get(key);
      if (prev) {
        prev.qty += qty;
      } else {
        acc.set(key, { name, unit, qty });
      }
    };

    const slips = allData?.slips || allData?.receipts || [];
    slips.forEach((slip) => {
      const items = slip?.items || [];
      items.forEach(pushItem);
    });

    return Array.from(acc.values()).sort((a, b) => {
      if (a.name !== b.name) return a.name.localeCompare(b.name, 'ja');
      return String(a.unit || '').localeCompare(String(b.unit || ''), 'ja');
    });
  };

  const handleAggregateAll = async () => {
    setAggregateLoading(true);
    setError('');
    setAggregate(null);
    try {
      const list = await incomingDeliveryService.listJsonFiles();
      if (!list || list.length === 0) {
        setAggregate([]);
        return;
      }

      // Download sequentially to avoid overwhelming the browser/network.
      const all = [];
      for (const f of list) {
        const fileName = f?.name;
        if (!fileName) continue;
        try {
          const data = await incomingDeliveryService.downloadJson(fileName);
          all.push(data);
        } catch (e) {
          console.warn('Failed to download:', fileName, e);
        }
      }

      // Merge aggregates across files
      const merged = new Map();
      all.forEach((data) => {
        const rows = buildAggregateFromData(data);
        rows.forEach((row) => {
          const key = `${normalizeIngredientKey(row.name)}@@${row.unit || ''}`;
          const prev = merged.get(key);
          if (prev) prev.qty += row.qty;
          else merged.set(key, { ...row });
        });
      });

      const result = Array.from(merged.values()).sort((a, b) => {
        if (a.name !== b.name) return a.name.localeCompare(b.name, 'ja');
        return String(a.unit || '').localeCompare(String(b.unit || ''), 'ja');
      });

      setAggregate(result);
    } catch (e) {
      console.error(e);
      setError(`集計に失敗しました: ${e?.message || String(e)}`);
    } finally {
      setAggregateLoading(false);
    }
  };

  const slipsPreview = parsed?.slips || parsed?.receipts || [];

  return (
    <div className="incoming-deliveries">
      <div className="incoming-deliveries__header">
        <h2 className="incoming-deliveries__title">入荷PDF（在庫の積み上げ）</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button variant="secondary" onClick={() => setSearchParams({ view: 'incoming-stock' })}>
            📦 入荷在庫へ
          </Button>
          <Button variant="ghost" onClick={onBack}>← 戻る</Button>
        </div>
      </div>

      {error && (
        <Card className="incoming-deliveries__error">
          {error}
        </Card>
      )}

      <Card className="incoming-deliveries__card">
        <h3 className="incoming-deliveries__section-title">PDFを読み込む</h3>
        <div style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: '-4px', marginBottom: '10px' }}>
          接続先: {SUPABASE_URL}
        </div>
        <div className="incoming-deliveries__upload">
          <div
            className={`incoming-deliveries__upload-zone ${isDragging ? 'incoming-deliveries__upload-zone--dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div style={{ textAlign: 'center', marginBottom: '10px', fontWeight: 'bold', color: isDragging ? 'var(--color-primary)' : 'inherit' }}>
              {isDragging ? 'ここにドロップしてアップロード' : 'PDFファイルをここにドラッグ＆ドロップ'}
            </div>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setSelectedPdf(file);
                setParsed(null);
                setAggregate(null);
                setError('');
              }}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={handleParsePdf}
              disabled={!selectedPdf || parsing || saving}
            >
              {parsing ? '解析中…' : '解析する'}
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveParsed}
              disabled={!selectedPdf || !parsed || saving || parsing}
            >
              {saving ? '保存中…' : '保存する'}
            </Button>
          </div>
        </div>

        {parsed && (
          <div className="incoming-deliveries__preview">
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              出力日: <strong>{parsed?.report?.outputAt || parsed?.report?.outputDate || '-'}</strong>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.9rem', opacity: 0.9 }}>
              伝票数: <strong>{slipsPreview.length}</strong>
            </div>

            {slipsPreview.slice(0, 3).map((slip, idx) => (
              <div key={`${slip?.slipNo || slip?.id || idx}`} className="incoming-deliveries__slip">
                <div className="incoming-deliveries__slip-head">
                  <div style={{ fontWeight: 700 }}>
                    {slip?.vendor || '取引先不明'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    伝票No: {slip?.slipNo || '-'} / 納品日: {slip?.deliveryDate || '-'}
                  </div>
                </div>
                <table className="incoming-deliveries__table">
                  <thead>
                    <tr>
                      <th style={{ width: '52%' }}>商品名</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>単価</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>数量</th>
                      <th style={{ width: '16%' }}>単位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(slip?.items || []).slice(0, 6).map((it, i) => (
                      <tr key={`${it?.no || i}`}>
                        <td>{it?.name || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{it?.unitPrice != null ? `¥${Math.round(it.unitPrice).toLocaleString()}` : '-'}</td>
                        <td style={{ textAlign: 'right' }}>{it?.deliveryQty != null ? it.deliveryQty : '-'}</td>
                        <td>{it?.deliveryUnit || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(slip?.items || []).length > 6 && (
                  <div style={{ marginTop: '6px', fontSize: '0.85rem', opacity: 0.8 }}>
                    他 {Math.max(0, (slip?.items || []).length - 6)} 件…
                  </div>
                )}
              </div>
            ))}

            {slipsPreview.length > 3 && (
              <div style={{ marginTop: '10px', fontSize: '0.85rem', opacity: 0.85 }}>
                ※ プレビューでは最初の3伝票のみ表示しています（保存後に全件確認できます）
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="incoming-deliveries__card">
        <div className="incoming-deliveries__list-head">
          <h3 className="incoming-deliveries__section-title" style={{ margin: 0 }}>保存済みデータ</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button variant="secondary" onClick={reloadList} disabled={listLoading || aggregateLoading}>
              更新
            </Button>
            <Button variant="secondary" onClick={handleAggregateAll} disabled={listLoading || aggregateLoading}>
              {aggregateLoading ? '集計中…' : '全データを集計'}
            </Button>
          </div>
        </div>

        {listLoading ? (
          <div style={{ padding: '10px 0', opacity: 0.8 }}>読み込み中…</div>
        ) : files.length === 0 ? (
          <div style={{ padding: '10px 0', opacity: 0.8 }}>まだ保存された入荷PDFはありません</div>
        ) : (
          <div className="incoming-deliveries__file-list">
            {files.map((f) => (
              <div key={f.name} className="incoming-deliveries__file-row">
                <div className="incoming-deliveries__file-info">
                  <div style={{ fontWeight: 700 }}>{toBaseName(f.name)}</div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                    更新: {formatDateTime(f.updated_at || f.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="secondary" size="sm" onClick={() => openDetail(f.name)} disabled={detailLoading || deleteLoading}>
                    {detailLoading ? '読込中…' : '開く'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ baseName: toBaseName(f.name) })} disabled={deleteLoading}>
                    削除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {aggregate && (
          <div className="incoming-deliveries__aggregate">
            <h4 style={{ margin: '10px 0 6px' }}>入荷累計（全データ）</h4>
            {aggregate.length === 0 ? (
              <div style={{ opacity: 0.85 }}>集計対象がありません</div>
            ) : (
              <table className="incoming-deliveries__table">
                <thead>
                  <tr>
                    <th>材料/商品</th>
                    <th style={{ textAlign: 'right' }}>累計数量</th>
                    <th>単位</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregate.slice(0, 60).map((row) => (
                    <tr key={`${row.name}@@${row.unit || ''}`}>
                      <td>{row.name}</td>
                      <td style={{ textAlign: 'right' }}>{Number.isFinite(row.qty) ? row.qty : '-'}</td>
                      <td>{row.unit || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {aggregate.length > 60 && (
              <div style={{ marginTop: '8px', fontSize: '0.85rem', opacity: 0.8 }}>
                ※ 表示は先頭60件まで（必要なら絞り込み/ページングを追加します）
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        isOpen={!!detailModal}
        onClose={() => setDetailModal(null)}
        title="入荷PDF 詳細"
        size="large"
      >
        {detailModal?.data ? (
          <div>
            <div style={{ marginBottom: '10px', opacity: 0.85 }}>
              保存日時: {formatDateTime(detailModal.data?._meta?.savedAt)}
              {detailModal.data?._meta?.originalFileName ? ` / 元ファイル: ${detailModal.data._meta.originalFileName}` : ''}
            </div>
            {(detailModal.data?.slips || detailModal.data?.receipts || []).map((slip, idx) => (
              <div key={`${slip?.slipNo || idx}`} style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  {slip?.vendor || '取引先不明'}（伝票No: {slip?.slipNo || '-'} / 納品日: {slip?.deliveryDate || '-'}）
                </div>
                <table className="incoming-deliveries__table">
                  <thead>
                    <tr>
                      <th style={{ width: '52%' }}>商品名</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>単価</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>数量</th>
                      <th style={{ width: '16%' }}>単位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(slip?.items || []).map((it, i) => (
                      <tr key={`${it?.no || i}`}>
                        <td>{it?.name || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{it?.unitPrice != null ? `¥${Math.round(it.unitPrice).toLocaleString()}` : '-'}</td>
                        <td style={{ textAlign: 'right' }}>{it?.deliveryQty != null ? it.deliveryQty : '-'}</td>
                        <td>{it?.deliveryUnit || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.8 }}>読み込み中…</div>
        )}
      </Modal>

      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="削除確認"
        size="small"
      >
        <div style={{ lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            「{deleteConfirm?.baseName}」を削除します。よろしいですか？
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleteLoading}>
              {deleteLoading ? '削除中…' : '削除する'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
