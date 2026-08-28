import React from 'react';

/**
 * 表示名の末尾にある「_と8桁の英数字（自動生成ID）」部分を薄く表示するヘルパー関数
 */
export const formatDisplayId = (displayId, fallback = '') => {
    const str = String(displayId || fallback || '');
    if (!str) return null;

    // UUID起因の8桁の文字 + _ かを判定
    const match = str.match(/(.*)(_[a-zA-Z0-9]{8})$/);
    if (match) {
        return (
            <>
                {match[1]}
                <span style={{ opacity: 0.45, fontSize: '0.9em', fontWeight: 'normal' }}>{match[2]}</span>
            </>
        );
    }
    return str;
};
