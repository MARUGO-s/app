import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * DELETE入力確認付きの危険操作確認モーダル
 *
 * Props:
 *   isOpen: bool
 *   onClose: () => void
 *   onConfirm: () => void | Promise<void>
 *   title: string
 *   description: React.ReactNode  -- 何を削除するかの説明
 *   confirmWord: string  -- デフォルト 'DELETE'
 *   loading: bool
 */
export const DeleteConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = '削除の確認',
    description,
    confirmWord = 'DELETE',
    loading = false,
    loadingNode = null,
}) => {
    const [inputValue, setInputValue] = useState('');

    const isMatch = inputValue === confirmWord;

    const handleClose = () => {
        setInputValue('');
        onClose();
    };

    const handleConfirm = async () => {
        if (!isMatch || loading) return;
        await onConfirm();
        setInputValue('');
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={title} size="small" showCloseButton={!loading}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {description && (
                    <div style={{ color: '#374151', fontSize: '0.95rem', lineHeight: 1.6 }}>
                        {description}
                    </div>
                )}

                <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '0.9rem',
                    color: '#991b1b',
                }}>
                    ⚠️ この操作は取り消せません。続行するには下に <strong>{confirmWord}</strong> と入力してください。
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>
                        確認入力
                    </label>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        placeholder={confirmWord}
                        disabled={loading}
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: isMatch ? '2px solid #ef4444' : '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontFamily: 'monospace',
                            letterSpacing: '0.05em',
                            outline: 'none',
                            boxSizing: 'border-box',
                            color: '#111',
                            transition: 'border-color 0.15s ease',
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                    />
                </div>

                {loading && loadingNode && (
                    <div style={{ marginTop: '4px', padding: '12px', background: '#f3f4f6', borderRadius: '8px', fontSize: '0.9rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', flexShrink: 0, border: '3px solid #e5e7eb', borderTopColor: '#6b7280', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <div style={{ wordBreak: 'break-all' }}>{loadingNode}</div>
                        <style>
                            {`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        `}
                        </style>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                    <Button variant="ghost" onClick={handleClose} disabled={loading}>
                        キャンセル
                    </Button>
                    <Button
                        variant="danger"
                        onClick={handleConfirm}
                        disabled={!isMatch || loading}
                    >
                        {loading ? '処理中...' : '削除する'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
