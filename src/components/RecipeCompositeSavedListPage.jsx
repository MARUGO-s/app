import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { compositeRecipeService } from '../services/compositeRecipeService';
import './RecipeCompositeCostPage.css';

const formatYen = (value) => {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return '—';
    return `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

export const RecipeCompositeSavedListPage = ({ onBack, onOpenEditor }) => {
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

    return (
        <div className="composite-cost-page">
            <div className="composite-cost-page__header">
                <Button variant="secondary" onClick={onBack}>← 合成原価ページに戻る</Button>
            </div>

            <Card className="composite-cost-page__hero">
                <h2 className="section-title composite-cost-page__title">保存済み合成レシピ</h2>
                <p className="composite-cost-page__desc">保存した組み合わせを開いて、使用グラムを再編集できます。</p>
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
                    {rows.map((row) => (
                        <Card key={row.id} className="composite-cost-page__saved-item">
                            <div className="composite-cost-page__saved-main">
                                <strong>{row.dish_name}</strong>
                                <span>合成原価: {formatYen(row.total_cost_tax_included)}</span>
                                <span>更新: {new Date(row.updated_at || row.created_at).toLocaleString()}</span>
                            </div>
                            <div className="composite-cost-page__saved-actions">
                                <Button type="button" variant="secondary" onClick={() => onOpenEditor?.(row.id)}>
                                    編集を開く
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleDelete(row.id)}
                                    disabled={deletingId === row.id}
                                >
                                    {deletingId === row.id ? '削除中...' : '削除'}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
