import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { useAuth } from '../contexts/useAuth';

export const PasswordResetPage = () => {
    const { updatePassword, finishPasswordRecovery, logout } = useAuth();
    const [password, setPassword] = React.useState('');
    const [password2, setPassword2] = React.useState('');
    const [error, setError] = React.useState('');
    const [success, setSuccess] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!password || password.length < 8) {
            setError('パスワードは8文字以上にしてください');
            return;
        }
        if (password !== password2) {
            setError('パスワードが一致しません');
            return;
        }

        setIsSubmitting(true);
        try {
            await updatePassword(password);
            setSuccess('パスワードを更新しました');
            finishPasswordRecovery();
        } catch (e2) {
            console.error(e2);
            setError(e2.message || '更新に失敗しました');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#353535', padding: '20px' }}>
            <Card style={{ width: '100%', maxWidth: '420px', padding: '2rem', backgroundColor: 'white', color: '#333' }}>
                <h2 style={{ textAlign: 'center', color: 'var(--color-primary)', marginBottom: '1rem' }}>パスワード再設定</h2>
                <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: 1.5, marginTop: 0 }}>
                    新しいパスワードを設定してください。
                </p>

                {error && (
                    <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                        {error}
                    </div>
                )}
                {success && (
                    <div style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                        {success}
                    </div>
                )}

                <form onSubmit={onSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>新しいパスワード</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="8文字以上"
                            autoComplete="new-password"
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                            required
                        />
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>確認</label>
                        <input
                            type="password"
                            value={password2}
                            onChange={(e) => setPassword2(e.target.value)}
                            placeholder="もう一度入力"
                            autoComplete="new-password"
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                            required
                        />
                    </div>

                    <Button type="submit" variant="primary" style={{ width: '100%', padding: '12px', fontSize: '1.05rem' }} disabled={isSubmitting}>
                        更新する
                    </Button>
                </form>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <Button variant="ghost" onClick={() => { finishPasswordRecovery(); }} style={{ flex: 1 }}>
                        後で行う
                    </Button>
                    <Button variant="ghost" onClick={logout} style={{ flex: 1 }}>
                        ログアウト
                    </Button>
                </div>
            </Card>
        </div>
    );
};
