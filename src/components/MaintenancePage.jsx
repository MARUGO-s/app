import { useState } from 'react';
import './MaintenancePage.css';

export function MaintenancePage({
  message,
  onAdminLogin,
  adminLoginError = '',
  isAdminLoggingIn = false,
}) {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');
    try {
      await onAdminLogin?.({ email: loginId, password });
    } catch (error) {
      setLocalError(error?.message || '管理者ログインに失敗しました。');
    }
  };

  const closeLogin = () => {
    if (isAdminLoggingIn) return;
    setIsLoginOpen(false);
    setLocalError('');
    setPassword('');
  };

  const errorMessage = localError || adminLoginError;

  return (
    <div className="maintenance-page">
      <div className="maintenance-card">
        <img
          className="maintenance-logo"
          src={`${import.meta.env.BASE_URL}header-logo.png`}
          alt="Recipe Management"
        />
        <div className="maintenance-icon">🔧</div>
        <h1 className="maintenance-title">メンテナンス中</h1>
        <p className="maintenance-message">
          {message || 'ただいまシステムのメンテナンスを行っています。\nしばらくしてから再度アクセスしてください。'}
        </p>
        <div className="maintenance-footer">
          ご不便をおかけして申し訳ございません
        </div>
        {onAdminLogin && (
          <button
            type="button"
            className="maintenance-admin-login-button"
            onClick={() => setIsLoginOpen(true)}
          >
            管理者ログイン
          </button>
        )}
      </div>

      {isLoginOpen && (
        <div className="maintenance-login-overlay" role="presentation" onMouseDown={closeLogin}>
          <div
            className="maintenance-login-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-login-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="maintenance-login-close"
              onClick={closeLogin}
              aria-label="閉じる"
              disabled={isAdminLoggingIn}
            >
              ×
            </button>
            <h2 id="maintenance-login-title">管理者ログイン</h2>
            <p className="maintenance-login-note">
              登録済みの管理者アカウントでログインしてください。
            </p>
            {errorMessage && (
              <div className="maintenance-login-error">
                {errorMessage}
              </div>
            )}
            <form className="maintenance-login-form" onSubmit={handleSubmit}>
              <label>
                <span>ログインID</span>
                <input
                  type="email"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  autoComplete="username"
                  placeholder="name@example.com"
                  disabled={isAdminLoggingIn}
                  required
                />
              </label>
              <label>
                <span>パスワード</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="パスワード"
                  disabled={isAdminLoggingIn}
                  required
                />
              </label>
              <button
                type="submit"
                className="maintenance-login-submit"
                disabled={isAdminLoggingIn}
              >
                {isAdminLoggingIn ? '確認中...' : 'ログイン'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
