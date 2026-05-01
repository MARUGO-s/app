const e=`import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { RecipeCompositeCostCalculator } from './RecipeCompositeCostCalculator';
import { compositeRecipeService } from '../services/compositeRecipeService';
import { recipeService } from '../services/recipeService';
import { useToast } from '../contexts/useToast';
import { useAuth } from '../contexts/useAuth';
import './RecipeCompositeCostPage.css';

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
    const [createdBy, setCreatedBy] = React.useState('');
    const [baseRecipe, setBaseRecipe] = React.useState(null);
    const [initialState, setInitialState] = React.useState(null);
    const [calculatorState, setCalculatorState] = React.useState(null);

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
                    'この保存は複製として新規保存されます。\\nオリジナルは変更されません。\\nこのまま保存しますか？'
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
            toast.error(\`更新に失敗しました: \${e?.message || 'unknown error'}\`);
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
        if (!window.confirm(\`v\${targetVersion} を復元します。現在の内容は新しい版として上書きされます。\`)) return;
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
            toast.success(\`v\${targetVersion} を復元しました。\`);
        } catch (e) {
            toast.error(\`版の復元に失敗しました: \${e?.message || 'unknown error'}\`);
        } finally {
            setRestoringVersion(false);
        }
    };

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
                    <label className={\`composite-cost-page__share-toggle \${isPublic ? 'composite-cost-page__share-toggle--on' : 'composite-cost-page__share-toggle--off'}\`}>
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
                </div>
            </Card>

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
`;export{e as default};
