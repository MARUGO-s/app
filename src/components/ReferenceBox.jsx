import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { useAuth } from '../contexts/useAuth';
import { referenceBoxService } from '../services/referenceBoxService';
import { userService } from '../services/userService';
import './ReferenceBox.css';

const MAX_FILES_PER_DOC = 10;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB each (before compression)
const PREVIEW_TEXT_LIMIT = 200_000;
const USER_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024; // 10MB per user (compressed total)
const getShareTargetStorageKey = (userId) => `reference_box_share_targets_${String(userId || '').trim()}`;
const getShareSelectionByFileStorageKey = (userId) => `reference_box_share_selection_by_file_${String(userId || '').trim()}`;

const isCompressionSupported = () => (
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
);

const uint8ToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToUint8 = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const streamToUint8Array = async (stream) => {
  const response = new Response(stream);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

const compressBytes = async (bytes) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return streamToUint8Array(stream);
};

const decompressBytes = async (bytes) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return streamToUint8Array(stream);
};

const formatBytes = (size) => {
  const num = Number(size || 0);
  if (!Number.isFinite(num) || num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
};

const toSafeBytes = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) && num > 0 ? num : 0;
};

const formatDateTime = (isoString) => {
  if (!isoString) return '-';
  try {
    return new Date(isoString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoString);
  }
};

const normalizeForSearch = (value) => (
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
);

const resolvePreviewKind = (mimeType, fileName) => {
  const type = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('text/')) return 'text';
  if (name.endsWith('.json') || name.endsWith('.csv') || name.endsWith('.md') || name.endsWith('.xml')) return 'text';
  return 'other';
};

export const ReferenceBox = ({ onBack }) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewKind, setPreviewKind] = useState('other');
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editCategoryValue, setEditCategoryValue] = useState('');
  const [shareTargets, setShareTargets] = useState([]);
  const [selectedShareTargetIds, setSelectedShareTargetIds] = useState([]);
  const [shareUserSearch, setShareUserSearch] = useState('');
  const [sharing, setSharing] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const hydratedShareSelectionKeyRef = useRef('');

  const loadDocuments = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const items = await referenceBoxService.getAll(user.id);
      setDocuments(items || []);
      setStatus({ type: '', message: '' });
    } catch (error) {
      console.error('資料箱の読み込みに失敗:', error);
      setStatus({ type: 'error', message: '資料の読み込みに失敗しました。' });
    } finally {
      const warnings = referenceBoxService.consumeWarnings();
      if (warnings.length > 0) {
        setStatus({ type: 'warning', message: warnings[warnings.length - 1] });
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadShareTargets = async () => {
      if (user?.role !== 'admin') {
        setShareTargets([]);
        setSelectedShareTargetIds([]);
        return;
      }
      try {
        const profiles = await userService.fetchAllProfiles();
        if (cancelled) return;
        const list = (profiles || []).filter((p) => String(p?.id || '') !== String(user?.id || ''));
        setShareTargets(list);
        try {
          const saved = JSON.parse(localStorage.getItem(getShareTargetStorageKey(user?.id)) || '[]');
          const validIds = new Set(list.map((p) => String(p?.id || '')));
          const restored = (Array.isArray(saved) ? saved : []).map((id) => String(id || '')).filter((id) => validIds.has(id));
          setSelectedShareTargetIds(restored);
        } catch {
          setSelectedShareTargetIds([]);
        }
      } catch (error) {
        console.error('共有先ユーザー一覧の取得に失敗:', error);
        if (!cancelled) setShareTargets([]);
      }
    };
    loadShareTargets();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin' || !user?.id) return;
    try {
      localStorage.setItem(getShareTargetStorageKey(user.id), JSON.stringify(selectedShareTargetIds));
    } catch {
      // ignore storage errors
    }
  }, [selectedShareTargetIds, user?.id, user?.role]);

  const fileEntries = useMemo(() => {
    const rows = [];
    for (const doc of documents || []) {
      for (const attachment of (doc.attachments || [])) {
        const entry = {
          key: `${doc.id}:${attachment.id}`,
          docId: String(doc.id),
          docTitle: doc.title || '',
          docBody: doc.body || '',
          docUpdatedAt: doc.updatedAt || '',
          attachment,
          fileName: attachment?.name || doc.title || '(無題ファイル)',
          updatedAt: attachment?.addedAt || doc.updatedAt || '',
        };
        rows.push(entry);
      }
    }
    rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return rows;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const q = normalizeForSearch(searchQuery);
    const selectedCategory = normalizeForSearch(categoryFilter);
    return fileEntries.filter((entry) => {
      const category = normalizeForSearch(entry?.attachment?.category || '');
      const matchesCategory = !selectedCategory || category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        normalizeForSearch(entry.fileName).includes(q)
        || normalizeForSearch(entry.docTitle).includes(q)
        || normalizeForSearch(entry.docBody).includes(q)
        || normalizeForSearch(entry?.attachment?.category).includes(q)
      );
    });
  }, [fileEntries, searchQuery, categoryFilter]);

  const availableCategories = useMemo(() => {
    const set = new Set();
    for (const entry of fileEntries) {
      const raw = String(entry?.attachment?.category || '').trim();
      if (raw) set.add(raw);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [fileEntries]);

  const totalUsedBytes = useMemo(
    () => fileEntries.reduce((sum, entry) => sum + toSafeBytes(entry?.attachment?.compressedSize), 0),
    [fileEntries]
  );
  const remainingBytes = Math.max(0, USER_STORAGE_LIMIT_BYTES - totalUsedBytes);
  const usagePercent = Math.min(100, Math.round((totalUsedBytes / USER_STORAGE_LIMIT_BYTES) * 100));

  const selectedEntry = useMemo(
    () => filteredDocuments.find((entry) => String(entry.key) === String(selectedKey)) || null,
    [filteredDocuments, selectedKey]
  );
  const filteredShareTargets = useMemo(() => {
    const q = normalizeForSearch(shareUserSearch);
    const base = (shareTargets || []).filter((profile) => {
      const label = String(profile?.display_id || profile?.email || profile?.id || '');
      if (!q) return true;
      return normalizeForSearch(label).includes(q);
    });
    return base.sort((a, b) => {
      const aLabel = String(a?.display_id || a?.email || a?.id || '');
      const bLabel = String(b?.display_id || b?.email || b?.id || '');
      return aLabel.localeCompare(bLabel, 'ja');
    });
  }, [shareTargets, shareUserSearch]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    const currentKey = String(selectedKey || '');
    if (!currentKey) {
      hydratedShareSelectionKeyRef.current = '';
      return;
    }
    if (hydratedShareSelectionKeyRef.current === currentKey) return;
    if (!selectedEntry?.attachment) return;
    const validTargetIds = new Set((shareTargets || []).map((p) => String(p?.id || '').trim()).filter(Boolean));
    let restoredIds = [];
    try {
      const key = getShareSelectionByFileStorageKey(user?.id);
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      const savedByFile = raw && typeof raw === 'object' ? raw : {};
      const fromLocal = Array.isArray(savedByFile[currentKey]) ? savedByFile[currentKey] : null;
      if (Array.isArray(fromLocal)) {
        restoredIds = fromLocal
          .map((id) => String(id || '').trim())
          .filter((id) => validTargetIds.has(id));
      }
    } catch {
      // ignore restore errors
    }

    if (restoredIds.length === 0) {
      restoredIds = (selectedEntry.attachment?.sharedToUserIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => validTargetIds.has(id));
    }
    setSelectedShareTargetIds(restoredIds);
    hydratedShareSelectionKeyRef.current = currentKey;
  }, [selectedEntry, selectedKey, shareTargets, user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin' || !user?.id) return;
    const currentKey = String(selectedKey || '').trim();
    if (!currentKey) return;
    try {
      const storageKey = getShareSelectionByFileStorageKey(user.id);
      const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const savedByFile = raw && typeof raw === 'object' ? raw : {};
      savedByFile[currentKey] = selectedShareTargetIds;
      localStorage.setItem(storageKey, JSON.stringify(savedByFile));
    } catch {
      // ignore storage errors
    }
  }, [selectedShareTargetIds, selectedKey, user?.id, user?.role]);

  useEffect(() => {
    if (!selectedEntry?.attachment) {
      setEditCategoryValue('');
      return;
    }
    setEditCategoryValue(String(selectedEntry.attachment?.category || ''));
  }, [selectedEntry?.key]);

  const toCompressedAttachment = async (file) => {
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const compressedBytes = await compressBytes(originalBytes);
    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      category: String(uploadCategory || '').trim(),
      originalSize: originalBytes.length,
      compressedSize: compressedBytes.length,
      encoding: 'gzip+base64',
      data: uint8ToBase64(compressedBytes),
      addedAt: new Date().toISOString(),
    };
  };

  const handleAddFiles = async (inputFiles) => {
    const files = Array.from(inputFiles || []);
    if (files.length === 0) return;
    if (!isCompressionSupported()) {
      setStatus({ type: 'error', message: 'このブラウザは圧縮保存に対応していません。' });
      return;
    }

    if (files.length > MAX_FILES_PER_DOC) {
      setStatus({ type: 'warning', message: `一度に追加できる件数は最大${MAX_FILES_PER_DOC}件です。` });
      return;
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setStatus({ type: 'warning', message: `「${file.name}」はサイズ上限(${formatBytes(MAX_FILE_SIZE_BYTES)})を超えています。` });
        return;
      }
    }

    setAttaching(true);
    setStatus({ type: 'info', message: 'ファイルを圧縮しています...' });
    try {
      const savedEntries = [];
      let nextUsedBytes = totalUsedBytes;
      for (const file of files) {
        // 圧縮/保存は順次実行してブラウザ負荷を抑える
        // eslint-disable-next-line no-await-in-loop
        const attachment = await toCompressedAttachment(file);
        const projected = nextUsedBytes + toSafeBytes(attachment.compressedSize);
        if (projected > USER_STORAGE_LIMIT_BYTES) {
          throw new Error(`容量上限(10MB)を超えるため「${file.name}」は保存できません。`);
        }
        // eslint-disable-next-line no-await-in-loop
        const savedDoc = await referenceBoxService.save(user.id, {
          title: file.name || '資料',
          body: '',
          attachments: [attachment],
        });
        savedEntries.push({
          key: `${savedDoc.id}:${attachment.id}`,
        });
        nextUsedBytes = projected;
      }
      await loadDocuments();
      if (savedEntries.length > 0) {
        setSelectedKey(savedEntries[0].key);
      }
      setStatus({ type: 'success', message: `${savedEntries.length}件のファイルを保存しました。` });
    } catch (error) {
      console.error('ファイル圧縮に失敗:', error);
      setStatus({ type: 'error', message: `ファイル保存に失敗しました: ${error?.message || 'unknown error'}` });
    } finally {
      setAttaching(false);
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    await handleAddFiles(event.dataTransfer?.files);
  };

  const handleDownloadAttachment = async (attachment) => {
    try {
      if (attachment?.encoding !== 'gzip+base64') {
        throw new Error('未対応の添付形式です');
      }
      const compressed = base64ToUint8(String(attachment.data || ''));
      const raw = await decompressBytes(compressed);
      const blob = new Blob([raw], { type: attachment.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name || 'download.bin';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('添付ファイルの展開に失敗:', error);
      setStatus({ type: 'error', message: '添付ファイルの展開に失敗しました。' });
    }
  };

  const handleDeleteSelectedFile = async () => {
    if (!user?.id || !selectedEntry) return;
    if (!window.confirm('このファイルを削除しますか？')) return;
    try {
      const targetDoc = documents.find((doc) => String(doc.id) === String(selectedEntry.docId));
      if (!targetDoc) return;

      const nextAttachments = (targetDoc.attachments || [])
        .filter((item) => String(item.id) !== String(selectedEntry.attachment.id));

      if (nextAttachments.length === 0) {
        await referenceBoxService.remove(user.id, targetDoc.id);
      } else {
        await referenceBoxService.save(user.id, {
          id: targetDoc.id,
          title: targetDoc.title || nextAttachments[0]?.name || '資料',
          body: targetDoc.body || '',
          attachments: nextAttachments,
        });
      }

      await loadDocuments();
      setSelectedKey('');
      setStatus({ type: 'success', message: '削除しました。' });
      const warnings = referenceBoxService.consumeWarnings();
      if (warnings.length > 0) {
        setStatus({ type: 'warning', message: warnings[warnings.length - 1] });
      }
    } catch (error) {
      console.error('資料の削除に失敗:', error);
      setStatus({ type: 'error', message: '削除に失敗しました。' });
    }
  };

  const toggleShareTarget = (targetId) => {
    const id = String(targetId || '').trim();
    if (!id) return;
    setSelectedShareTargetIds((prev) => (
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    ));
  };

  const handleShare = async ({ bulk, targetIdsOverride }) => {
    if (sharing || user?.role !== 'admin') return;
    const files = bulk ? filteredDocuments : (selectedEntry ? [selectedEntry] : []);
    const effectiveTargetIds = Array.isArray(targetIdsOverride) ? targetIdsOverride : selectedShareTargetIds;
    if (files.length === 0) {
      setStatus({ type: 'warning', message: '共有対象ファイルがありません。' });
      return;
    }
    if (effectiveTargetIds.length === 0) {
      setStatus({ type: 'warning', message: '共有先ユーザーを選択してください。' });
      return;
    }
    const message = bulk
      ? `表示中の${files.length}件を${effectiveTargetIds.length}ユーザーへ共有します。よろしいですか？`
      : `このファイルを${effectiveTargetIds.length}ユーザーへ共有します。よろしいですか？`;
    if (!window.confirm(message)) return;

    setSharing(true);
    setStatus({ type: 'info', message: '共有中...' });
    try {
      const result = await referenceBoxService.shareFilesToUsers({
        sourceUserId: user.id,
        targetUserIds: effectiveTargetIds,
        files,
      });

      // 共有済み情報を元ファイル側にも保存して、リロード後も判別できるようにする
      const nextDocsById = new Map((documents || []).map((doc) => [String(doc.id), { ...doc, attachments: [...(doc.attachments || [])] }]));
      const touchedDocIds = new Set();
      const nowIso = new Date().toISOString();
      for (const file of files) {
        const docId = String(file?.docId || '');
        const attId = String(file?.attachment?.id || '');
        const doc = nextDocsById.get(docId);
        if (!doc || !attId) continue;
        doc.attachments = (doc.attachments || []).map((att) => {
          if (String(att?.id || '') !== attId) return att;
          const existingSharedIds = Array.isArray(att?.sharedToUserIds) ? att.sharedToUserIds.map((id) => String(id)) : [];
          const mergedSharedIds = Array.from(new Set([...existingSharedIds, ...effectiveTargetIds]));
          return {
            ...att,
            sharedToUserIds: mergedSharedIds,
            lastSharedAt: nowIso,
          };
        });
        touchedDocIds.add(docId);
      }
      for (const docId of touchedDocIds) {
        const doc = nextDocsById.get(docId);
        if (!doc) continue;
        // eslint-disable-next-line no-await-in-loop
        await referenceBoxService.save(user.id, doc);
      }
      await loadDocuments();

      setStatus({
        type: 'success',
        message: `共有しました: ${result.insertedCount}件（ファイル${result.fileCount}件 × 共有先${result.targetCount}件）`,
      });
    } catch (error) {
      console.error('共有に失敗:', error);
      setStatus({ type: 'error', message: `共有に失敗しました: ${error?.message || 'unknown error'}` });
    } finally {
      setSharing(false);
    }
  };

  const handleBulkShareClick = async () => {
    const allTargetIds = (shareTargets || [])
      .map((profile) => String(profile?.id || '').trim())
      .filter(Boolean);
    if (allTargetIds.length === 0) {
      setStatus({ type: 'warning', message: '共有先ユーザーがいません。' });
      return;
    }
    setSelectedShareTargetIds(allTargetIds);
    await handleShare({ bulk: true, targetIdsOverride: allTargetIds });
  };

  const handleRefresh = async () => {
    if (
      user?.role === 'admin'
      && selectedEntry
      && selectedEntry?.docId
      && selectedEntry?.attachment?.id
    ) {
      try {
        const targetDoc = documents.find((doc) => String(doc.id) === String(selectedEntry.docId));
        if (targetDoc) {
          const currentIds = Array.isArray(selectedEntry.attachment?.sharedToUserIds)
            ? selectedEntry.attachment.sharedToUserIds.map((id) => String(id || '')).sort()
            : [];
          const nextIds = selectedShareTargetIds.map((id) => String(id || '')).sort();
          const changed = currentIds.length !== nextIds.length || currentIds.some((id, idx) => id !== nextIds[idx]);
          if (changed) {
            const nowIso = new Date().toISOString();
            const nextAttachments = (targetDoc.attachments || []).map((att) => {
              if (String(att?.id || '') !== String(selectedEntry.attachment.id)) return att;
              return {
                ...att,
                sharedToUserIds: nextIds,
                lastSharedAt: nowIso,
              };
            });
            await referenceBoxService.save(user.id, {
              id: targetDoc.id,
              title: targetDoc.title || selectedEntry.fileName || '資料',
              body: targetDoc.body || '',
              attachments: nextAttachments,
            });
          }
        }
      } catch (error) {
        console.error('共有設定の更新に失敗:', error);
        setStatus({ type: 'error', message: '共有設定の更新に失敗しました。' });
      }
    }
    await loadDocuments();
  };

  const handleSaveCategory = async () => {
    if (!selectedEntry?.docId || !selectedEntry?.attachment?.id || !user?.id) return;
    try {
      const targetDoc = documents.find((doc) => String(doc.id) === String(selectedEntry.docId));
      if (!targetDoc) return;
      const nextCategory = String(editCategoryValue || '').trim();
      const nextAttachments = (targetDoc.attachments || []).map((att) => {
        if (String(att?.id || '') !== String(selectedEntry.attachment.id)) return att;
        return {
          ...att,
          category: nextCategory,
        };
      });
      await referenceBoxService.save(user.id, {
        id: targetDoc.id,
        title: targetDoc.title || selectedEntry.fileName || '資料',
        body: targetDoc.body || '',
        attachments: nextAttachments,
      });
      await loadDocuments();
      setStatus({ type: 'success', message: 'カテゴリーを更新しました。' });
    } catch (error) {
      console.error('カテゴリー更新に失敗:', error);
      setStatus({ type: 'error', message: 'カテゴリー更新に失敗しました。' });
    }
  };

  useEffect(() => {
    let revokedUrl = '';
    let cancelled = false;
    const run = async () => {
      if (!selectedEntry?.attachment) {
        setPreviewUrl('');
        setPreviewText('');
        setPreviewKind('other');
        return;
      }
      setPreviewLoading(true);
      try {
        const att = selectedEntry.attachment;
        const compressed = base64ToUint8(String(att?.data || ''));
        const raw = await decompressBytes(compressed);
        if (cancelled) return;

        const mimeType = att?.type || 'application/octet-stream';
        const kind = resolvePreviewKind(mimeType, att?.name);
        setPreviewKind(kind);

        const blob = new Blob([raw], { type: mimeType });
        const url = URL.createObjectURL(blob);
        revokedUrl = url;
        setPreviewUrl(url);

        if (kind === 'text') {
          const text = await blob.text();
          if (cancelled) return;
          setPreviewText(text.slice(0, PREVIEW_TEXT_LIMIT));
        } else {
          setPreviewText('');
        }
      } catch (error) {
        console.error('プレビュー生成に失敗:', error);
        if (!cancelled) {
          setPreviewKind('other');
          setPreviewText('');
          setPreviewUrl('');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [selectedEntry?.key]);

  return (
    <div className="reference-box">
      <div className="reference-box__header">
        <div className="reference-box__header-main">
          <h2 className="section-title">資料箱</h2>
          <p className="reference-box__subtitle">ファイル資料を保管できます（圧縮保存 + プレビュー対応）。</p>
          <div className="reference-box__usage">
            <div className="reference-box__usage-head">
              <span>使用容量</span>
              <span>{formatBytes(totalUsedBytes)} / {formatBytes(USER_STORAGE_LIMIT_BYTES)} ({usagePercent}%)</span>
            </div>
            <div className="reference-box__usage-bar">
              <div
                className={`reference-box__usage-fill ${usagePercent >= 100 ? 'is-danger' : usagePercent >= 80 ? 'is-warn' : ''}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="reference-box__usage-note">残り: {formatBytes(remainingBytes)}</div>
          </div>
        </div>
        <div className="reference-box__actions">
          <Button variant="secondary" onClick={handleRefresh} isLoading={loading || attaching || sharing}>
            更新
          </Button>
          <Button variant="ghost" onClick={onBack}>← レシピ一覧に戻る</Button>
        </div>
      </div>

      {status.message && (
        <div className={`reference-box__status ${status.type || 'info'}`}>{status.message}</div>
      )}

      <div className="reference-box__content">
        <aside className="reference-box__sidebar">
          <input
            className="reference-box__search"
            placeholder="ファイル名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="reference-box__search"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ marginBottom: '10px' }}
          >
            <option value="">すべてのカテゴリー</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          {loading ? (
            <div className="reference-box__empty">読み込み中...</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="reference-box__empty">ファイルがありません</div>
          ) : (
            <div className="reference-box__list">
              {filteredDocuments.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`reference-box__item ${String(entry.key) === String(selectedKey) ? 'active' : ''}`}
                  onClick={() => setSelectedKey(entry.key)}
                >
                  <div className="reference-box__item-title">{entry.fileName || '(無題ファイル)'}</div>
                  {!!entry?.attachment?.category && (
                    <div className="reference-box__item-date">カテゴリー: {entry.attachment.category}</div>
                  )}
                  {!!(entry.attachment?.sharedToUserIds?.length) && (
                    <div className="reference-box__item-date">
                      共有済み: {entry.attachment.sharedToUserIds.length}ユーザー
                    </div>
                  )}
                  <div className="reference-box__item-date">
                    {formatBytes(entry.attachment?.originalSize)} → {formatBytes(entry.attachment?.compressedSize)}
                  </div>
                  <div className="reference-box__item-date">更新: {formatDateTime(entry.updatedAt)}</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="reference-box__editor">
          <div
            className={`reference-box__dropzone ${isDragOver ? 'is-drag-over' : ''}`}
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onDrop={handleDrop}
          >
            <div className="reference-box__dropzone-title">📎 ファイル添付（圧縮保存）</div>
            <div className="reference-box__dropzone-desc">
              ここへドラッグ＆ドロップ、またはファイル選択
            </div>
            <input
              type="file"
              multiple
              className="reference-box__file-input"
              disabled={attaching}
              onChange={(e) => {
                handleAddFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              type="text"
              className="reference-box__file-input"
              placeholder="カテゴリー（例: 仕込み / メニュー / 発注）"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              style={{ marginTop: '8px' }}
            />
            <select
              className="reference-box__category-select"
              value=""
              onChange={(e) => {
                if (e.target.value) setUploadCategory(e.target.value);
              }}
              style={{ marginTop: '8px' }}
            >
              <option value="">カテゴリ候補から選択...</option>
              {availableCategories.map((cat) => (
                <option key={`upload-${cat}`} value={cat}>{cat}</option>
              ))}
            </select>
            <div className="reference-box__dropzone-note">
              1ファイル上限: {formatBytes(MAX_FILE_SIZE_BYTES)} / 最大{MAX_FILES_PER_DOC}件
            </div>
            <div className="reference-box__dropzone-note">
              添付ファイルは圧縮保存されます。閲覧時は解凍してダウンロードします。
            </div>
            <div className="reference-box__dropzone-note">
              ユーザー容量上限: {formatBytes(USER_STORAGE_LIMIT_BYTES)}（圧縮後合計）
            </div>
          </div>

          {user?.role === 'admin' && (
            <div className="reference-box__share-inline-trigger">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsShareModalOpen(true)}
              >
                共有設定を開く
              </Button>
            </div>
          )}

          {!selectedEntry ? (
            <div className="reference-box__empty">左の一覧からファイルを選択するとプレビュー表示します。</div>
          ) : (
            <div className="reference-box__preview">
              <div className="reference-box__attachment-item">
                <div className="reference-box__attachment-main">
                  <div className="reference-box__attachment-name">{selectedEntry.fileName}</div>
                  {!!selectedEntry.attachment?.category && (
                    <div className="reference-box__attachment-meta">
                      カテゴリー: {selectedEntry.attachment.category}
                    </div>
                  )}
                  {!!(selectedEntry.attachment?.sharedToUserIds?.length) && (
                    <div className="reference-box__attachment-meta">
                      共有済み: {selectedEntry.attachment.sharedToUserIds.length}ユーザー
                      {selectedEntry.attachment?.lastSharedAt ? ` / 最終共有: ${formatDateTime(selectedEntry.attachment.lastSharedAt)}` : ''}
                    </div>
                  )}
                  <div className="reference-box__attachment-meta">
                    {formatBytes(selectedEntry.attachment.originalSize)} → {formatBytes(selectedEntry.attachment.compressedSize)}
                  </div>
                  <div className="reference-box__category-editor">
                    <input
                      type="text"
                      className="reference-box__category-input"
                      placeholder="カテゴリーを設定"
                      value={editCategoryValue}
                      onChange={(e) => setEditCategoryValue(e.target.value)}
                    />
                    <select
                      className="reference-box__category-select"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setEditCategoryValue(e.target.value);
                      }}
                    >
                      <option value="">カテゴリ候補から選択...</option>
                      {availableCategories.map((cat) => (
                        <option key={`edit-${cat}`} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <Button variant="secondary" size="sm" onClick={handleSaveCategory}>
                      カテゴリー保存
                    </Button>
                  </div>
                </div>
                <div className="reference-box__attachment-actions">
                  <Button variant="secondary" size="sm" onClick={() => handleDownloadAttachment(selectedEntry.attachment)}>
                    解凍してダウンロード
                  </Button>
                  {user?.role === 'admin' && (
                    <Button variant="secondary" size="sm" onClick={() => setIsShareModalOpen(true)} disabled={sharing}>
                      共有設定
                    </Button>
                  )}
                  <Button variant="danger" size="sm" onClick={handleDeleteSelectedFile}>
                    削除
                  </Button>
                </div>
              </div>

              <div className="reference-box__preview-pane">
                {previewLoading ? (
                  <div className="reference-box__empty">プレビュー生成中...</div>
                ) : previewKind === 'image' && previewUrl ? (
                  <img src={previewUrl} alt={selectedEntry.fileName} className="reference-box__preview-image" />
                ) : previewKind === 'pdf' && previewUrl ? (
                  <iframe title={selectedEntry.fileName} src={previewUrl} className="reference-box__preview-iframe" />
                ) : previewKind === 'audio' && previewUrl ? (
                  <audio controls src={previewUrl} style={{ width: '100%' }} />
                ) : previewKind === 'video' && previewUrl ? (
                  <video controls src={previewUrl} style={{ width: '100%', maxHeight: '420px' }} />
                ) : previewKind === 'text' ? (
                  <pre className="reference-box__preview-text">{previewText || '(空ファイル)'}</pre>
                ) : (
                  <div className="reference-box__empty">
                    この形式はプレビュー非対応です。<br />
                    「解凍してダウンロード」を使って確認してください。
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <Modal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title="共有設定（管理者）"
        size="large"
      >
        <div className="reference-box__share-panel">
          <div className="reference-box__share-summary">
            <div>
              対象ファイル: <strong>{selectedEntry?.fileName || '未選択'}</strong>
            </div>
            <div>
              選択中: <strong>{selectedShareTargetIds.length}</strong> / {shareTargets.length} ユーザー
            </div>
          </div>
          <div className="reference-box__share-note">共有先ユーザーを検索して選択できます。</div>
          <input
            className="reference-box__share-search"
            placeholder="共有先ユーザーを検索..."
            value={shareUserSearch}
            onChange={(e) => setShareUserSearch(e.target.value)}
          />
          <div className="reference-box__share-quick-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedShareTargetIds((filteredShareTargets || []).map((p) => String(p?.id || '')).filter(Boolean))}
              disabled={filteredShareTargets.length === 0 || sharing}
            >
              表示中を全選択
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedShareTargetIds([])}
              disabled={selectedShareTargetIds.length === 0 || sharing}
            >
              選択解除
            </Button>
          </div>
          <div className="reference-box__share-targets">
            {shareTargets.length === 0 ? (
              <div className="reference-box__empty" style={{ padding: '8px 0' }}>共有先ユーザーが見つかりません。</div>
            ) : filteredShareTargets.map((profile) => {
              const targetId = String(profile?.id || '');
              const checked = selectedShareTargetIds.includes(targetId);
              const label = String(profile?.display_id || profile?.email || targetId).trim();
              const subLabel = profile?.email && profile?.display_id ? String(profile.email) : '';
              return (
                <label key={targetId} className="reference-box__share-target">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleShareTarget(targetId)}
                  />
                  <span className="reference-box__share-target-main">{label}</span>
                  {subLabel ? <span className="reference-box__share-target-sub">{subLabel}</span> : null}
                </label>
              );
            })}
          </div>
          <div className="reference-box__share-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleShare({ bulk: false })}
              disabled={!selectedEntry || sharing}
            >
              このファイルを共有
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkShareClick}
              disabled={filteredDocuments.length === 0 || sharing}
            >
              一覧を一括共有
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
