import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './Card';
import { Button } from './Button';

export const LoginPage = () => {
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [isRecoveryMode, setIsRecoveryMode] = useState(false); // Forgot Password mode

    // Login/Reg States
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [secretQuestion, setSecretQuestion] = useState(''); // For registration
    const [secretAnswer, setSecretAnswer] = useState('');     // For registration

    // Recovery States
    const [recoveryStep, setRecoveryStep] = useState(1); // 1: Input ID, 2: Answer Question, 3: New Pass
    const [recoveryQuestion, setRecoveryQuestion] = useState('');
    const [recoveryAnswer, setRecoveryAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const { login, register } = useAuth();

    // Services need to be imported or passed. Assuming userService is available or we add it to imports
    // IMPORTANT: Need to import userService at top. 
    // Since I can't add imports easily with replace_file_content in one go if sticking to bottom, 
    // I made sure userService is globally available or I will add the import in a separate step?
    // Actually, I can use the existing `import` block if I replace the whole file or use multi-replace.
    // For now, I will assume I need to ADD the import. I'll do that in a separate tool call to be safe 
    // OR if I am replacing the main body, I can't add import at top. 
    // Wait, I am replacing Component code. 
    // I will add `const { userService } = require('../services/userService');` equivalent or just expect it.
    // Actually, `LoginPage` uses `useAuth`. I should probably expose recovery methods via `useAuth` OR import `userService` here.
    // Let's import `userService` at the top in a separate edit. I will assume it's there for this code.

    // Correction: I must add the import first. But I am writing the logic now.
    // I will write the logic assuming `userService` is imported.

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (!userId.trim() || !password.trim()) {
            setError('IDとパスワードを入力してください');
            return;
        }

        try {
            await login(userId.trim(), password, rememberMe);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!userId.trim() || !password.trim() || !secretQuestion.trim() || !secretAnswer.trim()) {
            setError('すべての項目を入力してください');
            return;
        }

        try {
            // Updated register signature to accept security Q&A (Need to update AuthContext too!)
            // Or use userService directly? AuthContext wraps register.
            // Let's update AuthContext to handle extra fields.
            await register(userId.trim(), password, secretQuestion.trim(), secretAnswer.trim());
            setSuccessMsg('登録しました！ログインしてください。');
            setIsLoginMode(true);
            setUserId('');
            setPassword('');
        } catch (err) {
            setError(err.message);
        }
    };

    const handleRecoverySubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            if (recoveryStep === 1) {
                // Fetch Question
                // import { userService } from '../services/userService'; MUST BE PRESENT
                const q = await import('../services/userService').then(m => m.userService.getSecurityQuestion(userId.trim()));
                if (!q) throw new Error("秘密の質問が設定されていません");
                setRecoveryQuestion(q);
                setRecoveryStep(2);
            } else if (recoveryStep === 2) {
                // Verify Answer
                const isValid = await import('../services/userService').then(m => m.userService.verifySecurityAnswer(userId.trim(), recoveryAnswer.trim()));
                if (isValid) {
                    setRecoveryStep(3);
                } else {
                    setError("回答が間違っています");
                }
            } else if (recoveryStep === 3) {
                // Reset Password
                if (!newPassword.trim()) {
                    setError("新しいパスワードを入力してください");
                    return;
                }
                await import('../services/userService').then(m => m.userService.resetPassword(userId.trim(), newPassword.trim()));
                setSuccessMsg("パスワードを再設定しました。ログインしてください。");
                setIsRecoveryMode(false);
                setIsLoginMode(true);
                setRecoveryStep(1);
                // Clear fields
                setUserId('');
                setPassword('');
            }
        } catch (err) {
            setError(err.message || "エラーが発生しました");
        }
    };

    if (isRecoveryMode) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#353535', padding: '20px' }}>
                <Card style={{ width: '100%', maxWidth: '400px', padding: '2rem', backgroundColor: 'white', color: '#333' }}>
                    <h2 style={{ textAlign: 'center', color: 'var(--color-primary)', marginBottom: '1.5rem' }}>パスワードの再設定</h2>

                    {error && <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

                    <form onSubmit={handleRecoverySubmit}>
                        {recoveryStep === 1 && (
                            <>
                                <p style={{ marginBottom: '1rem' }}>ユーザーIDを入力してください。</p>
                                <input
                                    type="text"
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    placeholder="ユーザーID"
                                    style={{ width: '100%', padding: '12px', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                    required
                                />
                                <Button type="submit" variant="primary" style={{ width: '100%' }}>次へ</Button>
                            </>
                        )}
                        {recoveryStep === 2 && (
                            <>
                                <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>質問: {recoveryQuestion}</p>
                                <input
                                    type="text"
                                    value={recoveryAnswer}
                                    onChange={(e) => setRecoveryAnswer(e.target.value)}
                                    placeholder="回答を入力"
                                    style={{ width: '100%', padding: '12px', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                    required
                                />
                                <Button type="submit" variant="primary" style={{ width: '100%' }}>回答する</Button>
                            </>
                        )}
                        {recoveryStep === 3 && (
                            <>
                                <p style={{ marginBottom: '1rem' }}>新しいパスワードを入力してください。</p>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="新しいパスワード"
                                    style={{ width: '100%', padding: '12px', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                    required
                                />
                                <Button type="submit" variant="primary" style={{ width: '100%' }}>変更する</Button>
                            </>
                        )}
                    </form>

                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                        <button onClick={() => { setIsRecoveryMode(false); setIsLoginMode(true); setError(''); }} style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline', cursor: 'pointer' }}>
                            ログインに戻る
                        </button>
                    </div>
                </Card>
            </div>
        );
    }

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
                maxWidth: '400px',
                padding: '2rem',
                backgroundColor: 'white',
                color: '#333'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontFamily: '"Pinyon Script", cursive', fontSize: '3rem', margin: 0, color: 'var(--color-primary)' }}>
                        Recipe<br />Management
                    </h1>
                    <p style={{ color: '#666', marginTop: '0.5rem' }}>
                        {isLoginMode ? 'ログイン' : '新規登録'}
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

                <form onSubmit={isLoginMode ? handleLoginSubmit : handleRegisterSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>ユーザーID</label>
                        <input
                            type="text"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            placeholder="ユーザーID"
                            autoComplete="username"
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>パスワード</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="パスワード"
                            autoComplete={isLoginMode ? "current-password" : "new-password"}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                            required
                        />
                    </div>

                    {!isLoginMode && (
                        <>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>
                                    秘密の質問 <span style={{ fontSize: '0.8em', fontWeight: 'normal' }}>(パスワード忘失時に使用)</span>
                                </label>
                                <select
                                    value={secretQuestion}
                                    onChange={(e) => setSecretQuestion(e.target.value)}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                                    required
                                >
                                    <option value="">質問を選択してください</option>
                                    <option value="出身地は？">出身地は？</option>
                                    <option value="母親の旧姓は？">母親の旧姓は？</option>
                                    <option value="初めて飼ったペットの名前は？">初めて飼ったペットの名前は？</option>
                                    <option value="好きな食べ物は？">好きな食べ物は？</option>
                                    <option value="座右の銘は？">座右の銘は？</option>
                                </select>
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#333' }}>質問の答え</label>
                                <input
                                    type="text"
                                    value={secretAnswer}
                                    onChange={(e) => setSecretAnswer(e.target.value)}
                                    placeholder="ひらがな等で覚えやすく"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', color: '#333', backgroundColor: '#fff' }}
                                    required
                                />
                            </div>
                        </>
                    )}

                    {isLoginMode && (
                        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#333' }}>
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
                                />
                                <span>ログイン情報を記録</span>
                            </label>

                            <button
                                type="button"
                                onClick={() => { setIsRecoveryMode(true); setError(''); setSuccessMsg(''); setUserId(''); }}
                                style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
                            >
                                パスワードを忘れた場合
                            </button>
                        </div>
                    )}

                    <Button type="submit" variant="primary" style={{ width: '100%', padding: '12px', fontSize: '1.1rem' }}>
                        {isLoginMode ? 'ログイン' : '新規登録'}
                    </Button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <button
                        onClick={() => {
                            setIsLoginMode(!isLoginMode);
                            setError('');
                            setSuccessMsg('');
                            // Reset reg fields
                            setSecretQuestion('');
                            setSecretAnswer('');
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary)',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        {isLoginMode ? 'アカウントをお持ちでない方はこちら（新規登録）' : 'すでにアカウントをお持ちの方はこちら（ログイン）'}
                    </button>
                </div>
            </Card>
        </div>
    );
};
