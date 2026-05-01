import './MaintenancePage.css';

export function MaintenancePage({ message }) {
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
      </div>
    </div>
  );
}
