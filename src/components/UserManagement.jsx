import React, { useState, useEffect } from 'react';
import { userService } from '../services/userService';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import { useAuth } from '../contexts/useAuth';

export const UserManagement = ({ onBack }) => {
    const { user: currentUser, patchCurrentUserProfile } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [resetTarget, setResetTarget] = useState(null); // { id, display_id, email }
    const [resetPw1, setResetPw1] = useState('');
    const [resetPw2, setResetPw2] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
    const [savingMasterTargets, setSavingMasterTargets] = useState(new Set());

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await userService.fetchAllProfiles();
            setUsers(data);
        } catch (err) {
            console.error(err);
            setError('ユーザー一覧の取得に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    const admins = users.filter(u => u.role === 'admin');
    const regulars = users.filter(u => u.role !== 'admin');

    const setSavingForUser = (userId, saving) => {
        setSavingMasterTargets(prev => {
            const next = new Set(prev);
            if (saving) next.add(userId);
            else next.delete(userId);
            return next;
        });
    };

    const handleToggleMasterRecipeVisibility = async (targetUser, newVal) => {
        const previousVal = Boolean(targetUser.show_master_recipes);
        setError(null);

        setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, show_master_recipes: newVal } : u));
        if (targetUser.id === currentUser?.id) {
            patchCurrentUserProfile?.({ showMasterRecipes: newVal });
        }
        setSavingForUser(targetUser.id, true);

        try {
            const updated = await userService.updateProfile(targetUser.id, { show_master_recipes: newVal });
            const confirmed = Boolean(updated?.show_master_recipes);
            setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, show_master_recipes: confirmed } : u));
            if (targetUser.id === currentUser?.id) {
                patchCurrentUserProfile?.({ showMasterRecipes: confirmed });
            }
        } catch (err) {
            console.error(err);
            setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, show_master_recipes: previousVal } : u));
            if (targetUser.id === currentUser?.id) {
                patchCurrentUserProfile?.({ showMasterRecipes: previousVal });
            }
            setError('マスターレシピ共有設定の保存に失敗しました。権限設定（RLS）を確認してください。');
        } finally {
            setSavingForUser(targetUser.id, false);
        }
    };

    const UserCard = ({ user, isAdmin }) => (
        <Card key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: 'white' }}>
            <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#333' }}>
                    {user.display_id} {isAdmin && <span style={{ fontSize: '0.8rem', backgroundColor: '#e0e0e0', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', color: '#555' }}>管理者</span>}
                </div>
                {user.email && (
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px', wordBreak: 'break-all' }}>
                        {user.email}
                    </div>
                )}
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                    登録: {new Date(user.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px' }}>
                    更新: {user.updated_at ? new Date(user.updated_at).toLocaleString() : '---'}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#555' }}>
                    <input
                        type="checkbox"
                        checked={user.show_master_recipes || false}
                        disabled={savingMasterTargets.has(user.id)}
                        onChange={(e) => handleToggleMasterRecipeVisibility(user, e.target.checked)}
                    />
                    マスターレシピ表示
                </label>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                        setResetTarget({ id: user.id, display_id: user.display_id, email: user.email });
                        setResetPw1('');
                        setResetPw2('');
                        setResetError('');
                        setResetSuccess('');
                    }}
                    style={{ whiteSpace: 'nowrap' }}
                >
                    パスワード再設定
                </Button>
            </div>
        </Card>
    );

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: 'var(--text-color)' }}>
                <h2>ユーザー管理</h2>
                <Button variant="ghost" onClick={onBack}>戻る</Button>
            </div>

            {error && (
                <div style={{ padding: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '20px' }}>{error}</div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>読み込み中...</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    {admins.length > 0 && (
                        <div>
                            <h3 style={{ borderBottom: '2px solid var(--color-primary)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>管理者</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {admins.map(u => <UserCard key={u.id} user={u} isAdmin={true} />)}
                            </div>
                        </div>
                    )}

                    <div>
                        <h3 style={{ borderBottom: '2px solid #ddd', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--text-color)' }}>登録ユーザー</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {regulars.length > 0 ? (
                                regulars.map(u => <UserCard key={u.id} user={u} isAdmin={false} />)
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#666', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                    一般ユーザーはいません
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Modal
                isOpen={!!resetTarget}
                onClose={() => {
                    if (isResetting) return;
                    setResetTarget(null);
                }}
                title="管理者: パスワード再設定"
                size="small"
            >
                <div style={{ color: '#333', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                        対象: {resetTarget?.display_id || resetTarget?.email || resetTarget?.id}
                    </div>
                    {resetTarget?.email && (
                        <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '12px', wordBreak: 'break-all' }}>
                            {resetTarget.email}
                        </div>
                    )}

                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '12px' }}>
                        新しいパスワードを設定します（8文字以上）。パスワードそのものは保存・表示されません。
                    </div>

                    {resetError && (
                        <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                            {resetError}
                        </div>
                    )}
                    {resetSuccess && (
                        <div style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                            {resetSuccess}
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '6px' }}>新しいパスワード</label>
                            <input
                                type="password"
                                value={resetPw1}
                                onChange={(e) => setResetPw1(e.target.value)}
                                autoComplete="new-password"
                                placeholder="8文字以上"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '6px' }}>確認</label>
                            <input
                                type="password"
                                value={resetPw2}
                                onChange={(e) => setResetPw2(e.target.value)}
                                autoComplete="new-password"
                                placeholder="もう一度入力"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <Button
                            variant="ghost"
                            onClick={() => setResetTarget(null)}
                            disabled={isResetting}
                        >
                            キャンセル
                        </Button>
                        <Button
                            variant="secondary"
                            isLoading={isSendingResetEmail}
                            disabled={!resetTarget?.email || isResetting}
                            onClick={async () => {
                                setResetError('');
                                setResetSuccess('');
                                if (!resetTarget?.email) {
                                    setResetError('メールアドレスが登録されていません');
                                    return;
                                }
                                setIsSendingResetEmail(true);
                                try {
                                    await userService.sendPasswordResetEmail(resetTarget.email);
                                    setResetSuccess('パスワード再設定メールを送信しました');
                                } catch (e) {
                                    console.error(e);
                                    setResetError(e?.message || '送信に失敗しました');
                                } finally {
                                    setIsSendingResetEmail(false);
                                }
                            }}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            再設定メール送信
                        </Button>
                        <Button
                            variant="danger"
                            isLoading={isResetting}
                            onClick={async () => {
                                setResetError('');
                                setResetSuccess('');
                                if (!resetTarget?.id) return;
                                if (!resetPw1 || resetPw1.length < 8) {
                                    setResetError('パスワードは8文字以上にしてください');
                                    return;
                                }
                                if (resetPw1 !== resetPw2) {
                                    setResetError('パスワードが一致しません');
                                    return;
                                }
                                setIsResetting(true);
                                try {
                                    await userService.adminResetPassword(resetTarget.id, resetPw1);
                                    setResetSuccess('パスワードを更新しました');
                                    setResetPw1('');
                                    setResetPw2('');
                                } catch (e) {
                                    console.error(e);
                                    const msg = e?.message || '更新に失敗しました';
                                    // If Edge Function isn't deployed, guide to email-based reset path.
                                    if (
                                        /FunctionsHttpError|not found|404/i.test(msg) ||
                                        /admin-reset-password/i.test(msg)
                                    ) {
                                        setResetError('直接更新（管理者設定）は未デプロイのため失敗しました。代わりに「再設定メール送信」を使ってください。');
                                    } else {
                                        setResetError(msg);
                                    }
                                } finally {
                                    setIsResetting(false);
                                }
                            }}
                        >
                            更新する
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
