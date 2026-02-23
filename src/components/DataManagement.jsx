import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { purchasePriceService } from '../services/purchasePriceService';
import { userService } from '../services/userService';
import { featureFlagService } from '../services/featureFlagService';
import { unitConversionService } from '../services/unitConversionService'; // Added import
import { useAuth } from '../contexts/useAuth';
import { IngredientMaster } from './IngredientMaster';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import CsvToMasterImporter from './CsvToMasterImporter';
import { Modal } from './Modal';
import { TrashBin } from './TrashBin';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AdminTargetDeleteModal } from './AdminTargetDeleteModal';
import { AdminCopyAllModal } from './AdminCopyAllModal';
import { supabase } from '../supabase';
import './DataManagement.css';

const toMonthKey = (dateStr) => {
    const s = String(dateStr || '');
    if (!s) return '';
    // Input is usually "YYYY/MM/DD" in this app; store month as "YYYY-MM" for <select>.
    return s.slice(0, 7).replace('/', '-');
};

export const DataManagement = ({ onBack }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('price'); // 'price' | 'ingredients' | 'csv-import' | 'duplicates' | 'trash'

    // 一括コピー用ステート
    const [adminCopyAllOpen, setAdminCopyAllOpen] = useState(false);
    const [adminCopyAllLoading, setAdminCopyAllLoading] = useState(false);
    const [adminCopyAllStatus, setAdminCopyAllStatus] = useState(null);
    const [adminCopyAllResult, setAdminCopyAllResult] = useState(null);

    // 一括削除（ゴミ箱移動）用の状態
    const [bulkDeletePriceModal, setBulkDeletePriceModal] = useState(false);
    const [bulkDeletePriceLoading, setBulkDeletePriceLoading] = useState(false);
    const [bulkDeletePriceProgress, setBulkDeletePriceProgress] = useState({ total: 0, done: 0, current: '' });
    const [bulkDeletePriceResult, setBulkDeletePriceResult] = useState(null);
    // 管理者専用: 通常ユーザーの価格データ全件クリア
    const [adminClearModal, setAdminClearModal] = useState(false);
    const [adminClearLoading, setAdminClearLoading] = useState(false);
    const [adminClearProgress, setAdminClearProgress] = useState({ total: 0, done: 0, current: '' });
    const [adminClearResult, setAdminClearResult] = useState(null);
    // 管理者専用: 特定ユーザーの価格データクリア
    const [adminTargetClearModal, setAdminTargetClearModal] = useState(false);
    const [adminTargetClearLoading, setAdminTargetClearLoading] = useState(false);
    const [adminTargetClearResult, setAdminTargetClearResult] = useState(null);
    // 管理者専用: 通常ユーザーの材料マスター全件クリア
    const [adminClearMasterModal, setAdminClearMasterModal] = useState(false);
    const [adminClearMasterLoading, setAdminClearMasterLoading] = useState(false);
    const [adminClearMasterResult, setAdminClearMasterResult] = useState(null);

    const [file, setFile] = useState(null);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isUploading, setIsUploading] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

    // Recipe backup import (avoid browser confirm/alert)
    const [backupStatus, setBackupStatus] = useState({ type: '', message: '' });
    const [backupImportFile, setBackupImportFile] = useState(null);
    const [backupImportModalOpen, setBackupImportModalOpen] = useState(false);
    const [backupImportInProgress, setBackupImportInProgress] = useState(false);

    // Copy price data to another account (one-time copy, no sync)
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [copyProfiles, setCopyProfiles] = useState([]);
    const [copyProfilesLoading, setCopyProfilesLoading] = useState(false);
    const [copyProfilesError, setCopyProfilesError] = useState('');
    const [copyTargetId, setCopyTargetId] = useState('');
    const [copyInProgress, setCopyInProgress] = useState(false);
    const [copyProgress, setCopyProgress] = useState({ total: 0, done: 0, current: '' });
    const [copyResult, setCopyResult] = useState(null); // { type, message, failed?: [] }
    const [copyConfirming, setCopyConfirming] = useState(false);
    const [voiceFlagLoading, setVoiceFlagLoading] = useState(false);
    const [voiceFlagSaving, setVoiceFlagSaving] = useState(false);
    const [voiceFlagEnabled, setVoiceFlagEnabled] = useState(false);
    const [voiceFlagStatus, setVoiceFlagStatus] = useState({ type: '', message: '' });

    // Duplicate/History tab state
    const [dupLoading, setDupLoading] = useState(false);
    const [dupHistoryMap, setDupHistoryMap] = useState(new Map()); // key -> entry[]
    const [dupItems, setDupItems] = useState([]); // summarized list
    const [dupSelectedKey, setDupSelectedKey] = useState('');
    const [dupSearch, setDupSearch] = useState('');
    const [dupMonth, setDupMonth] = useState(''); // YYYY-MM (empty = all)

    const dupAvailableMonths = React.useMemo(() => {
        if (!dupSelectedKey) return [];
        const rows = dupHistoryMap.get(dupSelectedKey) || [];
        const set = new Set();
        rows.forEach((r) => {
            const m = toMonthKey(r?.dateStr);
            if (m) set.add(m);
        });
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [dupHistoryMap, dupSelectedKey]);

    useEffect(() => {
        // If the selected key changes and the current month doesn't exist for it, reset to all.
        if (!dupMonth) return;
        if (!dupSelectedKey) {
            setDupMonth('');
            return;
        }
        if (dupAvailableMonths.length > 0 && !dupAvailableMonths.includes(dupMonth)) {
            setDupMonth('');
        }
    }, [dupAvailableMonths, dupMonth, dupSelectedKey]);

    // Sort & Search State
    const [sortConfig, setSortConfig] = useState({ key: 'dateStr', direction: 'desc' });
    const [searchQuery, setSearchQuery] = useState('');

    // Allow deep-linking: ?view=data&tab=csv-import
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'price' || tab === 'ingredients' || tab === 'csv-import' || tab === 'duplicates') {
            setActiveTab(tab);
        }
        // Only apply on mount; internal tab buttons control subsequent changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedData = React.useMemo(() => {
        let data = [...previewData];

        // Filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase().trim();
            data = data.filter(item =>
                (item.name && item.name.toLowerCase().includes(query)) ||
                (item.vendor && item.vendor.toLowerCase().includes(query)) ||
                (item.dateStr && item.dateStr.includes(query))
            );
        }

        // Sort
        if (sortConfig.key) {
            data.sort((a, b) => {
                let aVal = a[sortConfig.key] || '';
                let bVal = b[sortConfig.key] || '';

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return data;
    }, [previewData, sortConfig, searchQuery]);

    const [uploadedFiles, setUploadedFiles] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadVoiceFlag = async () => {
            if (activeTab !== 'price') return;
            if (user?.role !== 'admin') {
                if (isMounted) {
                    setVoiceFlagLoading(false);
                    setVoiceFlagEnabled(false);
                }
                return;
            }

            setVoiceFlagLoading(true);
            try {
                const enabled = await featureFlagService.getVoiceInputEnabled({ force: true });
                if (!isMounted) return;
                setVoiceFlagEnabled(enabled);
                setVoiceFlagStatus({ type: '', message: '' });
            } catch (error) {
                console.error('Failed to load voice feature flag:', error);
                if (!isMounted) return;
                setVoiceFlagStatus({ type: 'error', message: '音声入力設定の取得に失敗しました。' });
            } finally {
                if (isMounted) setVoiceFlagLoading(false);
            }
        };

        loadVoiceFlag();
        return () => {
            isMounted = false;
        };
    }, [activeTab, user?.id, user?.role]);

    const handleToggleVoiceInput = async (nextEnabled) => {
        if (user?.role !== 'admin' || voiceFlagSaving) return;

        setVoiceFlagSaving(true);
        setVoiceFlagStatus({ type: 'info', message: '保存中...' });
        try {
            const saved = await featureFlagService.setVoiceInputEnabled(nextEnabled);
            setVoiceFlagEnabled(saved);
            setVoiceFlagStatus({
                type: 'success',
                message: '音声入力を' + (saved ? '有効化' : '無効化') + 'しました。'
            });
        } catch (error) {
            console.error('Failed to save voice feature flag:', error);
            setVoiceFlagStatus({ type: 'error', message: '音声入力設定の保存に失敗しました。' });
        } finally {
            setVoiceFlagSaving(false);
        }
    };

    const loadDuplicates = async () => {
        setDupLoading(true);
        try {
            const history = await purchasePriceService.fetchPriceHistory();
            const map = history || new Map();
            setDupHistoryMap(map);

            const list = [];
            for (const [key, rows] of map.entries()) {
                const seen = new Set();
                const unique = [];
                (rows || []).forEach((r) => {
                    const id = [
                        String(r?.dateStr || ''),
                        String(r?.price ?? ''),
                        String(r?.incomingQty ?? ''),
                        String(r?.unit || ''),
                        String(r?.vendor || ''),
                        String(r?.displayName || ''),
                    ].join('|');
                    if (seen.has(id)) return;
                    seen.add(id);
                    unique.push(r);
                });

                if (unique.length < 2) continue;
                unique.sort((a, b) => String(a?.dateStr || '').localeCompare(String(b?.dateStr || '')));

                const last = unique[unique.length - 1] || {};
                const prices = unique.map(r => Number(r?.price)).filter(n => Number.isFinite(n));
                const minPrice = prices.length ? Math.min(...prices) : null;
                const maxPrice = prices.length ? Math.max(...prices) : null;

                const dateCount = new Set(unique.map(r => String(r?.dateStr || ''))).size;
                const nameVariantCount = new Set(unique.map(r => String(r?.displayName || ''))).size;

                let changeCount = 0;
                for (let i = 1; i < unique.length; i++) {
                    const prev = Number(unique[i - 1]?.price);
                    const cur = Number(unique[i]?.price);
                    if (Number.isFinite(prev) && Number.isFinite(cur) && prev !== cur) changeCount++;
                }

                list.push({
                    key,
                    name: last?.displayName || key,
                    lastDate: last?.dateStr || '',
                    lastPrice: Number.isFinite(Number(last?.price)) ? Number(last?.price) : null,
                    lastIncomingQty: Number.isFinite(Number(last?.incomingQty)) ? Number(last?.incomingQty) : null,
                    unit: last?.unit || '',
                    vendor: last?.vendor || '',
                    rows: unique.length,
                    dates: dateCount,
                    nameVariants: nameVariantCount,
                    minPrice,
                    maxPrice,
                    changes: changeCount,
                });
            }

            list.sort((a, b) => {
                const ad = String(a?.lastDate || '');
                const bd = String(b?.lastDate || '');
                if (ad !== bd) return bd.localeCompare(ad);
                if ((b?.changes || 0) !== (a?.changes || 0)) return (b?.changes || 0) - (a?.changes || 0);
                if ((b?.rows || 0) !== (a?.rows || 0)) return (b?.rows || 0) - (a?.rows || 0);
                return String(a?.name || '').localeCompare(String(b?.name || ''), 'ja');
            });

            setDupItems(list);
            // Keep selection only if still present
            if (dupSelectedKey && !map.has(dupSelectedKey)) setDupSelectedKey('');
        } catch (e) {
            console.error(e);
        } finally {
            setDupLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab !== 'duplicates') return;
        loadDuplicates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const loadData = async () => {
        setIsLoadingData(true);
        try {
            // Load merged data
            const data = await purchasePriceService.getPriceListArray();
            setPreviewData(data);

            // Load file list
            const files = await purchasePriceService.getFileList();
            setUploadedFiles(files);
        } catch (error) {
            console.error("Failed to load price data", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStatus({ type: '', message: '' });
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsUploading(true);
        setStatus({ type: 'info', message: 'アップロード中...' });

        const result = await purchasePriceService.uploadPriceList(file);

        if (result.success) {
            setStatus({ type: 'success', message: 'アップロード完了。レシピ原価を再計算しています...' });

            // Trigger automatic cost update
            try {
                // Dynamic import to avoid circular dependency if any (safety)
                const { recipeService } = await import('../services/recipeService');
                const priceMap = await purchasePriceService.fetchPriceList(); // Fetch latest merged data

                const updatedCount = await recipeService.updateRecipeCosts(priceMap);

                setStatus({ type: 'success', message: `アップロード完了。${updatedCount} 件のレシピ原価を更新しました。` });
            } catch (e) {
                console.error("Cost update failed", e);
                setStatus({ type: 'warning', message: 'アップロードは完了しましたが、原価の自動更新に失敗しました。' });
            }

            setFile(null);
            // Clear file input
            const fileInput = document.getElementById('csv-upload-input');
            if (fileInput) fileInput.value = '';
            loadData(); // Reload table and file list
        } else {
            setStatus({ type: 'error', message: `エラー: ${result.error.message} ` });
        }
        setIsUploading(false);
    };

    const handleDeleteFile = (fileName) => {
        setConfirmModal({
            message: `「${fileName}」を本当に削除しますか？\nこの操作は取り消せません。`,
            onConfirm: async () => {
                setIsUploading(true);
                const result = await purchasePriceService.deletePriceFile(fileName);
                setIsUploading(false);

                if (result.success) {
                    setStatus({ type: 'success', message: 'ファイルを削除しました。' });
                    loadData();
                } else {
                    setStatus({ type: 'error', message: `削除エラー: ${result.error.message} ` });
                }
            }
        });
    };

    const openBackupImportModal = (file) => {
        if (!file) return;
        setBackupImportFile(file);
        setBackupImportModalOpen(true);
        setBackupStatus({ type: '', message: '' });
    };

    const closeBackupImportModal = () => {
        if (backupImportInProgress) return;
        setBackupImportModalOpen(false);
        setBackupImportFile(null);
        const el = document.getElementById('backup-upload-input');
        if (el) el.value = '';
    };

    const startBackupImport = async () => {
        const file = backupImportFile;
        if (!file || backupImportInProgress) return;

        setBackupImportInProgress(true);
        setBackupStatus({ type: 'info', message: '読み込み中...' });
        try {
            const text = await file.text();
            const json = JSON.parse(text);

            const { recipeService } = await import('../services/recipeService');
            const result = await recipeService.importRecipes(json);

            const okCount = Number(result?.count || 0);
            const errCount = Array.isArray(result?.errors) ? result.errors.length : 0;
            setBackupStatus({
                type: errCount > 0 ? 'warning' : 'success',
                message: `復元しました: ${okCount}件${errCount > 0 ? ` / 失敗: ${errCount}件` : ''} `
            });
            setBackupImportModalOpen(false);
            setBackupImportFile(null);
        } catch (err) {
            console.error(err);
            setBackupStatus({ type: 'error', message: '復元に失敗しました。ファイル形式を確認してください。' });
        } finally {
            setBackupImportInProgress(false);
            const el = document.getElementById('backup-upload-input');
            if (el) el.value = '';
        }
    };

    // 一括削除（ゴミ箱移動）ハンドラ
    const handleBulkMoveToTrash = async () => {
        setBulkDeletePriceLoading(true);
        setBulkDeletePriceProgress({ total: 0, done: 0, current: '' });
        setBulkDeletePriceResult(null);
        try {
            const result = await purchasePriceService.moveAllToTrash((p) => {
                setBulkDeletePriceProgress(p);
            });
            setBulkDeletePriceResult({ type: 'success', message: `ゴミ箱へ移動完了: ${result.moved} 件` });
            // ファイル一覧を更新
            const files = await purchasePriceService.getFileList();
            setUploadedFiles(files);
        } catch (e) {
            console.error(e);
            setBulkDeletePriceResult({ type: 'error', message: 'ゴミ箱への移動に失敗しました: ' + (e?.message || String(e)) });
        } finally {
            setBulkDeletePriceLoading(false);
        }
    };

    // 管理者専用: 通常ユーザーの価格データCSVを全件削除するハンドラ
    const handleAdminClearNonAdminCsvs = async () => {
        setAdminClearLoading(true);
        setAdminClearProgress({ total: 0, done: 0, current: '' });
        setAdminClearResult(null);
        try {
            const result = await purchasePriceService.adminClearAllNonAdminCsvs((p) => {
                setAdminClearProgress(p);
            });
            const msg = `完了: ${result.totalDeleted} ファイル削除（${result.results.length} ユーザー処理）` +
                (result.failedUsers.length > 0 ? ` / ${result.failedUsers.length} 件エラー` : '');
            setAdminClearResult({ type: result.failedUsers.length > 0 ? 'error' : 'success', message: msg, details: result });
            // ファイル一覧を更新
            const files = await purchasePriceService.getFileList();
            setUploadedFiles(files);
        } catch (e) {
            console.error(e);
            setAdminClearResult({ type: 'error', message: '処理に失敗しました: ' + (e?.message || String(e)) });
        } finally {
            setAdminClearLoading(false);
        }
    };

    // 管理者専用: 特定ユーザーの価格データCSVを削除するハンドラ // New handler
    const handleAdminTargetClearCsvs = async (targetUserId) => {
        setAdminTargetClearLoading(true);
        setAdminTargetClearResult(null);
        try {
            const result = await purchasePriceService.adminClearTargetUserCsvs(targetUserId, (p) => {
                // Here we could use a progress state if we wanted, but since it's just one user's files, it's usually fast.
            });
            setAdminTargetClearResult({ type: 'success', message: `${result.deleted} ファイルの削除が完了しました` });
            // 自ビューの表示ファイルが変わる可能性は低いが、念のため更新
            const files = await purchasePriceService.getFileList();
            setUploadedFiles(files);
        } catch (e) {
            console.error(e);
            setAdminTargetClearResult({ type: 'error', message: '処理に失敗しました: ' + (e?.message || String(e)) });
        } finally {
            setAdminTargetClearLoading(false);
            setAdminTargetClearModal(false);
        }
    };

    // 管理者専用: 通常ユーザーの材料マスター（unit_conversions, csv_unit_overrides）を全件削除
    const handleAdminClearNonAdminIngredientMaster = async () => {
        setAdminClearMasterLoading(true);
        setAdminClearMasterResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('admin-clear-non-admin-ingredient-master', { body: {} });
            if (error) throw error;
            if (data?.success) {
                const uc = data.deletedUnitConversions ?? 0;
                const cuo = data.deletedCsvOverrides ?? 0;
                setAdminClearMasterResult({ type: 'success', message: `削除完了: 単位変換 ${uc} 件 / CSV単位上書き ${cuo} 件` });
            } else {
                throw new Error(data?.error || '削除に失敗しました');
            }
        } catch (e) {
            console.error(e);
            setAdminClearMasterResult({ type: 'error', message: '処理に失敗しました: ' + (e?.message || String(e)) });
        } finally {
            setAdminClearMasterLoading(false);
        }
    };

    const openCopyModal = async () => {
        setCopyModalOpen(true);
        setCopyResult(null);
        setCopyProgress({ total: 0, done: 0, current: '' });
        setCopyTargetId('');
        setCopyProfilesError('');
        setCopyConfirming(false);

        // Fetch user list (admin-only). If it fails, show a message in the modal.
        setCopyProfilesLoading(true);
        try {
            const profiles = await userService.fetchAllProfiles();
            setCopyProfiles(profiles || []);
        } catch (e) {
            console.error(e);
            setCopyProfiles([]);
            setCopyProfilesError('ユーザー一覧の取得に失敗しました（管理者権限が必要です）。');
        } finally {
            setCopyProfilesLoading(false);
        }
    };

    const closeCopyModal = () => {
        if (copyInProgress) return;
        setCopyConfirming(false);
        setCopyModalOpen(false);
    };

    const startCopyToAccount = async () => {
        if (!copyTargetId || copyInProgress) return;

        setCopyInProgress(true);
        setCopyResult({ type: 'info', message: 'コピーを開始しています...' });
        setCopyProgress({ total: 0, done: 0, current: '' });

        try {
            const res = await purchasePriceService.copyPriceFilesToUser({
                targetUserId: copyTargetId,
                onProgress: ({ total, done, current }) => {
                    setCopyProgress({ total: total || 0, done: done || 0, current: current || '' });
                }
            });

            const copied = res?.copied?.length ?? 0;
            const failed = res?.failed?.length ?? 0;

            setCopyResult({
                type: failed > 0 ? 'error' : 'success',
                message: `コピー完了: ${copied}件${failed > 0 ? ` / 失敗: ${failed}件` : ''} `,
                failed: res?.failed || []
            });
            // ユーザーによって「閉じる」ボタンが明示的に押されるまでモーダルを維持します
        } catch (e) {
            console.error(e);
            setCopyResult({ type: 'error', message: `コピーに失敗しました: ${String(e?.message || e)} ` });
        } finally {
            setCopyInProgress(false);
        }
    };

    const handleAdminCopyAll = async () => {
        setAdminCopyAllLoading(true);
        setAdminCopyAllResult(null);
        setAdminCopyAllStatus({ phase: 'start', message: '一斉コピーの準備中...' });

        try {
            // 1. 各ユーザーへのファイルコピーループ
            const csvRes = await purchasePriceService.adminCopyCsvsToAllUsers((statusInfo) => {
                setAdminCopyAllStatus(prev => ({ ...prev, ...statusInfo }));
            });

            // 2. マスターデータの一括コピー（RPC）
            setAdminCopyAllStatus({
                phase: 'progress_master',
                message: '材料マスターデータを全ユーザーへ配信中...'
            });
            await unitConversionService.adminCopyMasterToAllUsers();

            // 3. 完了処理
            setAdminCopyAllStatus({ phase: 'done', message: '全ての処理が完了しました' });
            setAdminCopyAllResult({
                totalTargetUsers: csvRes.totalTargetUsers,
                csvResults: csvRes.results,
                masterSuccess: true
            });

        } catch (err) {
            console.error(err);
            setAdminCopyAllStatus({
                phase: 'error',
                message: `エラーが発生しました: ${err.message}`
            });
        } finally {
            setAdminCopyAllLoading(false);
        }
    };

    return (
        <div
            className={[
                'dashboard-container',
                'fade-in',
                (activeTab === 'ingredients' || activeTab === 'csv-import') ? 'dashboard-container--auto-height' : '',
            ].filter(Boolean).join(' ')}
        >
            {/* Header */}
            <div className="dashboard-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 className="section-title" style={{ margin: 0, fontSize: '1.5rem' }}>データ管理</h2>
                    {user?.role === 'admin' && (
                        <span style={{ fontSize: '0.85rem', color: '#666', background: '#eee', padding: '2px 8px', borderRadius: '12px' }}>
                            Admin Mode
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {activeTab === 'csv-import' && (
                        <Button
                            variant="secondary"
                            onClick={() => setSearchParams({ view: 'inventory' })}
                            title="在庫管理へ"
                        >
                            📦 在庫管理へ
                        </Button>
                    )}
                    <Button variant="ghost" onClick={onBack}>
                        ← レシピ一覧に戻る
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container">
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'price' ? 'active' : ''} `}
                        onClick={() => setActiveTab('price')}
                    >
                        💰 価格データ
                    </button>
                    <button
                        className={`tab ${activeTab === 'ingredients' ? 'active' : ''} `}
                        onClick={() => setActiveTab('ingredients')}
                    >
                        📦 材料マスター
                    </button>
                    <button
                        className={`tab ${activeTab === 'csv-import' ? 'active' : ''} `}
                        onClick={() => setActiveTab('csv-import')}
                    >
                        📥 CSV取込
                    </button>
                    <button
                        className={`tab ${activeTab === 'duplicates' ? 'active' : ''} `}
                        onClick={() => setActiveTab('duplicates')}
                    >
                        🔁 重複アイテム
                    </button>
                    <button
                        className={`tab ${activeTab === 'trash' ? 'active' : ''} `}
                        onClick={() => setActiveTab('trash')}
                    >
                        🗑️ ゴミ箱
                    </button>
                </div>
            </div>

            {user?.role === 'admin' && activeTab === 'price' && (
                <div className="voice-feature-card">
                    <div className="voice-feature-card__left">
                        <div className="voice-feature-card__title">🎤 音声入力（Avalon API）</div>
                        <div className="voice-feature-card__desc">
                            全アカウントの音声入力機能を一括でON/OFFします。
                        </div>
                    </div>
                    <div className="voice-feature-card__right">
                        <label className={`voice-feature-switch ${voiceFlagEnabled ? 'is-on' : ''}`}>
                            <input
                                type="checkbox"
                                checked={voiceFlagEnabled}
                                onChange={(e) => handleToggleVoiceInput(e.target.checked)}
                                disabled={voiceFlagLoading || voiceFlagSaving}
                            />
                            <span className="voice-feature-switch__slider" />
                        </label>
                        <div className="voice-feature-card__state">
                            {voiceFlagLoading
                                ? '読み込み中...'
                                : voiceFlagEnabled
                                    ? '現在: 有効'
                                    : '現在: 無効'}
                        </div>
                    </div>
                    {voiceFlagStatus.message && (
                        <div className={`status-msg ${voiceFlagStatus.type || 'info'} `} style={{ marginTop: '10px', width: '100%' }}>
                            {voiceFlagStatus.message}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'ingredients' ? (
                <IngredientMaster />
            ) : activeTab === 'csv-import' ? (
                <CsvToMasterImporter />
            ) : activeTab === 'trash' ? (
                <TrashBin />
            ) : activeTab === 'duplicates' ? (
                <div className="dashboard-content">
                    <aside className="dashboard-sidebar">
                        <div className="sidebar-card" style={{ flex: 1, minWidth: 0 }}>
                            <div className="sidebar-title">
                                <span>🔁</span> 重複アイテム一覧
                                <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal', marginLeft: 'auto' }}>
                                    {dupItems.length.toLocaleString()}件
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <Input
                                    placeholder="材料名で検索..."
                                    value={dupSearch}
                                    onChange={(e) => setDupSearch(e.target.value)}
                                    style={{ flex: 1, fontSize: '0.9rem' }}
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={loadDuplicates}
                                    disabled={dupLoading}
                                    title="更新"
                                >
                                    ↻
                                </Button>
                            </div>

                            <div className="dup-list">
                                {dupLoading ? (
                                    <div className="dup-empty">読み込み中...</div>
                                ) : dupItems.length === 0 ? (
                                    <div className="dup-empty">重複（履歴が2件以上）の材料がありません</div>
                                ) : (
                                    dupItems
                                        .filter((item) => {
                                            const q = String(dupSearch || '').trim();
                                            if (!q) return true;
                                            return String(item?.name || '').includes(q);
                                        })
                                        .map((item) => {
                                            const isActive = item.key === dupSelectedKey;
                                            const changed = (item.minPrice !== null && item.maxPrice !== null && item.minPrice !== item.maxPrice);
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    className={`dup-item ${isActive ? 'active' : ''} `}
                                                    onClick={() => setDupSelectedKey(item.key)}
                                                >
                                                    <div className="dup-item-top">
                                                        <div className="dup-item-name" title={item.name}>{item.name}</div>
                                                        {changed && <span className="dup-badge">価格変化</span>}
                                                    </div>
                                                    <div className="dup-item-meta">
                                                        <span>最新: {item.lastDate || '-'}</span>
                                                        <span>履歴: {item.rows}件</span>
                                                        <span>日数: {item.dates}日</span>
                                                    </div>
                                                    <div className="dup-item-meta">
                                                        <span>
                                                            {item.lastPrice !== null ? `¥${Math.round(item.lastPrice).toLocaleString()} ` : '¥-'}
                                                            {item.unit ? ` / ${item.unit} ` : ''}
                                                        </span>
                                                        <span>
                                                            入荷: {item.lastIncomingQty !== null ? Math.round(item.lastIncomingQty).toLocaleString() : '-'}
                                                        </span>
                                                        {item.vendor ? <span title={item.vendor}>業者: {item.vendor}</span> : <span>業者: -</span>}
                                                    </div>
                                                    {item.nameVariants > 1 && (
                                                        <div className="dup-item-note">
                                                            表記ゆれ: {item.nameVariants}種類
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })
                                )}
                            </div>
                        </div>

                        <div className="sidebar-card">
                            <div className="sidebar-title">ℹ️ 使い方</div>
                            <ul style={{ fontSize: '0.75rem', color: '#666', paddingLeft: '1.2rem', margin: 0 }}>
                                <li style={{ marginBottom: '4px' }}>一覧から材料をクリックすると、入荷日ごとの単価履歴が表示されます。</li>
                                <li style={{ marginBottom: '4px' }}>「価格変化」バッジは、履歴内で単価が変わったものです。</li>
                                <li style={{ marginBottom: '4px' }}>表記ゆれ（空白/大文字小文字/全角半角など）も同一扱いでまとめています。</li>
                            </ul>
                        </div>
                    </aside>

                    <main className="dashboard-main">
                        <div className="main-toolbar">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#333' }}>
                                    {dupSelectedKey ? '価格履歴' : '価格履歴（未選択）'}
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <select
                                    value={dupMonth}
                                    onChange={(e) => setDupMonth(e.target.value)}
                                    disabled={!dupSelectedKey}
                                    title={dupSelectedKey ? '月を指定（全期間も選べます）' : '先に材料を選択してください'}
                                    className="dup-month-select"
                                >
                                    <option value="">全期間</option>
                                    {dupAvailableMonths.map((m) => (
                                        <option key={m} value={m}>
                                            {m.replace('-', '/')}
                                        </option>
                                    ))}
                                </select>
                                <Button variant="secondary" size="sm" onClick={loadDuplicates} disabled={dupLoading}>↻ 更新</Button>
                            </div>
                        </div>

                        <div className="table-wrapper">
                            {(() => {
                                if (!dupSelectedKey) {
                                    return (
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px', color: '#888' }}>
                                            左の一覧から材料を選択してください
                                        </div>
                                    );
                                }

                                const rows = dupHistoryMap.get(dupSelectedKey) || [];
                                const seen = new Set();
                                const unique = [];
                                rows.forEach((r) => {
                                    const id = [
                                        String(r?.dateStr || ''),
                                        String(r?.price ?? ''),
                                        String(r?.incomingQty ?? ''),
                                        String(r?.unit || ''),
                                        String(r?.vendor || ''),
                                        String(r?.displayName || ''),
                                        String(r?.sourceFile || ''),
                                    ].join('|');
                                    if (seen.has(id)) return;
                                    seen.add(id);
                                    unique.push(r);
                                });
                                unique.sort((a, b) => String(a?.dateStr || '').localeCompare(String(b?.dateStr || '')));

                                const filtered = dupMonth
                                    ? unique.filter(r => toMonthKey(r?.dateStr) === dupMonth)
                                    : unique;

                                const withDiff = filtered.map((r, idx) => {
                                    const prev = idx > 0 ? filtered[idx - 1] : null;
                                    const prevPrice = prev ? Number(prev?.price) : NaN;
                                    const curPrice = Number(r?.price);
                                    let diff = null;
                                    let pct = null;
                                    if (Number.isFinite(prevPrice) && Number.isFinite(curPrice)) {
                                        diff = curPrice - prevPrice;
                                        pct = prevPrice !== 0 ? (diff / prevPrice) * 100 : null;
                                    }
                                    return { ...r, _diff: diff, _pct: pct };
                                });

                                const totalIncomingQty = filtered.reduce((sum, r) => {
                                    const q = Number(r?.incomingQty);
                                    return sum + (Number.isFinite(q) ? q : 0);
                                }, 0);

                                const totalIncomingAmount = filtered.reduce((sum, r) => {
                                    const q = Number(r?.incomingQty);
                                    const p = Number(r?.price);
                                    if (!Number.isFinite(q) || !Number.isFinite(p)) return sum;
                                    return sum + (q * p);
                                }, 0);

                                const displayRows = [...withDiff].reverse(); // newest first

                                return (
                                    <table className="enterprise-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '120px' }}>納品日</th>
                                                <th>業者名</th>
                                                <th>材料名（CSV表記）</th>
                                                <th style={{ textAlign: 'right', width: '120px' }}>入荷数</th>
                                                <th style={{ textAlign: 'right', width: '160px' }}>単価</th>
                                                <th style={{ textAlign: 'right', width: '180px' }}>入荷金額</th>
                                                <th style={{ textAlign: 'right', width: '180px' }}>前回比</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="no-data">
                                                        {dupMonth ? `指定月（${dupMonth}）の履歴がありません` : '履歴がありません'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                displayRows.map((r, idx) => {
                                                    const diff = r?._diff;
                                                    const pct = r?._pct;
                                                    const diffLabel = (diff === null || diff === undefined || !Number.isFinite(diff))
                                                        ? '-'
                                                        : `${diff >= 0 ? '+' : ''}${Math.round(diff).toLocaleString()} `;
                                                    const pctLabel = (pct === null || pct === undefined || !Number.isFinite(pct))
                                                        ? ''
                                                        : ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`;
                                                    const diffColor = (diff === null || diff === undefined || !Number.isFinite(diff))
                                                        ? '#888'
                                                        : (diff > 0 ? '#c92a2a' : diff < 0 ? '#2b8a3e' : '#666');

                                                    const price = Number(r?.price);
                                                    const priceLabel = Number.isFinite(price) ? `¥${Math.round(price).toLocaleString()} ` : '¥-';
                                                    const qty = Number(r?.incomingQty);
                                                    const qtyLabel = Number.isFinite(qty) ? Math.round(qty).toLocaleString() : '-';
                                                    const amount = (Number.isFinite(qty) && Number.isFinite(price)) ? (qty * price) : NaN;
                                                    const amountLabel = Number.isFinite(amount) ? `¥${Math.round(amount).toLocaleString()} ` : '-';

                                                    return (
                                                        <tr key={`${r?.dateStr || 'd'} -${idx} `}>
                                                            <td className="col-date">{r?.dateStr || '-'}</td>
                                                            <td>{r?.vendor || '-'}</td>
                                                            <td style={{ fontWeight: 500 }}>{r?.displayName || '-'}</td>
                                                            <td className="col-number">{qtyLabel}</td>
                                                            <td className="col-number">
                                                                {priceLabel}
                                                                {r?.unit && <span style={{ color: '#888', fontSize: '0.85em', marginLeft: '4px' }}>/ {r.unit}</span>}
                                                            </td>
                                                            <td className="col-number">{amountLabel}</td>
                                                            <td className="col-number" style={{ color: diffColor }}>
                                                                {diffLabel}{pctLabel}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                        {displayRows.length > 0 && (
                                            <tfoot>
                                                <tr>
                                                    <td colSpan="3" style={{ fontWeight: 700 }}>
                                                        合計{dupMonth ? `（${dupMonth}）` : ''}
                                                    </td>
                                                    <td className="col-number" style={{ fontWeight: 700 }}>
                                                        {Math.round(totalIncomingQty).toLocaleString()}
                                                    </td>
                                                    <td className="col-number" style={{ color: '#888' }}>-</td>
                                                    <td className="col-number" style={{ fontWeight: 700 }}>
                                                        ¥{Math.round(totalIncomingAmount).toLocaleString()}
                                                    </td>
                                                    <td className="col-number" style={{ color: '#888' }}>-</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                );
                            })()}
                        </div>
                    </main>
                </div>
            ) : (

                <div className="dashboard-content">
                    {/* Left Sidebar: Operations (File & Backup) */}
                    <aside className="dashboard-sidebar">
                        {/* 1. Recipe Backup */}
                        <div className="sidebar-card" style={{ borderColor: 'var(--color-primary)' }}>
                            <div className="sidebar-title" style={{ color: '#000' }}>
                                <span>🔄</span> レシピバックアップ
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <p style={{ fontSize: '0.85rem', color: '#333', marginBottom: '0.5rem' }}>
                                    全レシピを保存
                                </p>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    block
                                    onClick={async () => {
                                        try {
                                            const data = await import('../services/recipeService').then(m => m.recipeService.exportAllRecipes());
                                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `recipe_backup_${new Date().toISOString().slice(0, 10)}.json`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                        } catch (e) {
                                            setBackupStatus({ type: 'error', message: 'バックアップ作成に失敗しました' });
                                            console.error(e);
                                        }
                                    }}
                                >
                                    📥 JSON形式でダウンロード
                                </Button>
                            </div>

                            <div>
                                <p style={{ fontSize: '0.85rem', color: '#333', marginBottom: '0.5rem' }}>
                                    データを復元 / 追加
                                </p>
                                <input
                                    type="file"
                                    accept=".json"
                                    id="backup-upload-input"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        openBackupImportModal(file);
                                    }}
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    block
                                    onClick={() => document.getElementById('backup-upload-input').click()}
                                    disabled={isUploading || backupImportInProgress}
                                >
                                    📤 バックアップから復元
                                </Button>

                                {backupStatus.message && (
                                    <div className={`status-msg ${backupStatus.type} `} style={{ marginTop: '10px' }}>
                                        {backupStatus.message}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. File Operations */}
                        <div className="sidebar-card">
                            <div className="sidebar-title">
                                <span>📂</span> ファイル操作
                            </div>
                            <div className="upload-area">
                                <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                                    仕入れCSV (Shift-JIS)<br />
                                    <span style={{ fontSize: '0.75rem', color: '#888' }}>
                                        ※ 形式1: 「材料名...」<br />
                                        ※ 形式2: 業務用システム出力
                                    </span>
                                </p>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    id="csv-upload-input"
                                    className="csv-input"
                                    style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}
                                />
                                <Button
                                    variant="primary"
                                    onClick={handleUpload}
                                    disabled={!file || isUploading}
                                    className="upload-btn"
                                    size="sm"
                                    block
                                >
                                    {isUploading ? 'アップロード中...' : 'アップロード実行'}
                                </Button>
                            </div>

                            {status.message && (
                                <div className={`status-msg ${status.type} `}>
                                    {status.message}
                                </div>
                            )}
                        </div>

                        {/* 2.5 Copy to another account (admin only) */}
                        {user?.role === 'admin' && (
                            <div className="sidebar-card">
                                <div className="sidebar-title">
                                    <span>👥</span> 共有（コピー）
                                </div>
                                <p style={{ fontSize: '0.85rem', color: '#333', margin: 0, lineHeight: 1.5 }}>
                                    現在の価格CSVを、選択したアカウントへ複製します。
                                    <br />
                                    <span style={{ fontSize: '0.75rem', color: '#888' }}>※ 同期はされません（1回コピー）</span>
                                </p>
                                <div style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.6rem' }}>
                                    コピー対象: {uploadedFiles.length}件
                                </div>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        block
                                        onClick={openCopyModal}
                                        disabled={copyInProgress || isUploading}
                                        title="他アカウントへ価格データをコピーします"
                                    >
                                        他アカウントへコピー
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* 3. Saved Files List */}
                        <div className="sidebar-card" style={{ flex: 1 }}>
                            <div className="sidebar-title">
                                <span>💾</span> 保存済みファイル
                                <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal', marginLeft: 'auto' }}>
                                    {uploadedFiles.length}件
                                </span>
                            </div>
                            {uploadedFiles.length === 0 ? (
                                <p style={{ color: '#aaa', fontStyle: 'italic', fontSize: '0.85rem', textAlign: 'center' }}>なし</p>
                            ) : (
                                <div className="file-list">
                                    {uploadedFiles.map(f => (
                                        <div key={f.name} className="file-list-item">
                                            <span className="file-name" title={f.name}>{f.name}</span>
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeleteFile(f.name)}
                                                disabled={isUploading}
                                                style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: 'auto' }}
                                            >
                                                削除
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 一括操作（全ユーザー: 自分のデータをゴミ箱へ移動） */}
                        <div className="sidebar-card" style={{ borderLeft: '4px solid #ef4444' }}>
                            <div className="sidebar-title" style={{ color: '#ef4444' }}>⚠️ 一括操作</div>
                            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 10px' }}>
                                全ての価格データCSVをゴミ箱へ移動します。ゴミ箱からの復元・完全削除は「ゴミ箱」タブから行えます。
                            </p>
                            {bulkDeletePriceResult && (
                                <div className={`status-msg ${bulkDeletePriceResult.type} `} style={{ marginBottom: '8px', fontSize: '0.82rem' }}>
                                    {bulkDeletePriceResult.message}
                                </div>
                            )}
                            <Button
                                variant="danger"
                                onClick={() => setBulkDeletePriceModal(true)}
                                disabled={bulkDeletePriceLoading || uploadedFiles.length === 0}
                                style={{ width: '100%' }}
                            >
                                🗑️ 全件ゴミ箱へ移動
                            </Button>

                            {/* 管理者専用: 全通常ユーザーへの一括配布と削除 */}
                            {user?.role === 'admin' && (
                                <>
                                    <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #fecaca' }} />

                                    <div style={{ marginBottom: '16px', padding: '12px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #6ee7b7' }}>
                                        <div className="sidebar-title" style={{ color: '#047857', marginBottom: '8px', fontSize: '0.9rem' }}>🌐 管理者一括配布</div>
                                        <p style={{ fontSize: '0.8rem', color: '#065f46', marginBottom: '12px', lineHeight: 1.4 }}>
                                            あなたの「価格データ」と「材料マスター（単位上書き等）」を全通常ユーザーへ一気にコピー・配布します。
                                        </p>
                                        <Button
                                            variant="primary"
                                            onClick={() => setAdminCopyAllOpen(true)}
                                            style={{ width: '100%', background: '#059669', borderColor: '#047857' }}
                                        >
                                            📤 全ユーザーへ一括配布
                                        </Button>
                                    </div>

                                    <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 8px' }}>
                                        ⚡ 通常ユーザーの価格データを一括削除（永続削除）します。ゴミ箱には移動しません。
                                    </p>
                                    {adminClearResult && (
                                        <div className={`status-msg ${adminClearResult.type} `} style={{ marginBottom: '8px', fontSize: '0.82rem' }}>
                                            {adminClearResult.message}
                                        </div>
                                    )}
                                    {adminTargetClearResult && (
                                        <div className={`status-msg ${adminTargetClearResult.type} `} style={{ marginBottom: '8px', fontSize: '0.82rem' }}>
                                            {adminTargetClearResult.message}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <Button
                                            variant="danger"
                                            onClick={() => setAdminTargetClearModal(true)}
                                            disabled={adminClearLoading || adminTargetClearLoading}
                                            style={{ width: '100%', background: '#b91c1c' }}
                                        >
                                            👤 特定ユーザーのデータを削除
                                        </Button>
                                        <Button
                                            variant="danger"
                                            onClick={() => setAdminClearModal(true)}
                                            disabled={adminClearLoading || adminTargetClearLoading}
                                            style={{ width: '100%', background: '#7f1d1d' }}
                                        >
                                            🧹 通常ユーザー全件を削除
                                        </Button>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: '#666', margin: '12px 0 8px' }}>
                                        📋 通常ユーザー全員の材料マスター（単位変換・CSV単位上書き）を一括削除します。
                                    </p>
                                    {adminClearMasterResult && (
                                        <div className={`status-msg ${adminClearMasterResult.type} `} style={{ marginBottom: '8px', fontSize: '0.82rem' }}>
                                            {adminClearMasterResult.message}
                                        </div>
                                    )}
                                    <Button
                                        variant="danger"
                                        onClick={() => setAdminClearMasterModal(true)}
                                        disabled={adminClearMasterLoading}
                                        style={{ width: '100%', background: '#7f1d1d' }}
                                    >
                                        📋 通常ユーザーの材料マスターを全件削除
                                    </Button>
                                </>
                            )}
                        </div>


                        <div className="sidebar-card">
                            <div className="sidebar-title">ℹ️ ヒント</div>
                            <ul style={{ fontSize: '0.75rem', color: '#666', paddingLeft: '1.2rem', margin: 0 }}>
                                <li style={{ marginBottom: '4px' }}>重複データは最新の日付が優先されます。</li>
                                <li style={{ marginBottom: '4px' }}>「🔁 重複アイテム」タブで入荷日ごとの価格変化を確認できます。</li>
                                <li style={{ marginBottom: '4px' }}>新しいファイルを追加すると既存データとマージされます。</li>
                            </ul>
                        </div>
                    </aside>


                    {/* Right Main: Data Table */}
                    <main className="dashboard-main">
                        <div className="main-toolbar">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#333' }}>登録データ一覧</h3>
                                <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: '500' }}>
                                    全 {filteredAndSortedData.length.toLocaleString()} 件
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Input
                                    placeholder="検索 (日付, 業者名, 材料名)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ width: '250px', fontSize: '0.9rem' }}
                                />
                                <Button variant="secondary" size="sm" onClick={loadData}>↻ 更新</Button>
                            </div>
                        </div>

                        <div className="table-wrapper">
                            {isLoadingData ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#888' }}>
                                    データ読み込み中...
                                </div>
                            ) : (
                                <table className="enterprise-table">
                                    <thead>
                                        <tr>
                                            <th onClick={() => handleSort('dateStr')} style={{ width: '120px' }}>
                                                納品日 {sortConfig.key === 'dateStr' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th onClick={() => handleSort('vendor')}>
                                                業者名 {sortConfig.key === 'vendor' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th onClick={() => handleSort('name')}>
                                                材料名 {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                            </th>
                                            <th style={{ textAlign: 'right', width: '150px' }}>
                                                単価 (円)
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAndSortedData.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" className="no-data">
                                                    データが見つかりません
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredAndSortedData.map((item, index) => (
                                                <tr key={index}>
                                                    <td className="col-date">{item.dateStr || '-'}</td>
                                                    <td>{item.vendor || '-'}</td>
                                                    <td style={{ fontWeight: '500' }}>{item.name}</td>
                                                    <td className="col-number">
                                                        {item.price ? item.price.toLocaleString() : '-'}
                                                        {item.unit && <span style={{ color: '#888', fontSize: '0.85em', marginLeft: '4px' }}>/ {item.unit}</span>}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </main>
                </div>
            )}

            {/* Backup Import Modal */}
            <Modal
                isOpen={backupImportModalOpen}
                onClose={closeBackupImportModal}
                title="バックアップから復元 / 追加"
                size="medium"
                showCloseButton={!backupImportInProgress}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
                        バックアップJSONからレシピを読み込みます。
                        <br />
                        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                            ※ 既存レシピは維持され、バックアップ内のレシピが新規追加されます。
                        </span>
                    </div>

                    <div style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        padding: '12px',
                        background: '#f8fafc',
                        color: '#111827'
                    }}>
                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>読み込むファイル</div>
                        <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                            {backupImportFile?.name || '-'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Button variant="ghost" onClick={closeBackupImportModal} disabled={backupImportInProgress}>
                            キャンセル
                        </Button>
                        <Button
                            variant="primary"
                            onClick={startBackupImport}
                            disabled={!backupImportFile || backupImportInProgress}
                        >
                            {backupImportInProgress ? '復元中...' : 'この内容で復元'}
                        </Button>
                    </div>

                    {backupImportInProgress && (
                        <div className="bulk-progress" style={{ marginTop: '10px' }}>
                            <div className="bulk-progress-head">
                                <div className="bulk-progress-spinner" />
                                <div>
                                    <div className="bulk-progress-title">復元中...</div>
                                    <div className="bulk-progress-subtitle">完了までお待ちください</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {backupStatus.message && (
                        <div className={`status-msg ${backupStatus.type || 'info'} `} style={{ whiteSpace: 'pre-wrap' }}>
                            {backupStatus.message}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Copy Modal */}
            <Modal
                isOpen={copyModalOpen}
                onClose={closeCopyModal}
                title="価格データを他アカウントへコピー"
                size="medium"
                showCloseButton={!copyInProgress}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
                        価格データ（保存済みCSVファイル）を、別アカウントへ複製します。
                        <br />
                        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                            ※ 同期はされません（1回コピー）。同名ファイルは自動で <code>_copy</code> を付けて保存します。
                        </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                        コピー元: <strong style={{ color: '#111827' }}>{user?.displayId || '現在のアカウント'}</strong> / 対象: {uploadedFiles.length}件
                    </div>

                    {!copyConfirming ? (
                        <>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px', color: '#111827' }}>
                                    コピー先アカウント
                                </div>

                                {copyProfilesLoading ? (
                                    <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>ユーザー一覧を読み込み中...</div>
                                ) : (
                                    <select
                                        value={copyTargetId}
                                        onChange={(e) => setCopyTargetId(e.target.value)}
                                        disabled={copyInProgress || !!copyProfilesError}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #d1d5db',
                                            fontSize: '0.95rem',
                                            background: copyInProgress ? '#f3f4f6' : 'white'
                                        }}
                                    >
                                        <option value="">選択してください...</option>
                                        {copyProfiles
                                            .filter(p => String(p?.id) && String(p?.id) !== String(user?.id))
                                            .map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.display_id}{p.email ? ` (${p.email})` : ''}{p.role === 'admin' ? ' [管理者]' : ''}
                                                </option>
                                            ))}
                                    </select>
                                )}

                                {copyProfilesError && (
                                    <div style={{ marginTop: '8px', color: '#c92a2a', fontSize: '0.85rem' }}>
                                        {copyProfilesError}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                                <Button variant="ghost" onClick={closeCopyModal} disabled={copyInProgress}>
                                    閉じる
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => setCopyConfirming(true)}
                                    disabled={!copyTargetId || copyInProgress || copyProfilesLoading || !!copyProfilesError}
                                >
                                    次へ
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            {(() => {
                                const target = copyProfiles.find(p => String(p?.id) === String(copyTargetId));
                                const label = target
                                    ? `${target.display_id}${target.email ? ` (${target.email})` : ''} `
                                    : (copyTargetId ? String(copyTargetId).slice(0, 8) : '-');
                                return (
                                    <div style={{
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '10px',
                                        padding: '12px',
                                        background: '#f8fafc',
                                        color: '#111827'
                                    }}>
                                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>この内容でコピーしますか？</div>
                                        <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                                            コピー先: <strong>{label}</strong>
                                            <br />
                                            対象: <strong>{uploadedFiles.length.toLocaleString()}</strong> 件（CSVファイル）
                                            <br />
                                            同名ファイル: <code>_copy</code> を付けて保存（上書きしません）
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* コピー実行中またはエラー・成功時のボタン表示 */}
                            {copyResult ? (
                                <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                                    <div style={{ marginBottom: '16px', color: '#374151', fontSize: '0.95rem', fontWeight: 500 }}>
                                        {copyResult.type === 'success' ? 'コピーが完了しました。他のアカウントにも続けてコピーしますか？' : '再度操作を行いますか？（エラー）'}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                        <Button variant="ghost" onClick={closeCopyModal}>
                                            閉じる
                                        </Button>
                                        <Button
                                            variant="primary"
                                            onClick={() => {
                                                setCopyResult(null);
                                                setCopyConfirming(false);
                                                setCopyTargetId('');
                                            }}
                                        >
                                            続けてコピーする
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                                    <Button variant="ghost" onClick={() => setCopyConfirming(false)} disabled={copyInProgress}>
                                        戻る
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={startCopyToAccount}
                                        disabled={!copyTargetId || copyInProgress}
                                    >
                                        {copyInProgress ? 'コピー中...' : 'この内容でコピー'}
                                    </Button>
                                </div>
                            )}

                            {copyInProgress && (
                                <div className="bulk-progress" style={{ marginTop: '10px' }}>
                                    <div className="bulk-progress-head">
                                        <div className="bulk-progress-spinner" />
                                        <div>
                                            <div className="bulk-progress-title">コピー中...</div>
                                            <div className="bulk-progress-subtitle">
                                                {copyProgress.total ? `${copyProgress.done} / ${copyProgress.total}` : '準備中...'}
                                            </div >
                                        </div >
                                    </div >
                                    <div className="bulk-progress-bar">
                                        <div
                                            className="bulk-progress-bar-inner"
                                            style={{
                                                width: copyProgress.total ? `${Math.round((copyProgress.done / copyProgress.total) * 100)}%` : '0%'
                                            }}
                                        />
                                    </div>
                                    <div className="bulk-progress-current" title={copyProgress.current}>
                                        {copyProgress.current}
                                    </div>
                                </div >
                            )}

                            {
                                copyResult?.message && (
                                    <div className={`status-msg ${copyResult.type || 'info'}`}>
                                        {copyResult.message}
                                    </div>
                                )
                            }

                            {
                                Array.isArray(copyResult?.failed) && copyResult.failed.length > 0 && (
                                    <div className="bulk-progress-failures">
                                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                                            失敗: {copyResult.failed.length}件
                                        </div>
                                        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                                            {copyResult.failed.slice(0, 10).map((f, i) => (
                                                <li key={`${f?.file || 'f'}-${i}`}>
                                                    {f?.file || '-'}: {f?.errorMessage || 'unknown error'}
                                                </li>
                                            ))}
                                        </ul>
                                        {copyResult.failed.length > 10 && (
                                            <div style={{ marginTop: '6px' }}>
                                                ...他 {copyResult.failed.length - 10}件
                                            </div>
                                        )}
                                    </div>
                                )
                            }
                        </>
                    )}
                </div >
            </Modal >

            {/* Custom Confirm Modal */}
            {
                confirmModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        animation: 'fadeIn 0.2s ease-out'
                    }} onClick={() => setConfirmModal(null)}>
                        <div style={{
                            backgroundColor: 'white',
                            padding: '24px',
                            borderRadius: '8px',
                            maxWidth: '400px',
                            width: '90%',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                        }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333' }}>確認</h3>
                            <p style={{ whiteSpace: 'pre-wrap', marginBottom: '24px', color: '#666' }}>{confirmModal.message}</p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <Button variant="ghost" onClick={() => setConfirmModal(null)}>キャンセル</Button>
                                <Button variant="danger" onClick={() => {
                                    confirmModal.onConfirm();
                                    setConfirmModal(null);
                                }}>削除する</Button>
                            </div>
                        </div>
                    </div>
                )}

            {/* 価格データ CSVの一括ゴミ箱移動確認モーダル */}
            <DeleteConfirmModal
                isOpen={bulkDeletePriceModal}
                onClose={() => { if (!bulkDeletePriceLoading) { setBulkDeletePriceModal(false); setBulkDeletePriceResult(null); } }}
                onConfirm={async () => {
                    await handleBulkMoveToTrash();
                    setBulkDeletePriceModal(false);
                }}
                title="価格データを全件ゴミ箱へ移動"
                description={
                    <span>
                        アップロード済みの価格データCSVファイル（<strong>{uploadedFiles.length}件</strong>）を全てゴミ箱へ移動します。<br />
                        ゴミ箱タブから復元・完全削除が行えます。
                    </span>
                }
                loading={bulkDeletePriceLoading}
                loadingNode={
                    bulkDeletePriceProgress.current ? (
                        <span>処理中... <strong>{bulkDeletePriceProgress.current}</strong></span>
                    ) : '処理中...'
                }
            />

            {/* 管理者専用: 通常ユーザーの価格データCSV全件削除モーダル */}
            <DeleteConfirmModal
                isOpen={adminClearModal}
                onClose={() => { if (!adminClearLoading) { setAdminClearModal(false); setAdminClearResult(null); } }}
                onConfirm={async () => {
                    await handleAdminClearNonAdminCsvs();
                    setAdminClearModal(false);
                }}
                title="通常ユーザーの価格データを全件削除"
                description={
                    <span>
                        <strong style={{ color: '#b91c1c' }}>管理者・admin以外の全ユーザー</strong>の価格データCSVを<strong>永続削除</strong>します。<br />
                        ゴミ箱には移動しません。この操作は取り消せません。
                    </span>
                }
                loading={adminClearLoading}
                loadingNode={
                    <span>処理中 ({adminClearProgress.done}/{adminClearProgress.total})... {adminClearProgress.current && <strong>{adminClearProgress.current}</strong>}</span>
                }
            />

            {/* 管理者専用: 通常ユーザーの材料マスター全件削除モーダル */}
            <DeleteConfirmModal
                isOpen={adminClearMasterModal}
                onClose={() => { if (!adminClearMasterLoading) { setAdminClearMasterModal(false); setAdminClearMasterResult(null); } }}
                onConfirm={async () => {
                    await handleAdminClearNonAdminIngredientMaster();
                    setAdminClearMasterModal(false);
                }}
                title="通常ユーザーの材料マスターを全件削除"
                description={
                    <span>
                        <strong style={{ color: '#b91c1c' }}>管理者・admin以外の全ユーザー</strong>の材料マスター（単位変換・CSV単位上書き）を<strong>永続削除</strong>します。<br />
                        この操作は取り消せません。
                    </span>
                }
                loading={adminClearMasterLoading}
                loadingNode="処理中..."
            />

            {/* 管理者専用: 特定ユーザーの価格データCSV削除モーダル */}
            <AdminTargetDeleteModal
                isOpen={adminTargetClearModal}
                onClose={() => { if (!adminTargetClearLoading) { setAdminTargetClearModal(false); setAdminTargetClearResult(null); } }}
                onConfirm={handleAdminTargetClearCsvs}
                title="特定ユーザーの価格データを削除"
                description={
                    <span>
                        指定したユーザーの価格データCSVを<strong>永続削除</strong>します。<br />
                        ゴミ箱には移動しません。この操作は取り消せません。
                    </span>
                }
                loading={adminTargetClearLoading}
                loadingNode="処理中..."
            />

            {/* 管理者専用: 全ユーザーへの価格・マスター一括配布モーダル */}
            <AdminCopyAllModal
                isOpen={adminCopyAllOpen}
                onClose={() => {
                    setAdminCopyAllOpen(false);
                    setAdminCopyAllStatus(null);
                    setAdminCopyAllResult(null);
                }}
                onConfirm={handleAdminCopyAll}
                loading={adminCopyAllLoading}
                progressStatus={adminCopyAllStatus}
                copyResult={adminCopyAllResult}
            />
        </div>
    );
};
