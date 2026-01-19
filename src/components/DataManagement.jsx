import React, { useState, useEffect } from 'react';
import { purchasePriceService } from '../services/purchasePriceService';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import './DataManagement.css'; // New styles

export const DataManagement = ({ onBack }) => {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isUploading, setIsUploading] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

    // Sort & Search State
    const [sortConfig, setSortConfig] = useState({ key: 'dateStr', direction: 'desc' });
    const [searchQuery, setSearchQuery] = useState('');

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

        setIsUploading(false);
        if (result.success) {
            setStatus({ type: 'success', message: 'アップロード完了しました。' });
            setFile(null);
            // Clear file input
            const fileInput = document.getElementById('csv-upload-input');
            if (fileInput) fileInput.value = '';
            loadData(); // Reload table and file list
        } else {
            setStatus({ type: 'error', message: `エラー: ${result.error.message}` });
        }
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
                    setStatus({ type: 'error', message: `削除エラー: ${result.error.message}` });
                }
            }
        });
    };

    return (
        <div className="dashboard-container fade-in">
            {/* Header */}
            <div className="dashboard-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 className="section-title" style={{ margin: 0, fontSize: '1.5rem' }}>データ管理</h2>
                    <span style={{ fontSize: '0.85rem', color: '#666', background: '#eee', padding: '2px 8px', borderRadius: '12px' }}>
                        Admin Mode
                    </span>
                </div>
                <Button variant="ghost" onClick={onBack}>
                    ← レシピ一覧に戻る
                </Button>
            </div>

            <div className="dashboard-content">
                {/* Left Sidebar: Controls */}
                <aside className="dashboard-sidebar">
                    <div className="sidebar-card">
                        <div className="sidebar-title">
                            <span>📂</span> ファイル操作
                        </div>
                        <div className="upload-area">
                            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                                仕入れCSV (Shift-JIS)
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
                            <div className={`status-msg ${status.type}`}>
                                {status.message}
                            </div>
                        )}
                    </div>

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

                    <div className="sidebar-card">
                        <div className="sidebar-title">ℹ️ ヒント</div>
                        <ul style={{ fontSize: '0.75rem', color: '#666', paddingLeft: '1.2rem', margin: 0 }}>
                            <li style={{ marginBottom: '4px' }}>重複データは最新の日付が優先されます。</li>
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

                {/* Backup & Restore Section (Moved to after Main) */}
                <aside className="dashboard-sidebar">
                    <div className="sidebar-card" style={{ borderColor: 'var(--color-primary)' }}>
                        <div className="sidebar-title" style={{ color: 'var(--color-primary)' }}>
                            <span>🔄</span> レシピバックアップ
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
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
                                        alert("バックアップ作成に失敗しました");
                                        console.error(e);
                                    }
                                }}
                            >
                                📥 JSON形式でダウンロード
                            </Button>
                        </div>

                        <div>
                            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                                データを復元 / 追加
                            </p>
                            <input
                                type="file"
                                accept=".json"
                                id="backup-upload-input"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const file = e.target.files[0];
                                    if (!file) return;

                                    if (!window.confirm("バックアップファイルからレシピを読み込みますか？\n（既存の各レシピは維持され、バックアップ内のレシピが新規追加されます）")) {
                                        e.target.value = '';
                                        return;
                                    }

                                    try {
                                        setStatus({ type: 'info', message: '読み込み中...' });
                                        setIsUploading(true);
                                        const text = await file.text();
                                        const json = JSON.parse(text);

                                        const { recipeService } = await import('../services/recipeService');
                                        const result = await recipeService.importRecipes(json);

                                        alert(`${result.count}件のレシピを復元しました。${result.errors.length > 0 ? `\n失敗: ${result.errors.length}件` : ''}`);
                                        setStatus({ type: 'success', message: '復元完了' });
                                    } catch (err) {
                                        console.error(err);
                                        alert("復元に失敗しました。ファイル形式を確認してください。");
                                        setStatus({ type: 'error', message: '復元エラー' });
                                    } finally {
                                        setIsUploading(false);
                                        e.target.value = '';
                                    }
                                }}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                block
                                onClick={() => document.getElementById('backup-upload-input').click()}
                                disabled={isUploading}
                            >
                                📤 バックアップから復元
                            </Button>
                        </div>
                    </div>
                </aside>

            </div>

            {/* Custom Confirm Modal */}
            {confirmModal && (
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
        </div>
    );
};
