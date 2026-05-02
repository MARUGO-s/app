const e=`import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { compositeRecipeService } from '../services/compositeRecipeService';
import { categoryCostOverrideService } from '../services/categoryCostOverrideService';
import { recipeService } from '../services/recipeService';
import { useAuth } from '../contexts/useAuth';
import { computeCompositeSnapshotTotals, toFiniteNumber } from '../utils/compositeCostUtils';
import './RecipeCompositeCostPage.css';

const formatYen = (value) => {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return '—';
    return \`¥\${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}\`;
};

const normalizeSharePermission = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'editor') return 'editor';
    if (v === 'copier') return 'copier';
    return 'viewer';
};

const sharePermissionLabel = (value) => {
    const normalized = normalizeSharePermission(value);
    if (normalized === 'editor') return '直接編集可';
    if (normalized === 'copier') return '複製保存可';
    return '閲覧のみ';
};

const formatSignedYen = (value) => {
    const n = toFiniteNumber(value);
    if (!Number.isFinite(n)) return '—';
    const sign = n >= 0 ? '+' : '-';
    return \`\${sign}\${formatYen(Math.abs(n))}\`;
};

const formatSignedPercent = (value) => {
    const n = toFiniteNumber(value);
    if (!Number.isFinite(n)) return '—';
    return \`\${n >= 0 ? '+' : ''}\${n.toFixed(1)}%\`;
};

const buildSnapshotFromDetail = (detail = {}) => ({
    baseRecipeId: detail.base_recipe_id == null ? null : Number(detail.base_recipe_id),
    currentUsageAmount: detail.base_usage_amount == null ? '' : String(detail.base_usage_amount),
    salesPrice: detail.sales_price == null ? '' : String(detail.sales_price),
    salesCount: detail.sales_count == null ? '' : String(detail.sales_count),
    totalCompositeCost: detail.total_cost_tax_included,
    rows: (detail.items || []).map((item) => ({
        itemType: item.item_type === 'ingredient' ? 'ingredient' : 'recipe',
        recipeId: item.recipe_id == null ? '' : String(item.recipe_id),
        ingredient: item.ingredient_payload || null,
        usageAmount: item.usage_amount == null ? '' : String(item.usage_amount),
        usageUnit: item.ingredient_payload?.unit || '',
    })),
});

const computeSavedSetDrift = async (row) => {
    const detail = await compositeRecipeService.getSetDetail(row.id);
    const snapshot = buildSnapshotFromDetail(detail);
    if (!snapshot.baseRecipeId) {
        return { status: 'error' };
    }

    const baseRecipe = await recipeService.getRecipe(snapshot.baseRecipeId);
    const recipeIds = Array.from(new Set(
        snapshot.rows
            .filter((item) => (item?.itemType || 'recipe') === 'recipe')
            .map((item) => String(item.recipeId || '').trim())
            .filter(Boolean)
    ));

    const [baseOverrideMap, recipePairs] = await Promise.all([
        categoryCostOverrideService.fetchByRecipeId(snapshot.baseRecipeId).catch(() => new Map()),
        Promise.all(recipeIds.map(async (id) => {
            const [recipe, overrideMap] = await Promise.all([
                recipeService.getRecipe(id).catch(() => null),
                categoryCostOverrideService.fetchByRecipeId(id).catch(() => new Map()),
            ]);
            return { id, recipe, overrideMap };
        })),
    ]);

    const recipeDetailsById = {};
    const overrideMapsByRecipe = {
        [String(snapshot.baseRecipeId)]: baseOverrideMap || new Map(),
    };
    for (const pair of recipePairs) {
        if (pair.recipe) recipeDetailsById[pair.id] = pair.recipe;
        overrideMapsByRecipe[pair.id] = pair.overrideMap || new Map();
    }

    const totals = computeCompositeSnapshotTotals({
        baseRecipe,
        snapshot,
        recipeDetailsById,
        overrideMapsByRecipe,
    });
    const savedCost = toFiniteNumber(row.total_cost_tax_included ?? detail.total_cost_tax_included);
    const liveCost = toFiniteNumber(totals.totalCompositeCost);
    const diff = Number.isFinite(savedCost) && Number.isFinite(liveCost)
        ? liveCost - savedCost
        : NaN;
    const percent = Number.isFinite(savedCost) && savedCost !== 0 && Number.isFinite(diff)
        ? (diff / savedCost) * 100
        : NaN;

    return {
        status: 'ready',
        savedCost,
        liveCost,
        diff,
        percent,
        hasDrift: Number.isFinite(diff) && Math.abs(diff) >= 0.01,
        missingRecipeIds: totals.missingRecipeIds || [],
    };
};

export const RecipeCompositeSavedListPage = ({ onBack, onOpenTop, onOpenEditor }) => {
    const { user } = useAuth();
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [loadingDrifts, setLoadingDrifts] = React.useState(false);
    const [driftById, setDriftById] = React.useState({});
    const [error, setError] = React.useState('');
    const [deletingId, setDeletingId] = React.useState(null);

    React.useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError('');
            setDriftById({});
            setLoadingDrifts(false);
            try {
                const list = await compositeRecipeService.listSets();
                if (cancelled) return;
                const safeList = Array.isArray(list) ? list : [];
                setRows(safeList);
                setLoading(false);

                if (safeList.length > 0) {
                    setLoadingDrifts(true);
                    const pairs = await Promise.all(safeList.map(async (row) => {
                        try {
                            const drift = await computeSavedSetDrift(row);
                            return [row.id, drift];
                        } catch {
                            return [row.id, { status: 'error' }];
                        }
                    }));
                    if (cancelled) return;
                    setDriftById(Object.fromEntries(pairs));
                }
            } catch (e) {
                if (cancelled) return;
                setRows([]);
                setError(e?.message || '保存済み合成レシピの取得に失敗しました。');
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setLoadingDrifts(false);
                }
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
            setDriftById((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
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
            await compositeRecipeService.setShareSettings(row.id, {
                isPublic: !(row.is_public === true),
                sharePermission: row.share_permission || 'viewer',
            });
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

    const handleChangeSharePermission = async (row, nextPermission) => {
        const isOwner = String(row?.created_by || '') === String(user?.id || '');
        if (!isOwner) return;
        try {
            setDeletingId(row.id);
            await compositeRecipeService.setShareSettings(row.id, {
                isPublic: row.is_public === true,
                sharePermission: nextPermission,
            });
            setRows((prev) => prev.map((item) => (
                item.id === row.id
                    ? { ...item, share_permission: normalizeSharePermission(nextPermission) }
                    : item
            )));
        } catch (e) {
            setError(e?.message || '共有権限の更新に失敗しました。');
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
                                    {(() => {
                                        const drift = driftById[row.id];
                                        if (!drift && loadingDrifts) {
                                            return (
                                                <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--drift">
                                                    <em>原価変動</em>
                                                    <b>確認中</b>
                                                </span>
                                            );
                                        }
                                        if (!drift) return null;
                                        if (drift.status === 'error') {
                                            return (
                                                <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--drift composite-cost-page__saved-chip--drift-muted">
                                                    <em>原価変動</em>
                                                    <b>取得不可</b>
                                                </span>
                                            );
                                        }
                                        if (drift.missingRecipeIds?.length > 0) {
                                            return (
                                                <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--drift composite-cost-page__saved-chip--drift-muted">
                                                    <em>原価変動</em>
                                                    <b>一部取得不可</b>
                                                </span>
                                            );
                                        }
                                        const driftClass = drift.hasDrift
                                            ? (toFiniteNumber(drift.diff) >= 0
                                                ? 'composite-cost-page__saved-chip--drift-up'
                                                : 'composite-cost-page__saved-chip--drift-down')
                                            : 'composite-cost-page__saved-chip--drift-muted';
                                        return (
                                            <span className={\`composite-cost-page__saved-chip composite-cost-page__saved-chip--drift \${driftClass}\`}>
                                                <em>原価変動</em>
                                                <b>
                                                    {drift.hasDrift
                                                        ? \`\${formatSignedYen(drift.diff)} (\${formatSignedPercent(drift.percent)})\`
                                                        : '差分なし'}
                                                </b>
                                            </span>
                                        );
                                    })()}
                                    <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                        <em>更新</em>
                                        <b>{new Date(row.updated_at || row.created_at).toLocaleString()}</b>
                                    </span>
                                    <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                        <em>共有</em>
                                        <b>{row.is_public ? 'ON' : 'OFF'}</b>
                                    </span>
                                    <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                        <em>共有権限</em>
                                        <b>{sharePermissionLabel(row.share_permission)}</b>
                                    </span>
                                    <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                        <em>版</em>
                                        <b>v{Number(row.current_version_no || 1)}</b>
                                    </span>
                                    {!isOwner && (
                                        <span className="composite-cost-page__saved-chip composite-cost-page__saved-chip--updated">
                                            <em>権限</em>
                                            <b>{sharePermissionLabel(row.share_permission)}</b>
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
                                        <select
                                            className="composite-cost-page__select"
                                            value={normalizeSharePermission(row.share_permission)}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                handleChangeSharePermission(row, e.target.value);
                                            }}
                                            disabled={deletingId === row.id || !(row.is_public === true)}
                                            aria-label="共有権限の変更"
                                        >
                                            <option value="viewer">閲覧のみ</option>
                                            <option value="copier">複製保存可</option>
                                            <option value="editor">直接編集可</option>
                                        </select>
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
                                        {normalizeSharePermission(row.share_permission) === 'editor'
                                            ? '編集を開く（共有）'
                                            : (normalizeSharePermission(row.share_permission) === 'copier'
                                                ? '複製編集を開く'
                                                : '閲覧を開く（共有）')}
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
