const n=`.maintenance-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 1.5rem;
}

.maintenance-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 3rem 2.5rem;
  text-align: center;
  max-width: 420px;
  width: 100%;
  backdrop-filter: blur(12px);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
}

.maintenance-logo {
  width: 120px;
  height: auto;
  opacity: 0.9;
  margin-bottom: 1.5rem;
}

.maintenance-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  animation: spin-slow 4s linear infinite;
}

@keyframes spin-slow {
  0%   { transform: rotate(0deg); }
  25%  { transform: rotate(-15deg); }
  75%  { transform: rotate(15deg); }
  100% { transform: rotate(0deg); }
}

.maintenance-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 1.25rem;
  letter-spacing: 0.02em;
}

.maintenance-message {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.8;
  white-space: pre-line;
  margin: 0 0 2rem;
}

.maintenance-footer {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 1.25rem;
}

/* 管理者向け：メンテナンス中バナー */
.maintenance-admin-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #d97706;
  color: #fff;
  text-align: center;
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.maintenance-admin-banner button {
  background: rgba(255,255,255,0.25);
  border: 1px solid rgba(255,255,255,0.5);
  color: #fff;
  border-radius: 4px;
  padding: 0.2rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.maintenance-admin-banner button:hover {
  background: rgba(255,255,255,0.4);
}
`;export{n as default};
