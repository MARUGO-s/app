import React from 'react';
import { Button } from './Button';

export const CountryClassifyAdminPanel = ({ loading, status, onRun }) => (
    <div className="voice-feature-card" style={{ marginBottom: '1rem' }}>
        <div className="voice-feature-card__left">
            <div className="voice-feature-card__title">🌍 レシピの国（一括推定）</div>
            <div className="voice-feature-card__desc">
                国が未設定のレシピを Gemini で解析し、由来国（日本・イタリアなど）を自動入力します。既に入力済みの国は変更しません。
            </div>
        </div>
        <div className="voice-feature-card__right">
            <Button variant="primary" onClick={onRun} disabled={loading}>
                {loading ? '推定中...' : '国を一括推定'}
            </Button>
        </div>
        {status?.message && (
            <div className={`status-msg ${status.type || 'info'}`} style={{ marginTop: '10px', width: '100%' }}>
                {status.message}
            </div>
        )}
    </div>
);
