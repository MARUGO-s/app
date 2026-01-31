import React, { useState, useEffect } from 'react';
import { userService } from '../services/userService';
import { Button } from './Button';
import { Card } from './Card';

export const UserManagement = ({ onBack }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await userService.fetchAllUsers();

            // Merge with LocalStorage preferences
            const mergedData = data.map(u => {
                const key = `user_prefs_${u.id}`;
                const localPrefs = JSON.parse(localStorage.getItem(key) || '{}');
                // Prefer local if exists, else DB
                if (localPrefs.show_master_recipes !== undefined) {
                    return { ...u, show_master_recipes: localPrefs.show_master_recipes };
                }
                return u;
            });

            setUsers(mergedData);
        } catch (err) {
            console.error(err);
            setError('ユーザー一覧の取得に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    const [deleteTarget, setDeleteTarget] = useState(null); // User object to delete

    const confirmDelete = async () => {
        if (!deleteTarget) return;

        try {
            await userService.deleteUser(deleteTarget.id);
            setUsers(users.filter(u => u.id !== deleteTarget.id));
            setDeleteTarget(null); // Close modal
        } catch (err) {
            console.error(err);
            // Show specific error if possible
            alert(`削除に失敗しました: ${err.message || '不明なエラー'}`);
        }
    };

    const admins = users.filter(u => u.id === 'admin');
    const regulars = users.filter(u => u.id !== 'admin');

    const UserCard = ({ user, isAdmin }) => (
        <Card key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: 'white' }}>
            <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#333' }}>
                    {user.id} {isAdmin && <span style={{ fontSize: '0.8rem', backgroundColor: '#e0e0e0', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', color: '#555' }}>管理者</span>}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                    登録: {new Date(user.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px' }}>
                    最終ログイン: {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '---'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px' }}>
                    レシピ数: <strong>{user.recipeCount || 0}</strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '4px' }}>
                    Pass: {user.password}
                </div>
            </div>

            {!isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#555' }}>
                        <input
                            type="checkbox"
                            checked={user.show_master_recipes || false}
                            onChange={async (e) => {
                                const newVal = e.target.checked;
                                // 1. Update Local State immediately
                                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, show_master_recipes: newVal } : u));

                                // 2. Save to LocalStorage
                                try {
                                    const key = `user_prefs_${user.id}`;
                                    const prefs = JSON.parse(localStorage.getItem(key) || '{}');
                                    prefs.show_master_recipes = newVal;
                                    localStorage.setItem(key, JSON.stringify(prefs));
                                } catch (err) { console.error(err); }

                                // 3. Update DB
                                try {
                                    await userService.updateUser(user.id, { show_master_recipes: newVal });
                                } catch (err) { console.error(err); }
                            }}
                        />
                        マスターレシピ表示
                    </label>
                    <Button variant="danger" onClick={() => setDeleteTarget(user)}>削除</Button>
                </div>
            )}
        </Card>
    );

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: 'var(--text-color)' }}>
                <h2>ユーザー管理</h2>
                <Button variant="ghost" onClick={onBack}>戻る</Button>
            </div>

            {error && (
                <div style={{ padding: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '20px' }}>{error}</div>
            )}

            {/* Delete Modal */}
            {deleteTarget && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', backgroundColor: 'white', color: '#333' }}>
                        <h3 style={{ marginTop: 0, color: '#dc3545' }}>ユーザー削除</h3>
                        <p style={{ color: '#333' }}>
                            ユーザー「<strong>{deleteTarget.id}</strong>」を本当に削除しますか？<br />
                            <span style={{ fontSize: '0.9em', color: '#666' }}>※この操作は取り消せません。</span>
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
                            <Button variant="danger" onClick={confirmDelete}>削除する</Button>
                        </div>
                    </Card>
                </div>
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
        </div>
    );
};
