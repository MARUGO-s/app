const e=`import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { RecipeCompositeCostCalculator } from './RecipeCompositeCostCalculator';
import { recipeService } from '../services/recipeService';
import { useAuth } from '../contexts/useAuth';
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

export const RecipeCompositeCostPage = ({ initialRecipeId = '', onBack }) => {
    const { user } = useAuth();
    const [recipeOptions, setRecipeOptions] = React.useState([]);
    const [loadingOptions, setLoadingOptions] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedRecipeId, setSelectedRecipeId] = React.useState(initialRecipeId ? String(initialRecipeId) : '');
    const [selectedRecipe, setSelectedRecipe] = React.useState(null);
    const [loadingRecipe, setLoadingRecipe] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState('');
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

    return (
        <div className="composite-cost-page">
            <div className="composite-cost-page__header">
                <Button variant="secondary" onClick={onBack}>
                    ← レシピ一覧に戻る
                </Button>
            </div>

            <Card className="composite-cost-page__hero">
                <div className="composite-cost-page__hero-copy">
                    <h2 className="section-title composite-cost-page__title">🥪 レシピ合成原価シミュレーター</h2>
                    <p className="composite-cost-page__desc">
                        ベースにするレシピを選んで、他のレシピを組み合わせた時の合成原価と原価率を独立ページで試算できます。
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

                    <label htmlFor="composite-base-recipe" className="composite-cost-page__label">ベースレシピ</label>
                    <select
                        id="composite-base-recipe"
                        className="composite-cost-page__select"
                        value={selectedRecipeId}
                        onChange={(e) => setSelectedRecipeId(e.target.value)}
                        disabled={loadingOptions}
                    >
                        <option value="">レシピを選択してください</option>
                        {visibleRecipeOptions.map((recipe) => (
                            <option key={recipe.id} value={recipe.id}>
                                {recipe.title}
                            </option>
                        ))}
                    </select>
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
                            <span>カードを押すとベースレシピにセットされます。</span>
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
                                        onClick={() => setSelectedRecipeId(String(recipe.id))}
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
                    ベースレシピを選ぶと、ここに合成原価シミュレーターが表示されます。
                </Card>
            )}

            {selectedRecipeId && loadingRecipe && (
                <Card className="composite-cost-page__placeholder">
                    ベースレシピを読み込み中です。
                </Card>
            )}

            {selectedRecipeId && !loadingRecipe && selectedRecipe && (
                <RecipeCompositeCostCalculator currentRecipe={selectedRecipe} showHeader={false} />
            )}
        </div>
    );
};
`;export{e as default};
