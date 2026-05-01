const e=`import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { RecipeCompositeCostCalculator } from './RecipeCompositeCostCalculator';
import { recipeService } from '../services/recipeService';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { compositeRecipeService } from '../services/compositeRecipeService';
import './RecipeCompositeCostPage.css';

const getCategoryToneClass = (category) => {
    const key = String(category || 'uncategorized').trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash |= 0;
    }
    const tone = (Math.abs(hash) % 5) + 1;
    return \`composite-cost-page__search-card--tone-\${tone}\`;
};

export const RecipeCompositeCostPage = ({ initialRecipeId = '', onBack, onOpenSavedList }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [recipeOptions, setRecipeOptions] = React.useState([]);
    const [loadingOptions, setLoadingOptions] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedRecipeId, setSelectedRecipeId] = React.useState(initialRecipeId ? String(initialRecipeId) : '');
    const [selectedRecipe, setSelectedRecipe] = React.useState(null);
    const [dishName, setDishName] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    const [calculatorState, setCalculatorState] = React.useState(null);
    const [queuedRecipeId, setQueuedRecipeId] = React.useState('');
    const [loadingRecipe, setLoadingRecipe] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState('');
    const [isPublic, setIsPublic] = React.useState(false);
    const showSearchCards = String(searchQuery || '').trim().length > 0;

    const filteredRecipeOptions = React.useMemo(() => {
        const keyword = String(searchQuery || '').trim().toLowerCase();
        if (!keyword) return recipeOptions;

        return recipeOptions.filter((recipe) => {
            const haystack = [
                recipe?.title,
                recipe?.category,
                recipe?.course,
                recipe?.storeName,
                recipe?.store_name,
                recipe?.description,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }, [recipeOptions, searchQuery]);

    const visibleRecipeOptions = React.useMemo(() => {
        if (!selectedRecipeId) return filteredRecipeOptions;
        const hasSelected = filteredRecipeOptions.some((recipe) => String(recipe.id) === String(selectedRecipeId));
        if (hasSelected) return filteredRecipeOptions;
        const selectedOption = recipeOptions.find((recipe) => String(recipe.id) === String(selectedRecipeId));
        return selectedOption ? [selectedOption, ...filteredRecipeOptions] : filteredRecipeOptions;
    }, [filteredRecipeOptions, recipeOptions, selectedRecipeId]);

    React.useEffect(() => {
        setSelectedRecipeId(initialRecipeId ? String(initialRecipeId) : '');
    }, [initialRecipeId]);

    React.useEffect(() => {
        let cancelled = false;
        if (!user) return undefined;

        const loadOptions = async () => {
            setLoadingOptions(true);
            setErrorMessage('');
            try {
                const list = await recipeService.fetchRecipes(user, {
                    includeIngredients: false,
                    includeSources: false,
                    timeoutMs: 12000,
                });
                if (cancelled) return;
                setRecipeOptions(Array.isArray(list) ? list : []);
            } catch (error) {
                if (cancelled) return;
                setRecipeOptions([]);
                setErrorMessage(error?.message || 'レシピ一覧の取得に失敗しました。');
            } finally {
                if (!cancelled) setLoadingOptions(false);
            }
        };

        loadOptions();
        return () => {
            cancelled = true;
        };
    }, [user]);

    React.useEffect(() => {
        let cancelled = false;

        if (!selectedRecipeId) {
            setSelectedRecipe(null);
            setErrorMessage('');
            return undefined;
        }

        const loadRecipe = async () => {
            setLoadingRecipe(true);
            setErrorMessage('');
            try {
                const detail = await recipeService.getRecipe(selectedRecipeId);
                if (cancelled) return;
                setSelectedRecipe(detail || null);
            } catch (error) {
                if (cancelled) return;
                setSelectedRecipe(null);
                setErrorMessage(error?.message || 'ベースレシピの読み込みに失敗しました。');
            } finally {
                if (!cancelled) setLoadingRecipe(false);
            }
        };

        loadRecipe();
        return () => {
            cancelled = true;
        };
    }, [selectedRecipeId]);

    const handleSaveComposite = async () => {
        const name = String(dishName || '').trim();
        if (!name) {
            toast.warning('保存する料理名を入力してください。');
            return;
        }
        if (!selectedRecipe?.id) {
            toast.warning('ベースレシピを選択してください。');
            return;
        }
        if (!calculatorState) {
            toast.warning('合成原価の内容を入力してください。');
            return;
        }
        try {
            setIsSaving(true);
            await compositeRecipeService.createSet({
                dishName: name,
                baseRecipeId: selectedRecipe.id,
                isPublic,
                ...calculatorState,
            });
            toast.success('合成レシピを保存しました。');
            setDishName('');
            setIsPublic(false);
        } catch (error) {
            toast.error(\`保存に失敗しました: \${error?.message || 'unknown error'}\`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSearchPick = (recipeId) => {
        const nextId = String(recipeId || '').trim();
        if (!nextId) return;
        if (!selectedRecipeId) {
            setSelectedRecipeId(nextId);
            return;
        }
        if (nextId === String(selectedRecipeId)) return;
        setQueuedRecipeId(nextId);
    };

    return (
        <div className="composite-cost-page">
            <div className="composite-cost-page__header">
                <Button variant="secondary" onClick={onBack}>
                    ← レシピ一覧に戻る
                </Button>
                <Button variant="secondary" onClick={onOpenSavedList}>
                    保存済み合成レシピ
                </Button>
            </div>

            <Card className="composite-cost-page__hero">
                <div className="composite-cost-page__hero-copy">
                    <h2 className="section-title composite-cost-page__title">🥪 レシピ合成原価シミュレーター</h2>
                    <p className="composite-cost-page__desc">
                        レシピを自由に組み合わせて、使用量ごとの合成原価と原価率をこのページで試算できます。
                    </p>
                <p className="composite-cost-page__desc" style={{ marginTop: '6px' }}>
                    保存時に「他ユーザーへ共有」をONにすると、他ユーザーの保存一覧にも表示されます。
                </p>
                </div>

                <div className="composite-cost-page__selector">
                    <label htmlFor="composite-base-recipe-search" className="composite-cost-page__label">レシピ検索</label>
                    <input
                        id="composite-base-recipe-search"
                        type="search"
                        className="composite-cost-page__search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="レシピ名・カテゴリー・コースで検索"
                        autoComplete="off"
                    />
                    <div className="composite-cost-page__search-meta">
                        {loadingOptions
                            ? 'レシピ一覧を読み込み中...'
                            : \`\${filteredRecipeOptions.length}件 表示中\`}
                    </div>
                    {!loadingOptions && filteredRecipeOptions.length === 0 && (
                        <div className="composite-cost-page__empty-search">
                            該当するレシピがありません。検索語を変えてください。
                        </div>
                    )}
                </div>

                {showSearchCards && filteredRecipeOptions.length > 0 && (
                    <div className="composite-cost-page__search-results">
                        <div className="composite-cost-page__search-results-head">
                            <strong>検索候補</strong>
                            <span>カードを押すと組み合わせに追加されます（未選択時は1件目として開始）。</span>
                        </div>

                        <div className="composite-cost-page__search-grid">
                            {filteredRecipeOptions.slice(0, 12).map((recipe) => {
                                const isSelected = String(recipe.id) === String(selectedRecipeId);
                                const storeName = recipe.storeName || recipe.store_name || '';
                                const accentClass = getCategoryToneClass(recipe.category);
                                return (
                                    <button
                                        key={recipe.id}
                                        type="button"
                                        className={\`composite-cost-page__search-card \${accentClass} \${isSelected ? 'composite-cost-page__search-card--selected' : ''}\`}
                                        onClick={() => handleSearchPick(recipe.id)}
                                    >
                                        <div className="composite-cost-page__search-card-title">{recipe.title}</div>
                                        <div className="composite-cost-page__search-card-meta">
                                            {recipe.category && <span className="composite-cost-page__search-card-chip composite-cost-page__search-card-chip--category">{recipe.category}</span>}
                                            {recipe.course && <span className="composite-cost-page__search-card-chip composite-cost-page__search-card-chip--course">{recipe.course}</span>}
                                            {storeName && <span className="composite-cost-page__search-card-chip composite-cost-page__search-card-chip--store">{storeName}</span>}
                                        </div>
                                        {recipe.description && (
                                            <div className="composite-cost-page__search-card-desc">
                                                {recipe.description}
                                            </div>
                                        )}
                                        <div className="composite-cost-page__search-card-action">
                                            {!selectedRecipeId || isSelected ? 'このレシピで開始' : '組み合わせに追加'}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {filteredRecipeOptions.length > 12 && (
                            <div className="composite-cost-page__search-note">
                                先頭12件を表示しています。さらに絞り込むと選びやすくなります。
                            </div>
                        )}
                    </div>
                )}

                {errorMessage && (
                    <div className="composite-cost-page__error" role="alert">
                        {errorMessage}
                    </div>
                )}

                {selectedRecipe && (
                    <div className="composite-cost-page__selected-meta">
                        <span className="composite-cost-page__meta-label">選択中</span>
                        <strong>{selectedRecipe.title}</strong>
                        {selectedRecipe.category && (
                            <span className="composite-cost-page__meta-chip">{selectedRecipe.category}</span>
                        )}
                    </div>
                )}
            </Card>

            {!selectedRecipeId && (
                <Card className="composite-cost-page__placeholder">
                    レシピを1つ選ぶと、ここに合成原価シミュレーターが表示されます。
                </Card>
            )}

            {selectedRecipeId && loadingRecipe && (
                <Card className="composite-cost-page__placeholder">
                    レシピを読み込み中です。
                </Card>
            )}

            {selectedRecipeId && !loadingRecipe && selectedRecipe && (
                <>
                    <Card className="composite-cost-page__hero">
                        <div className="composite-cost-page__save-row">
                            <input
                                type="text"
                                className="composite-cost-page__search"
                                value={dishName}
                                onChange={(e) => setDishName(e.target.value)}
                                placeholder="保存する料理名（例: バゲットポテサラパン）"
                            />
                            <label className={\`composite-cost-page__share-toggle \${isPublic ? 'composite-cost-page__share-toggle--on' : 'composite-cost-page__share-toggle--off'}\`}>
                                <input
                                    type="checkbox"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                />
                                他ユーザーへ共有
                            </label>
                            <Button type="button" variant="primary" onClick={handleSaveComposite} disabled={isSaving}>
                                {isSaving ? '保存中...' : 'この組み合わせを保存'}
                            </Button>
                        </div>
                    </Card>
                    <RecipeCompositeCostCalculator
                        currentRecipe={selectedRecipe}
                        showHeader={false}
                        onStateChange={setCalculatorState}
                        queuedRecipeId={queuedRecipeId}
                        onQueuedRecipeHandled={() => setQueuedRecipeId('')}
                        onBaseRecipeChange={(nextId) => {
                            const normalized = String(nextId || '').trim();
                            if (!normalized) return;
                            setSelectedRecipeId(normalized);
                        }}
                        onBaseRecipeRemove={() => {
                            setSelectedRecipeId('');
                            setQueuedRecipeId('');
                            setDishName('');
                            setCalculatorState(null);
                        }}
                    />
                </>
            )}
        </div>
    );
};
`;export{e as default};
