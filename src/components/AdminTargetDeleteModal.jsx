import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { userService } from '../services/userService';

export const AdminTargetDeleteModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    loading
}) => {
    const [profiles, setProfiles] = useState([]);
    const [profilesLoading, setProfilesLoading] = useState(false);
    const [targetId, setTargetId] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [deleteText, setDeleteText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTargetId('');
            setConfirming(false);
            setDeleteText('');
            loadProfiles();
        }
    }, [isOpen]);

    const loadProfiles = async () => {
        setProfilesLoading(true);
        try {
            const data = await userService.fetchAllProfiles();
            // 管理者自身を直接削除できないよう除外（安全のため通常ユーザーのみ表示）
            setProfiles((data || []).filter(p => p.role !== 'admin'));
        } catch (e) {
            console.error('Failed to load profiles:', e);
        } finally {
            setProfilesLoading(false);
        }
    };

    const handleConfirm = () => {
        onConfirm(targetId);
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!loading) onClose(); }}
            title={title}
            maxWidth="500px"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>
                    {description}
                </p>

                {profilesLoading ? (
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>ユーザー一覧を読み込み中...</div>
                ) : (
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>対象ユーザーを選択</label>
                        <select
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            disabled={loading || confirming}
                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        >
                            <option value="">-- ユーザーを選択してください --</option>
                            {profiles.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.display_id}{p.email ? ` (${p.email})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {!confirming ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Button variant="secondary" onClick={onClose} disabled={loading}>
                            キャンセル
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => setConfirming(true)}
                            disabled={!targetId || loading}
                        >
                            次へ
                        </Button>
                    </div>
                ) : (
                    <div style={{
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        padding: '15px',
                        backgroundColor: '#fef2f2',
                        marginTop: '10px'
                    }}>
                        <div style={{ fontWeight: 'bold', color: '#dc2626', marginBottom: '8px' }}>
                            最終確認
                        </div>
                        <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#991b1b' }}>
                            本当にこのユーザーのデータを削除しますか？ この操作は取り消せません。<br />
                            確認のため <strong>DELETE</strong> と入力してください。
                        </p>
                        <input
                            type="text"
                            value={deleteText}
                            onChange={(e) => setDeleteText(e.target.value)}
                            placeholder="DELETE"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #fca5a5',
                                borderRadius: '4px',
                                marginBottom: '15px'
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={loading}>
                                戻る
                            </Button>
                            <Button
                                variant="danger"
                                onClick={handleConfirm}
                                disabled={deleteText !== 'DELETE' || loading}
                            >
                                {loading ? '削除中...' : '完全に削除する'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
