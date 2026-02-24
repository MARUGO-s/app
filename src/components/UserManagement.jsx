import React, { useState, useEffect, useRef } from 'react';
import { userService } from '../services/userService';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import { useAuth } from '../contexts/useAuth';
import { formatDisplayId } from '../utils/formatUtils';
import './UserManagement.css';

const NARROW_BREAKPOINT = 480;

export const UserManagement = ({ onBack }) => {
    const { user: currentUser, patchCurrentUserProfile } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isNarrow, setIsNarrow] = useState(false);
    const innerRef = useRef(null);
    const [resetTarget, setResetTarget] = useState(null); // { id, display_id, email }
    const [resetPw1, setResetPw1] = useState('');
    const [resetPw2, setResetPw2] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
    const [savingMasterTargets, setSavingMasterTargets] = useState(new Set());

    // Login Logs state
    const [logTarget, setLogTarget] = useState(null); // { id, display_id, email }
    const [loginLogs, setLoginLogs] = useState([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    // Delete User state
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const isSuperAdmin = (u) => u?.email === 'pingus0428@gmail.com';

    const loadUsers = React.useCallback(async () => {
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
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    useEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        const supportsResizeObserver = typeof window !== 'undefined' && typeof window.ResizeObserver !== 'undefined';
        if (!supportsResizeObserver) {
            setIsNarrow(el.getBoundingClientRect().width < NARROW_BREAKPOINT);
            return undefined;
        }

        const ro = new window.ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                setIsNarrow(w < NARROW_BREAKPOINT);
            }
        });
        ro.observe(el);
        setIsNarrow(el.getBoundingClientRect().width < NARROW_BREAKPOINT);
        return () => ro.disconnect();
    }, []);

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

    const handleOpenLoginLogs = async (user) => {
        setLogTarget(user);
        setIsLoadingLogs(true);
        setError('');
        try {
            const logs = await userService.adminGetLoginLogs(user.id);
            setLoginLogs(logs);
        } catch (err) {
            console.error(err);
            setError('ログイン履歴の取得に失敗しました');
        } finally {
            setIsLoadingLogs(false);
        }
    };

    const handleRoleChange = async (targetUser, newRole) => {
        setError(null);
        try {
            await userService.adminSetRole(targetUser.id, newRole);
            setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role: newRole } : u));
        } catch (err) {
            console.error(err);
            setError('権限の変更に失敗しました。');
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        setError(null);
        try {
            await userService.adminDeleteUser(deleteTarget.id);
            setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            setError('ユーザーの削除に失敗しました。');
        } finally {
            setIsDeleting(false);
        }
    };

    const getLoginBadge = (lastSignInAt) => {
        if (!lastSignInAt) {
            return { text: '未ログイン', color: '#666666', bg: '#f0f0f0' }; // Gray for never logged in
        }
        const diffHours = (Date.now() - new Date(lastSignInAt).getTime()) / (1000 * 60 * 60);

        if (diffHours < 24) {
            return { text: '24h', color: '#ff2d55', bg: '#ffe5e9' }; // Highlight Red
        } else if (diffHours < 24 * 3) {
            return { text: '3日以内', color: '#ff9500', bg: '#fff0d4' }; // Orange
        } else if (diffHours < 24 * 7) {
            return { text: '1週間', color: '#34c759', bg: '#e5f9e7' }; // Green
        } else if (diffHours < 24 * 30) {
            return { text: '1ヶ月', color: '#007aff', bg: '#e5f1ff' }; // Blue
        }
        return null; // older than 30 days
    };

    const UserCard = ({
        user,
        isAdmin,
        isSuperAdmin,
        currentUser,
        handleRoleChange,
        savingMasterTargets,
        handleToggleMasterRecipeVisibility,
        handleOpenLoginLogs,
        setResetTarget,
        setResetPw1,
        setResetPw2,
        setResetError,
        setResetSuccess,
        setDeleteTarget
    }) => {
        const badge = getLoginBadge(user.last_sign_in_at);
        const isEditableRoleTarget = !isSuperAdmin(user) && currentUser?.id !== user.id;

        return (
            <Card key={user.id} className="user-management__card">
                <div className="user-management__card-left">
                    <div className="user-management__identity-row">
                        <span className="user-management__display-id">{formatDisplayId(user.display_id)}</span>
                        {isAdmin && <span className="user-management__role-badge">管理者</span>}
                        {badge && (
                            <span className="user-management__login-badge" style={{
                                backgroundColor: badge.bg,
                                color: badge.color,
                                borderColor: badge.color
                            }}>
                                {badge.text}
                            </span>
                        )}
                    </div>
                    {user.email && (
                        <div className="user-management__email">
                            {user.email}
                        </div>
                    )}
                    <div className="user-management__meta">
                        登録: {new Date(user.created_at).toLocaleString()}
                    </div>
                    <div className="user-management__meta">
                        更新: {user.updated_at ? new Date(user.updated_at).toLocaleString() : '---'}
                    </div>
                    <div className="user-management__meta">
                        最終ログイン: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '記録なし'}
                    </div>
                </div>

                <div className="user-management__card-right">
                    {isEditableRoleTarget && (
                        <div className="user-management__role-toggle-wrap">
                            <button
                                type="button"
                                className={`user-management__role-toggle-btn ${user.role !== 'admin' ? 'user-management__role-toggle-btn--active' : ''}`}
                                onClick={() => handleRoleChange(user, 'user')}
                                disabled={user.role !== 'admin'}
                            >
                                通常
                            </button>
                            <button
                                type="button"
                                className={`user-management__role-toggle-btn user-management__role-toggle-btn--admin ${user.role === 'admin' ? 'user-management__role-toggle-btn--active' : ''}`}
                                onClick={() => handleRoleChange(user, 'admin')}
                                disabled={user.role === 'admin'}
                            >
                                管理者
                            </button>
                        </div>
                    )}

                    <div className="user-management__card-actions-row">
                        {!isSuperAdmin(user) && (
                            <label className="user-management__master-toggle">
                                <input
                                    type="checkbox"
                                    checked={user.show_master_recipes || false}
                                    disabled={savingMasterTargets.has(user.id)}
                                    onChange={(e) => handleToggleMasterRecipeVisibility(user, e.target.checked)}
                                />
                                マスター表示
                            </label>
                        )}

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenLoginLogs(user)}
                            className="user-management__action-btn"
                        >
                            ログイン履歴
                        </Button>
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
                            className="user-management__action-btn"
                        >
                            パスワード再設定
                        </Button>

                        {!isSuperAdmin(user) && currentUser?.id !== user.id && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setDeleteTarget(user)}
                                className="user-management__action-btn"
                            >
                                削除
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        );
    };

    return (
        <div className={`user-management${isNarrow ? ' user-management--narrow' : ''}`}>
            <div ref={innerRef} className="user-management__inner">
                <div className="user-management__header">
                    <h2>ユーザー管理</h2>
                    <Button variant="ghost" onClick={onBack}>戻る</Button>
                </div>

                {error && (
                    <div style={{ padding: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '20px' }}>{error}</div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>読み込み中...</div>
                ) : (
                    <div className="user-management__content">
                        {admins.length > 0 && (
                            <div>
                                <h3 className="user-management__section-title user-management__section-title--admin">管理者</h3>
                                <div className="user-management__list">
                                    {admins.map(u => (
                                        <UserCard
                                            key={u.id}
                                            user={u}
                                            isAdmin={true}
                                            isSuperAdmin={isSuperAdmin}
                                            currentUser={currentUser}
                                            handleRoleChange={handleRoleChange}
                                            savingMasterTargets={savingMasterTargets}
                                            handleToggleMasterRecipeVisibility={handleToggleMasterRecipeVisibility}
                                            handleOpenLoginLogs={handleOpenLoginLogs}
                                            setResetTarget={setResetTarget}
                                            setResetPw1={setResetPw1}
                                            setResetPw2={setResetPw2}
                                            setResetError={setResetError}
                                            setResetSuccess={setResetSuccess}
                                            setDeleteTarget={setDeleteTarget}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <h3 className="user-management__section-title user-management__section-title--default">登録ユーザー</h3>
                            <div className="user-management__list">
                                {regulars.length > 0 ? (
                                    regulars.map(u => (
                                        <UserCard
                                            key={u.id}
                                            user={u}
                                            isAdmin={false}
                                            isSuperAdmin={isSuperAdmin}
                                            currentUser={currentUser}
                                            handleRoleChange={handleRoleChange}
                                            savingMasterTargets={savingMasterTargets}
                                            handleToggleMasterRecipeVisibility={handleToggleMasterRecipeVisibility}
                                            handleOpenLoginLogs={handleOpenLoginLogs}
                                            setResetTarget={setResetTarget}
                                            setResetPw1={setResetPw1}
                                            setResetPw2={setResetPw2}
                                            setResetError={setResetError}
                                            setResetSuccess={setResetSuccess}
                                            setDeleteTarget={setDeleteTarget}
                                        />
                                    ))
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
                            対象: {formatDisplayId(resetTarget?.display_id || resetTarget?.email || resetTarget?.id)}
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

                <Modal
                    isOpen={!!logTarget}
                    onClose={() => setLogTarget(null)}
                    title="ログイン履歴"
                    size="medium"
                >
                    <div style={{ color: 'var(--text-color)', lineHeight: 1.5, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #ddd' }}>
                            対象: {formatDisplayId(logTarget?.display_id || logTarget?.email || logTarget?.id)}
                        </div>

                        {isLoadingLogs ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>読み込み中...</div>
                        ) : loginLogs.length > 0 ? (
                            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>日時</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loginLogs.map((log, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '8px' }}>
                                                    {new Date(log.login_at).toLocaleString('ja-JP', {
                                                        year: 'numeric', month: '2-digit', day: '2-digit',
                                                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                                                    })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#666', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                ログイン履歴はありません<br />
                                <span style={{ fontSize: '0.85rem' }}>※機能追加前の履歴、または一度もログインしていない場合は表示されません</span>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <Button variant="secondary" onClick={() => setLogTarget(null)}>
                                閉じる
                            </Button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={!!deleteTarget}
                    onClose={() => { if (!isDeleting) setDeleteTarget(null); }}
                    title="ユーザーの削除確認"
                    size="small"
                >
                    <div style={{ color: '#333', lineHeight: 1.5 }}>
                        <div style={{ marginBottom: '16px' }}>
                            以下のユーザーを完全に削除します。この操作は取り消せません。よろしいですか？
                        </div>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                            対象: {formatDisplayId(deleteTarget?.display_id || deleteTarget?.email || deleteTarget?.id)}
                        </div>
                        {deleteTarget?.email && (
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px', wordBreak: 'break-all' }}>
                                {deleteTarget.email}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <Button
                                variant="ghost"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                            >
                                キャンセル
                            </Button>
                            <Button
                                variant="danger"
                                isLoading={isDeleting}
                                onClick={handleDeleteUser}
                            >
                                削除する
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </div>
    );
};
