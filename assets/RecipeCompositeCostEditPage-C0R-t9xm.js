const e=`import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { RecipeCompositeCostCalculator } from './RecipeCompositeCostCalculator';
import { compositeRecipeService } from '../services/compositeRecipeService';
import { recipeService } from '../services/recipeService';
import { useToast } from '../contexts/useToast';
import { useAuth } from '../contexts/useAuth';
import './RecipeCompositeCostPage.css';

export const RecipeCompositeCostEditPage = ({ compositeId, onBack }) => {
    const toast = useToast();
    const { user } = useAuth();
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [dishName, setDishName] = React.useState('');
    const [isPublic, setIsPublic] = React.useState(false);
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
                const recipe = await recipeService.getRecipe(detail.base_recipe_id);
                if (cancelled) return;
                setBaseRecipe(recipe);
                setDishName(detail.dish_name || '');
                setIsPublic(detail.is_public === true);
                setCreatedBy(String(detail.created_by || ''));
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
            if (!isOwner) {
                const shouldCreateCopy = window.confirm(
                    'この保存は複製として新規保存されます。\\nオリジナルは変更されません。\\nこのまま保存しますか？'
                );
                if (!shouldCreateCopy) return;
                await compositeRecipeService.createSet({
                    dishName: name,
                    baseRecipeId: baseRecipe.id,
                    isPublic,
                    ...calculatorState,
                });
                toast.success('複製として保存しました（オリジナルは変更していません）。');
                onBack?.();
                return;
            }

            await compositeRecipeService.updateSet(compositeId, {
                dishName: name,
                baseRecipeId: baseRecipe.id,
                isPublic,
                ...calculatorState,
            });
            toast.success('合成レシピを更新しました。');
        } catch (e) {
            toast.error(\`更新に失敗しました: \${e?.message || 'unknown error'}\`);
        } finally {
            setSaving(false);
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

    return (
        <div className="composite-cost-page">
            <div className="composite-cost-page__header">
                <Button variant="secondary" onClick={onBack}>← 保存一覧に戻る</Button>
            </div>

            <Card className="composite-cost-page__hero">
                <h2 className="section-title composite-cost-page__title">保存済み合成レシピ編集</h2>
                <p className="composite-cost-page__desc">
                    {isOwner
                        ? '使用グラムや組み合わせを変更して、保存内容を更新できます。'
                        : '共有レシピの編集内容は、保存時に複製として新規保存されます（オリジナルは変更されません）。'}
                </p>
                <div className="composite-cost-page__save-row">
                    <input
                        className="composite-cost-page__search"
                        type="text"
                        value={dishName}
                        onChange={(e) => setDishName(e.target.value)}
                        placeholder="料理名（例: バゲットポテサラパン）"
                    />
                    <label className={\`composite-cost-page__share-toggle \${isPublic ? 'composite-cost-page__share-toggle--on' : 'composite-cost-page__share-toggle--off'}\`}>
                        <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                        />
                        他ユーザーへ共有
                    </label>
                    <Button type="button" variant="primary" onClick={handleUpdate} disabled={saving}>
                        {isOwner ? (saving ? '更新中...' : '更新を保存') : (saving ? '保存中...' : '複製して保存')}
                    </Button>
                </div>
            </Card>

            <RecipeCompositeCostCalculator
                currentRecipe={baseRecipe}
                showHeader={false}
                initialState={initialState}
                initialStateKey={String(compositeId)}
                onStateChange={setCalculatorState}
            />
        </div>
    );
};
`;export{e as default};
