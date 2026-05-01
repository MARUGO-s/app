const e=`import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { compositeRecipeService } from '../services/compositeRecipeService';
import { useAuth } from '../contexts/useAuth';
import './RecipeCompositeCostPage.css';

const formatYen = (value) => {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return '—';
    return \`¥\${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}\`;
};

export const RecipeCompositeSavedListPage = ({ onBack, onOpenTop, onOpenEditor }) => {
    const { user } = useAuth();
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [deletingId, setDeletingId] = React.useState(null);

    React.useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError('');
            try {
                const list = await compositeRecipeService.listSets();
                if (cancelled) return;
                setRows(Array.isArray(list) ? list : []);
            } catch (e) {
                if (cancelled) return;
                setRows([]);
                setError(e?.message || '保存済み合成レシピの取得に失敗しました。');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm('この保存済み合成レシピを削除しますか？')) return;
        try {
            setDeletingId(id);
            await compositeRecipeService.deleteSet(id);
            setRows((prev) => prev.filter((row) => row.id !== id));
        } catch (e) {
            setError(e?.message || '削除に失敗しました。');
        } finally {
            setDeletingId(null);
        }
    };

    const handleToggleShare = async (row) => {
        const isOwner = String(row?.created_by || '') === String(user?.id || '');
        if (!isOwner) return;
        try {
            setDeletingId(row.id);
            await compositeRecipeService.setPublicVisibility(row.id, !(row.is_public === true));
            setRows((prev) => prev.map((item) => (
                item.id === row.id
                    ? { ...item, is_public: !(row.is_public === true) }
                    : item
            )));
        } catch (e) {
            setError(e?.message || '共有設定の更新に失敗しました。');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="composite-cost-page">
            <div className="composite-cost-page__header">
                <Button variant="secondary" onClick={onBack}>← 合成原価ページに戻る</Button>
                <Button variant="secondary" onClick={onOpenTop}>← トップページに戻る</Button>
            </div>

            <Card className="composite-cost-page__hero composite-cost-page__saved-hero">
                <div className="composite-cost-page__saved-hero-head">
                    <div className="composite-cost-page__saved-hero-head-left">
                        <span className="composite-cost-page__saved-hero-badge">COMPOSITE LIBRARY</span>
                        <h2 className="section-title composite-cost-page__title composite-cost-page__saved-title">保存済み合成レシピ</h2>
                    </div>
                    <span className="composite-cost-page__saved-hero-count">
                        {loading ? '読み込み中...' : \`\${rows.length}件\`}
                    </span>
                </div>
                <div className="composite-cost-page__saved-hero-note">
                    保存した組み合わせを開いて、使用グラムを再編集できます。
                </div>
            </Card>

            {loading && (
                <Card className="composite-cost-page__placeholder">保存済みデータを読み込み中です。</Card>
            )}

            {!loading && error && (
                <Card className="composite-cost-page__error" role="alert">{error}</Card>
            )}

            {!loading && !error && rows.length === 0 && (
                <Card className="composite-cost-page__placeholder">まだ保存された合成レシピがありません。</Card>
            )}

            {!loading && !error && rows.length > 0 && (
                <div className="composite-cost-page__saved-list">
                    {rows.map((row) => {
                        const isOwner = String(row?.created_by || '') === String(user?.id || '');
                        return (
                        <Card
                            key={row.id}
                            className={\`composite-cost-page__saved-item composite-cost-page__saved-item--clickable \${!isOwner ? 'composite-cost-page__saved-item--shared' : ''}\`}
                            onClick={() => { onOpenEditor?.(row.id); }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onOpenEditor?.(row.id);
                                }
                            }}
                        >
                            <div className="composite-cost-page__saved-main">
                                <strong>{row.dish_name}</strong>
                                <div className="composite-cost-page__saved-meta">
                                    <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--cost">
                                        <em>合成原価</em>
                                        <b>{formatYen(row.total_cost_tax_included)}</b>
                                    </span>
                                    <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                        <em>更新</em>
                                        <b>{new Date(row.updated_at || row.created_at).toLocaleString()}</b>
                                    </span>
                                    <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                        <em>共有</em>
                                        <b>{row.is_public ? 'ON' : 'OFF'}</b>
                                    </span>
                                    {!isOwner && (
                                        <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                            <em>権限</em>
                                            <b>閲覧のみ</b>
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="composite-cost-page__saved-actions">
                                {isOwner ? (
                                    <>
                                        <Button type="button" variant="secondary" onClick={(e) => { e.stopPropagation(); onOpenEditor?.(row.id); }}>
                                            編集を開く
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className={row.is_public ? 'composite-share-btn composite-share-btn--on' : 'composite-share-btn composite-share-btn--off'}
                                            onClick={(e) => { e.stopPropagation(); handleToggleShare(row); }}
                                            disabled={deletingId === row.id}
                                        >
                                            {row.is_public ? '共有をOFF' : '共有をON'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="danger"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
                                            disabled={deletingId === row.id}
                                        >
                                            {deletingId === row.id ? '削除中...' : '削除'}
                                        </Button>
                                    </>
                                ) : (
                                    <Button type="button" variant="secondary" onClick={(e) => { e.stopPropagation(); onOpenEditor?.(row.id); }}>
                                        閲覧を開く（共有表示）
                                    </Button>
                                )}
                            </div>
                        </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
`;export{e as default};
