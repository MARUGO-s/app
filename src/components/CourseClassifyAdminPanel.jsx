import React from 'react';
import { Button } from './Button';

export const CourseClassifyAdminPanel = ({ loading, status, onRun }) => (
    <div className="voice-feature-card" style={{ marginBottom: '1rem' }}>
        <div className="voice-feature-card__left">
            <div className="voice-feature-card__title">🍽️ レシピのコース（一括変換）</div>
            <div className="voice-feature-card__desc">
                ログイン中のアカウントが所有するレシピのみ対象です。コースを Gemini が再判定し、固定12種（アミューズ / 前菜 / スープ / 魚料理 / 肉料理 / デザート / プティフール / 食パン / 仕込み / 軽食・デリ / タパス・小皿 / その他）に上書きします。カテゴリー（種類）とは別の「提供順・用途」です。
            </div>
        </div>
        <div className="voice-feature-card__right">
            <Button variant="primary" onClick={onRun} disabled={loading}>
                {loading ? '変換中...' : 'コースを一括変換'}
            </Button>
        </div>
        {status?.message && (
            <div className={`status-msg ${status.type || 'info'}`} style={{ marginTop: '10px', width: '100%' }}>
                {status.message}
            </div>
        )}
    </div>
);
