import React, { useState } from 'react';
import { purchasePriceService } from '../services/purchasePriceService';
import { Button } from './Button';
import { Card } from './Card';
import './PriceListManager.css';

export const PriceListManager = ({ onClose }) => {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isUploading, setIsUploading] = useState(false);
    const [deleteConfirming, setDeleteConfirming] = useState(false);

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
        } else {
            setStatus({ type: 'error', message: `エラー: ${result.error.message}` });
        }
    };

    const handleDelete = async () => {
        setDeleteConfirming(false);

        setIsUploading(true);
        setStatus({ type: 'info', message: '削除中...' });

        const result = await purchasePriceService.deletePriceList();

        setIsUploading(false);
        if (result.success) {
            setStatus({ type: 'success', message: '削除されました。' });
        } else {
            setStatus({ type: 'error', message: `エラー: ${result.error.message}` });
        }
    };

    return (
        <div className="modal-overlay fade-in">
            <Card className="price-manager-card">
                <div className="price-manager-header">
                    <h3>価格リスト管理 (CSV)</h3>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="price-manager-content">
                    <p className="description">
                        仕入れ価格の参照用CSVファイルを管理します。<br />
                        形式: <code>材料名,価格</code> (例: <code>強力粉,200</code>)
                    </p>

                    <div className="upload-section">
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            id="csv-upload-input"
                            className="csv-input"
                        />
                        <Button
                            variant="primary"
                            onClick={handleUpload}
                            disabled={!file || isUploading}
                            className="upload-btn"
                        >
                            {isUploading ? '処理中...' : 'アップロード'}
                        </Button>
                    </div>

                    <div className="status-message" data-type={status.type}>
                        {status.message}
                    </div>

                    <div className="delete-section">
                        <hr />
                        <p className="danger-text">現在のリストを削除する場合:</p>
                        {!deleteConfirming ? (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setDeleteConfirming(true)}
                                disabled={isUploading}
                            >
                                価格リストを削除
                            </Button>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ color: '#c62828', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                    本当に削除しますか？（この操作は取り消せません）
                                </div>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirming(false)} disabled={isUploading}>
                                        キャンセル
                                    </Button>
                                    <Button variant="danger" size="sm" onClick={handleDelete} disabled={isUploading}>
                                        削除する
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};
