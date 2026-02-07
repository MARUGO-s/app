import React, { useState } from 'react';
import { useAuth } from '../contexts/useAuth';
import { Card } from './Card';
import { Button } from './Button';

export const LoginPage = () => {
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [isResetMode, setIsResetMode] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayId, setDisplayId] = useState('');

    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [rememberMe, setRememberMe] = useState(false);

    React.useEffect(() => {
        const savedEmail = localStorage.getItem('savedEmail');
        const savedPassword = localStorage.getItem('savedPassword');
        if (savedEmail) {
            setEmail(savedEmail);
            if (savedPassword) {
                setPassword(savedPassword);
            }
            setRememberMe(true);
        }
    }, []);

    const { login, register, sendPasswordResetEmail } = useAuth();

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setIsSubmitting(true);
        try {
            await login(email.trim(), password);
            if (rememberMe) {
                localStorage.setItem('savedEmail', email.trim());
                localStorage.setItem('savedPassword', password);
            } else {
                localStorage.removeItem('savedEmail');
                localStorage.removeItem('savedPassword');
            }
        } catch (err) {
            setError(err.message || 'ログインに失敗しました');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setIsSubmitting(true);
        try {
            if (!displayId.trim()) {
                setError('表示IDを入力してください（例: yoshito）');
                return;
            }
            const result = await register(email.trim(), password, displayId.trim());
            if (result?.needsEmailConfirmation) {
                setSuccessMsg('確認メールを送信しました。メール内のリンクを開いてからログインしてください。');
            } else {
                setSuccessMsg('登録しました。ログインしてください。');
            }
            setIsLoginMode(true);
            setPassword('');
        } catch (err) {
            setError(err.message || '登録に失敗しました');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReset = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setIsSubmitting(true);
        try {
            await sendPasswordResetEmail(email.trim());
            setSuccessMsg('パスワード再設定メールを送信しました。メールをご確認ください。');
            setIsResetMode(false);
        } catch (err) {
            setError(err.message || '送信に失敗しました');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: '#353535',
            padding: '20px'
        }}>
            <Card style={{
                width: '100%',
                maxWidth: '420px',
                padding: '2rem',
                backgroundColor: 'white',
                color: '#333'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h1 style={{ fontFamily: '"Pinyon Script", cursive', fontSize: '3rem', margin: 0, color: 'var(--color-primary)' }}>
                        Recipe<br />Management
                    </h1>
                    <p style={{ color: '#666', marginTop: '0.5rem' }}>
                        {isResetMode ? 'パスワード再設定' : (isLoginMode ? 'ログイン' : '新規登録')}
                    </p>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                        {error}
                    </div>
                )}

                {successMsg && (
                    <div style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '10px', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                        {successMsg}
                    </div>
                )}

                <form onSubmit={isResetMode ? handleReset : (isLoginMode ? handleLoginSubmit : handleRegisterSubmit)}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>メールアドレス</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            autoComplete="username"
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                            required
                        />
                    </div>

                    {!isResetMode && (
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>パスワード</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="パスワード"
                                autoComplete="current-password"
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                                required
                            />
                        </div>
                    )}

                    {!isResetMode && !isLoginMode && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>
                                表示ID <span style={{ fontSize: '0.85em', fontWeight: 'normal', color: '#666' }}>(例: yoshito / staff)</span>
                            </label>
                            <input
                                type="text"
                                value={displayId}
                                onChange={(e) => setDisplayId(e.target.value)}
                                placeholder="表示ID"
                                autoComplete="username"
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                                required
                            />
                            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '6px', lineHeight: 1.4 }}>
                                既存データ（在庫/棚卸し/レシピ）の引き継ぎに使います。あとから変更しないでください。
                            </div>
                        </div>
                    )}
                    {isLoginMode && !isResetMode && (
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                            <input
                                type="checkbox"
                                id="rememberMe"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                style={{ marginRight: '8px', width: 'auto', cursor: 'pointer' }}
                            />
                            <label htmlFor="rememberMe" style={{ color: '#333', cursor: 'pointer', userSelect: 'none' }}>ログイン情報を保存する</label>
                        </div>
                    )}

                    <Button type="submit" variant="primary" style={{ width: '100%', padding: '12px', fontSize: '1.05rem' }} disabled={isSubmitting}>
                        {isResetMode ? 'メールを送信' : (isLoginMode ? 'ログイン' : '新規登録')}
                    </Button>
                </form>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {!isResetMode ? (
                        <button
                            type="button"
                            onClick={() => {
                                setIsResetMode(true);
                                setError('');
                                setSuccessMsg('');
                            }}
                            style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            パスワードを忘れた場合
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setIsResetMode(false);
                                setError('');
                                setSuccessMsg('');
                            }}
                            style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            戻る
                        </button>
                    )}

                    {!isResetMode && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsLoginMode(!isLoginMode);
                                setError('');
                                setSuccessMsg('');
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            {isLoginMode ? '新規登録' : 'ログイン'}
                        </button>
                    )}
                </div>
            </Card>
        </div>
    );
};
