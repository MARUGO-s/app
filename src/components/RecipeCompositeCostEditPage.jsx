import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { RecipeCompositeCostCalculator } from './RecipeCompositeCostCalculator';
import { compositeRecipeService } from '../services/compositeRecipeService';
import { recipeService } from '../services/recipeService';
import { useToast } from '../contexts/useToast';
import { useAuth } from '../contexts/useAuth';
import './RecipeCompositeCostPage.css';

const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
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

const formatYen = (value) => {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return '—';
    return `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const buildCalculatorStateFromSnapshot = (snapshot = {}) => ({
    currentUsageAmount: snapshot?.currentUsageAmount == null ? '' : String(snapshot.currentUsageAmount),
    salesPrice: snapshot?.salesPrice == null ? '' : String(snapshot.salesPrice),
    salesCount: snapshot?.salesCount == null ? '' : String(snapshot.salesCount),
    rows: (snapshot?.rows || []).map((item) => ({
        itemType: item?.itemType === 'ingredient' ? 'ingredient' : 'recipe',
        recipeId: item?.recipeId == null ? '' : String(item.recipeId),
        ingredient: item?.ingredient || null,
        usageAmount: item?.usageAmount == null ? '' : String(item.usageAmount),
        usageUnit: item?.usageUnit || item?.ingredient?.unit || '',
    })),
});

const buildSnapshotSummary = (snapshot = {}, recipeNameMap = new Map()) => {
    const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
    const baseRecipeId = snapshot?.baseRecipeId == null ? '' : String(snapshot.baseRecipeId);
    const baseRecipeTitle = recipeNameMap.get(baseRecipeId) || (baseRecipeId ? `レシピ#${baseRecipeId}` : '未設定');
    const itemLabels = rows.map((row, index) => {
        if (row?.itemType === 'ingredient' || row?.ingredient) {
            const ingredientName = String(row?.ingredient?.name || '').trim();
            const unit = row?.usageUnit || row?.ingredient?.unit || '';
            const amount = row?.usageAmount == null || row?.usageAmount === '' ? '未入力' : `${row.usageAmount}${unit}`;
            return `${index + 1}. 材料: ${ingredientName || '無名材料'} / ${amount}`;
        }
        const recipeId = String(row?.recipeId || '');
        const title = recipeNameMap.get(recipeId) || (recipeId ? `レシピ#${recipeId}` : '未設定');
        const amount = row?.usageAmount == null || row?.usageAmount === '' ? '未入力' : `${row.usageAmount}g`;
        return `${index + 1}. レシピ: ${title} / ${amount}`;
    });

    return {
        dishName: String(snapshot?.dishName || '').trim() || '名称未設定',
        baseRecipeId,
        baseRecipeTitle,
        currentUsageAmount: snapshot?.currentUsageAmount == null || snapshot?.currentUsageAmount === '' ? '未入力' : `${snapshot.currentUsageAmount}g`,
        salesPrice: formatYen(snapshot?.salesPrice),
        salesCount: snapshot?.salesCount == null || snapshot?.salesCount === '' ? '未入力' : `${snapshot.salesCount}`,
        totalCompositeCost: formatYen(snapshot?.totalCompositeCost),
        sharePermission: sharePermissionLabel(snapshot?.sharePermission),
        isPublic: snapshot?.isPublic === true ? 'ON' : 'OFF',
        rowCount: rows.length,
        itemLabels,
    };
};

export const RecipeCompositeCostEditPage = ({
    compositeId,
    onBack,
    onOpenRecipeDetail,
    replaceFromRecipeId = '',
    replaceToRecipeId = '',
}) => {
    const toast = useToast();
    const { user } = useAuth();
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [dishName, setDishName] = React.useState('');
    const [isPublic, setIsPublic] = React.useState(false);
    const [sharePermission, setSharePermission] = React.useState('viewer');
    const [currentVersionNo, setCurrentVersionNo] = React.useState(1);
    const [versions, setVersions] = React.useState([]);
    const [selectedVersionNo, setSelectedVersionNo] = React.useState('');
    const [loadingVersions, setLoadingVersions] = React.useState(false);
    const [restoringVersion, setRestoringVersion] = React.useState(false);
    const [previewLoading, setPreviewLoading] = React.useState(false);
    const [readOnlyPreview, setReadOnlyPreview] = React.useState(null);
    const [createdBy, setCreatedBy] = React.useState('');
    const [baseRecipe, setBaseRecipe] = React.useState(null);
    const [initialState, setInitialState] = React.useState(null);
    const [calculatorState, setCalculatorState] = React.useState(null);
    const [recipeNameMap, setRecipeNameMap] = React.useState(new Map());

    React.useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!compositeId) return;
            setLoading(true);
            setError('');
            try {
                const detail = await compositeRecipeService.getSetDetail(compositeId);
                if (cancelled) return;
                const fromId = String(replaceFromRecipeId || '').trim();
                const toId = String(replaceToRecipeId || '').trim();
                const shouldReplace = !!fromId && !!toId;
                const effectiveBaseRecipeId = shouldReplace && String(detail.base_recipe_id || '') === fromId
                    ? toId
                    : detail.base_recipe_id;

                const recipe = await recipeService.getRecipe(effectiveBaseRecipeId);
                if (cancelled) return;
                setBaseRecipe(recipe);
                setDishName(detail.dish_name || '');
                setIsPublic(detail.is_public === true);
                setSharePermission(String(detail.share_permission || 'viewer'));
                setCurrentVersionNo(Number(detail.current_version_no || 1));
                setCreatedBy(String(detail.created_by || ''));
                setInitialState({
                    currentUsageAmount: detail.base_usage_amount == null ? '' : String(detail.base_usage_amount),
                    salesPrice: detail.sales_price == null ? '' : String(detail.sales_price),
                    salesCount: detail.sales_count == null ? '' : String(detail.sales_count),
                    rows: (detail.items || []).map((item) => ({
                        itemType: item.item_type === 'ingredient' ? 'ingredient' : 'recipe',
                        recipeId: item.recipe_id == null
                            ? ''
                            : (
                                shouldReplace && String(item.recipe_id) === fromId
                                    ? toId
                                    : String(item.recipe_id)
                            ),
                        ingredient: item.ingredient_payload || null,
                        usageAmount: item.usage_amount == null ? '' : String(item.usage_amount),
                        usageUnit: item.ingredient_payload?.unit || '',
                    })),
                });
            } catch (e) {
                if (cancelled) return;
                setError(e?.message || '保存データの読み込みに失敗しました。');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [compositeId, replaceFromRecipeId, replaceToRecipeId]);

    React.useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!compositeId) return;
            setLoadingVersions(true);
            try {
                const list = await compositeRecipeService.listSetVersions(compositeId);
                if (cancelled) return;
                setVersions(Array.isArray(list) ? list : []);
            } catch {
                if (cancelled) return;
                setVersions([]);
            } finally {
                if (!cancelled) setLoadingVersions(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [compositeId]);

    const selectedVersion = React.useMemo(() => {
        const target = Number(selectedVersionNo);
        if (!Number.isFinite(target) || target < 1) return null;
        return versions.find((version) => Number(version.version_no) === target) || null;
    }, [versions, selectedVersionNo]);

    const currentWorkingSnapshot = React.useMemo(() => ({
        dishName: String(dishName || '').trim(),
        baseRecipeId: baseRecipe?.id ? Number(baseRecipe.id) : null,
        currentUsageAmount: calculatorState?.currentUsageAmount ?? initialState?.currentUsageAmount ?? '',
        salesPrice: calculatorState?.salesPrice ?? initialState?.salesPrice ?? '',
        salesCount: calculatorState?.salesCount ?? initialState?.salesCount ?? '',
        totalCompositeCost: calculatorState?.totalCompositeCost ?? null,
        isPublic,
        sharePermission,
        rows: calculatorState?.rows ?? initialState?.rows ?? [],
    }), [
        dishName,
        baseRecipe?.id,
        calculatorState,
        initialState,
        isPublic,
        sharePermission,
    ]);

    React.useEffect(() => {
        let cancelled = false;
        const recipeIds = new Set();
        const collectIds = (snapshot) => {
            if (!snapshot) return;
            if (snapshot.baseRecipeId) recipeIds.add(String(snapshot.baseRecipeId));
            for (const row of Array.isArray(snapshot.rows) ? snapshot.rows : []) {
                if ((row?.itemType || 'recipe') === 'recipe' && row?.recipeId) {
                    recipeIds.add(String(row.recipeId));
                }
            }
        };
        collectIds(currentWorkingSnapshot);
        collectIds(selectedVersion?.snapshot);
        collectIds(readOnlyPreview?.snapshot);

        const missingIds = [...recipeIds].filter((id) => id && !recipeNameMap.has(id));
        if (missingIds.length === 0) return undefined;

        const run = async () => {
            const pairs = await Promise.all(missingIds.map(async (id) => {
                try {
                    const recipe = await recipeService.getRecipe(id);
                    return [String(id), String(recipe?.title || `レシピ#${id}`)];
                } catch {
                    return [String(id), `レシピ#${id}`];
                }
            }));
            if (cancelled) return;
            setRecipeNameMap((prev) => {
                const next = new Map(prev);
                for (const [id, title] of pairs) next.set(id, title);
                return next;
            });
        };
        run();

        return () => {
            cancelled = true;
        };
    }, [currentWorkingSnapshot, selectedVersion, readOnlyPreview, recipeNameMap]);

    const selectedVersionSummary = React.useMemo(() => (
        selectedVersion?.snapshot ? buildSnapshotSummary(selectedVersion.snapshot, recipeNameMap) : null
    ), [selectedVersion, recipeNameMap]);

    const currentVersionSummary = React.useMemo(() => (
        buildSnapshotSummary(currentWorkingSnapshot, recipeNameMap)
    ), [currentWorkingSnapshot, recipeNameMap]);

    const handleUpdate = async () => {
        const name = String(dishName || '').trim();
        if (!name) {
            toast.warning('料理名を入力してください。');
            return;
        }
        if (!baseRecipe?.id) return;
        if (!calculatorState) {
            toast.warning('使用量を入力してから保存してください。');
            return;
        }
        try {
            setSaving(true);
            const normalizedSharePermission = String(sharePermission || 'viewer');
            const canDirectEdit = isOwner || normalizedSharePermission === 'editor';
            const canCopySave = !isOwner && normalizedSharePermission === 'copier';

            if (!canDirectEdit && !canCopySave) {
                toast.warning('この共有レシピは「閲覧のみ」です。保存はできません。');
                return;
            }

            if (!canDirectEdit && canCopySave) {
                const shouldCreateCopy = window.confirm(
                    'この保存は複製として新規保存されます。\nオリジナルは変更されません。\nこのまま保存しますか？'
                );
                if (!shouldCreateCopy) return;
                await compositeRecipeService.createSet({
                    dishName: name,
                    baseRecipeId: baseRecipe.id,
                    isPublic,
                    sharePermission: normalizedSharePermission,
                    ...calculatorState,
                });
                toast.success('複製として保存しました（オリジナルは変更していません）。');
                onBack?.();
                return;
            }

            const updateResult = await compositeRecipeService.updateSet(compositeId, {
                dishName: name,
                baseRecipeId: baseRecipe.id,
                isPublic,
                sharePermission: normalizedSharePermission,
                ...calculatorState,
            });
            setCurrentVersionNo(Number(updateResult?.versionNo || currentVersionNo + 1));
            try {
                const refreshed = await compositeRecipeService.listSetVersions(compositeId);
                setVersions(Array.isArray(refreshed) ? refreshed : []);
            } catch {
                // ignore version refresh failures in UI
            }
            toast.success('合成レシピを更新しました。');
        } catch (e) {
            toast.error(`更新に失敗しました: ${e?.message || 'unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleRestoreVersion = async () => {
        const targetVersion = Number(selectedVersionNo);
        if (!Number.isFinite(targetVersion) || targetVersion < 1) {
            toast.warning('復元する版を選択してください。');
            return;
        }
        if (!window.confirm(`v${targetVersion} を復元します。現在の内容は新しい版として上書きされます。`)) return;
        try {
            setRestoringVersion(true);
            const result = await compositeRecipeService.restoreSetVersion(compositeId, targetVersion);
            const detail = await compositeRecipeService.getSetDetail(compositeId);
            const recipe = await recipeService.getRecipe(detail.base_recipe_id);
            setBaseRecipe(recipe);
            setDishName(detail.dish_name || '');
            setIsPublic(detail.is_public === true);
            setSharePermission(String(detail.share_permission || 'viewer'));
            setCurrentVersionNo(Number(result?.versionNo || detail.current_version_no || 1));
            setInitialState({
                currentUsageAmount: detail.base_usage_amount == null ? '' : String(detail.base_usage_amount),
                salesPrice: detail.sales_price == null ? '' : String(detail.sales_price),
                salesCount: detail.sales_count == null ? '' : String(detail.sales_count),
                rows: (detail.items || []).map((item) => ({
                    itemType: item.item_type === 'ingredient' ? 'ingredient' : 'recipe',
                    recipeId: item.recipe_id == null ? '' : String(item.recipe_id),
                    ingredient: item.ingredient_payload || null,
                    usageAmount: item.usage_amount == null ? '' : String(item.usage_amount),
                    usageUnit: item.ingredient_payload?.unit || '',
                })),
            });
            try {
                const refreshed = await compositeRecipeService.listSetVersions(compositeId);
                setVersions(Array.isArray(refreshed) ? refreshed : []);
            } catch {
                // ignore version list refresh failures in UI
            }
            setSelectedVersionNo('');
            toast.success(`v${targetVersion} を復元しました。`);
        } catch (e) {
            toast.error(`版の復元に失敗しました: ${e?.message || 'unknown error'}`);
        } finally {
            setRestoringVersion(false);
        }
    };

    const handleOpenReadOnlyVersion = async () => {
        if (!selectedVersion?.snapshot) {
            toast.warning('表示する版を選択してください。');
            return;
        }
        const snapshot = selectedVersion.snapshot;
        const baseRecipeId = snapshot?.baseRecipeId;
        if (!baseRecipeId) {
            toast.warning('この版にはベースレシピ情報がありません。');
            return;
        }
        try {
            setPreviewLoading(true);
            const recipe = String(baseRecipe?.id || '') === String(baseRecipeId)
                ? baseRecipe
                : await recipeService.getRecipe(baseRecipeId);
            setReadOnlyPreview({
                versionNo: Number(selectedVersion.version_no || 1),
                createdAt: selectedVersion.created_at,
                snapshot,
                recipe,
            });
        } catch (e) {
            toast.error(`版の読み取り表示に失敗しました: ${e?.message || 'unknown error'}`);
        } finally {
            setPreviewLoading(false);
        }
    };

    const compareRows = React.useMemo(() => {
        if (!selectedVersionSummary) return [];
        return [
            { label: '料理名', current: currentVersionSummary.dishName, selected: selectedVersionSummary.dishName },
            { label: 'ベースレシピ', current: currentVersionSummary.baseRecipeTitle, selected: selectedVersionSummary.baseRecipeTitle },
            { label: 'ベース使用量', current: currentVersionSummary.currentUsageAmount, selected: selectedVersionSummary.currentUsageAmount },
            { label: '販売価格', current: currentVersionSummary.salesPrice, selected: selectedVersionSummary.salesPrice },
            { label: '販売数', current: currentVersionSummary.salesCount, selected: selectedVersionSummary.salesCount },
            { label: '合成原価', current: currentVersionSummary.totalCompositeCost, selected: selectedVersionSummary.totalCompositeCost },
            { label: '共有', current: currentVersionSummary.isPublic, selected: selectedVersionSummary.isPublic },
            { label: '共有権限', current: currentVersionSummary.sharePermission, selected: selectedVersionSummary.sharePermission },
            { label: '項目数', current: `${currentVersionSummary.rowCount}件`, selected: `${selectedVersionSummary.rowCount}件` },
        ].map((row) => ({
            ...row,
            changed: row.current !== row.selected,
        }));
    }, [currentVersionSummary, selectedVersionSummary]);

    if (loading) {
        return (
            <div className="composite-cost-page">
                <Card className="composite-cost-page__placeholder">保存済み合成レシピを読み込み中です。</Card>
            </div>
        );
    }

    if (error) {
        return (
            <div className="composite-cost-page">
                <div className="composite-cost-page__header">
                    <Button variant="secondary" onClick={onBack}>← 保存一覧に戻る</Button>
                </div>
                <Card className="composite-cost-page__error" role="alert">{error}</Card>
            </div>
        );
    }

    if (!baseRecipe) return null;
    const isOwner = String(createdBy || '') === String(user?.id || '');
    const canDirectEdit = isOwner || sharePermission === 'editor';
    const canCopySave = !isOwner && sharePermission === 'copier';
    const canSave = canDirectEdit || canCopySave;

    return (
        <div className="composite-cost-page">
            <div className="composite-cost-page__header">
                <Button variant="secondary" onClick={onBack}>← 保存一覧に戻る</Button>
            </div>

            <Card className="composite-cost-page__hero">
                <h2 className="section-title composite-cost-page__title">保存済み合成レシピ編集</h2>
                <p className="composite-cost-page__desc">
                    {canDirectEdit
                        ? '使用グラムや組み合わせを変更して、保存内容を更新できます。'
                        : (canCopySave
                            ? 'この共有レシピは保存時に複製として新規保存されます（オリジナルは変更されません）。'
                            : 'この共有レシピは閲覧のみです。')}
                </p>
                <p className="composite-cost-page__desc" style={{ marginTop: '4px' }}>
                    現在の版: <strong>v{Number(currentVersionNo || 1)}</strong>
                </p>
                <div className="composite-cost-page__save-row">
                    <input
                        className="composite-cost-page__search"
                        type="text"
                        value={dishName}
                        onChange={(e) => setDishName(e.target.value)}
                        placeholder="料理名（例: バゲットポテサラパン）"
                        disabled={!canSave}
                    />
                    <label className={`composite-cost-page__share-toggle ${isPublic ? 'composite-cost-page__share-toggle--on' : 'composite-cost-page__share-toggle--off'}`}>
                        <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            disabled={!isOwner}
                        />
                        他ユーザーへ共有
                    </label>
                    <select
                        className="composite-cost-page__select"
                        value={sharePermission}
                        onChange={(e) => setSharePermission(e.target.value)}
                        disabled={!isOwner}
                        aria-label="共有権限"
                    >
                        <option value="viewer">共有権限: 閲覧のみ</option>
                        <option value="copier">共有権限: 複製して保存</option>
                        <option value="editor">共有権限: 直接編集</option>
                    </select>
                    <Button type="button" variant="primary" onClick={handleUpdate} disabled={saving || !canSave}>
                        {!canSave
                            ? '閲覧のみ'
                            : (canDirectEdit
                                ? (saving ? '更新中...' : '更新を保存')
                                : (saving ? '保存中...' : '複製して保存'))}
                    </Button>
                </div>
                <div className="composite-cost-page__save-row" style={{ marginTop: '10px' }}>
                    <select
                        className="composite-cost-page__select"
                        value={selectedVersionNo}
                        onChange={(e) => setSelectedVersionNo(e.target.value)}
                        disabled={loadingVersions || restoringVersion || versions.length === 0}
                        aria-label="版履歴"
                    >
                        <option value="">
                            {loadingVersions ? '版履歴を読み込み中...' : '復元する版を選択'}
                        </option>
                        {versions.map((v) => (
                            <option key={v.id} value={String(v.version_no)}>
                                v{v.version_no} - {new Date(v.created_at).toLocaleString()}
                            </option>
                        ))}
                    </select>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleRestoreVersion}
                        disabled={restoringVersion || loadingVersions || !selectedVersionNo || !canDirectEdit}
                    >
                        {restoringVersion ? '復元中...' : 'この版を復元'}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleOpenReadOnlyVersion}
                        disabled={previewLoading || loadingVersions || !selectedVersionNo}
                    >
                        {previewLoading ? '表示準備中...' : 'この版を読み取り専用で表示'}
                    </Button>
                </div>
            </Card>

            {selectedVersionSummary && (
                <Card className="composite-cost-page__version-panel">
                    <div className="composite-cost-page__version-head">
                        <div>
                            <h3 className="composite-cost-page__version-title">選択中の版 v{Number(selectedVersion?.version_no || 1)}</h3>
                            <p className="composite-cost-page__version-note">
                                保存日時: {selectedVersion?.created_at ? new Date(selectedVersion.created_at).toLocaleString() : '不明'}
                            </p>
                        </div>
                    </div>

                    <div className="composite-cost-page__version-summary-grid">
                        <div className="composite-cost-page__version-summary-card">
                            <span>料理名</span>
                            <strong>{selectedVersionSummary.dishName}</strong>
                        </div>
                        <div className="composite-cost-page__version-summary-card">
                            <span>ベースレシピ</span>
                            <strong>{selectedVersionSummary.baseRecipeTitle}</strong>
                        </div>
                        <div className="composite-cost-page__version-summary-card">
                            <span>合成原価</span>
                            <strong>{selectedVersionSummary.totalCompositeCost}</strong>
                        </div>
                        <div className="composite-cost-page__version-summary-card">
                            <span>共有 / 権限</span>
                            <strong>{selectedVersionSummary.isPublic} / {selectedVersionSummary.sharePermission}</strong>
                        </div>
                    </div>

                    <div className="composite-cost-page__version-compare-grid">
                        <div className="composite-cost-page__version-compare-card">
                            <h4>現在編集中</h4>
                            {compareRows.map((row) => (
                                <div key={`current-${row.label}`} className={`composite-cost-page__compare-row ${row.changed ? 'is-changed' : ''}`}>
                                    <span>{row.label}</span>
                                    <strong>{row.current}</strong>
                                </div>
                            ))}
                        </div>
                        <div className="composite-cost-page__version-compare-card">
                            <h4>選択中の版</h4>
                            {compareRows.map((row) => (
                                <div key={`selected-${row.label}`} className={`composite-cost-page__compare-row ${row.changed ? 'is-changed' : ''}`}>
                                    <span>{row.label}</span>
                                    <strong>{row.selected}</strong>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="composite-cost-page__version-items">
                        <h4>この版の組み合わせ内容</h4>
                        {selectedVersionSummary.itemLabels.length === 0 ? (
                            <p className="composite-cost-page__version-note">組み合わせ項目はありません。</p>
                        ) : (
                            <ul className="composite-cost-page__version-item-list">
                                {selectedVersionSummary.itemLabels.map((label) => (
                                    <li key={label}>{label}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Card>
            )}

            {readOnlyPreview?.recipe && (
                <Card className="composite-cost-page__version-panel">
                    <div className="composite-cost-page__version-head">
                        <div>
                            <h3 className="composite-cost-page__version-title">v{readOnlyPreview.versionNo} の読み取り専用表示</h3>
                            <p className="composite-cost-page__version-note">
                                保存日時: {readOnlyPreview.createdAt ? new Date(readOnlyPreview.createdAt).toLocaleString() : '不明'}
                            </p>
                            <p className="composite-cost-page__version-note">
                                この読み取り専用表示は、保存された使用量・構成を元に再現しています。参照レシピの行ごとの表示は現行データを使うため、下の内訳は当時と完全一致しない場合があります。
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setReadOnlyPreview(null)}
                        >
                            閉じる
                        </Button>
                    </div>
                    <RecipeCompositeCostCalculator
                        currentRecipe={readOnlyPreview.recipe}
                        showHeader={true}
                        readOnly={true}
                        initialState={buildCalculatorStateFromSnapshot(readOnlyPreview.snapshot)}
                        initialStateKey={`readonly-${compositeId}-${readOnlyPreview.versionNo}`}
                        onOpenRecipeDetail={onOpenRecipeDetail}
                    />
                </Card>
            )}

            <RecipeCompositeCostCalculator
                currentRecipe={baseRecipe}
                showHeader={false}
                initialState={initialState}
                initialStateKey={String(compositeId)}
                onStateChange={setCalculatorState}
                onOpenRecipeDetail={onOpenRecipeDetail}
            />
        </div>
    );
};
