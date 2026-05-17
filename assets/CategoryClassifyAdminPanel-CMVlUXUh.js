const a=`import React from 'react';
import { Button } from './Button';

export const CategoryClassifyAdminPanel = ({ loading, status, onRun }) => (
    <div className="voice-feature-card" style={{ marginBottom: '1rem' }}>
        <div className="voice-feature-card__left">
            <div className="voice-feature-card__title">📁 レシピのカテゴリー（一括変換）</div>
            <div className="voice-feature-card__desc">
                ログイン中のアカウントが所有するレシピのみ対象です。既存カテゴリーを含め内容を Gemini が再判定し、固定カテゴリー（料理 / 煮込み料理 / 温菜 / 冷菜 / スープ / テリーヌ / ソース / ドレッシング / ソース・ドレッシング / 付け合わせ・飾り / デザート・お菓子 / パン / 取り込み / その他）に上書きします。
            </div>
        </div>
        <div className="voice-feature-card__right">
            <Button variant="primary" onClick={onRun} disabled={loading}>
                {loading ? '変換中...' : 'カテゴリーを一括変換'}
            </Button>
        </div>
        {status?.message && (
            <div className={\`status-msg \${status.type || 'info'}\`} style={{ marginTop: '10px', width: '100%' }}>
                {status.message}
            </div>
        )}
    </div>
);
`;export{a as default};
