import React from 'react';
import { Button } from './Button';
import { recipeService } from '../services/recipeService';
import { useAuth } from '../contexts/useAuth';
import { normalizeUnit } from '../utils/unitUtils';
import {
    categoryCostOverrideService,
    computeRecipeTotalCostTaxIncluded,
} from '../services/categoryCostOverrideService';
import './RecipeCompositeCostCalculator.css';

const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
};

const getRecipeIngredients = (recipe) => {
    if (!recipe || typeof recipe !== 'object') return [];
    if (recipe.type === 'bread') {
        return [...(recipe.flours || []), ...(recipe.breadIngredients || [])].filter(Boolean);
    }
    return Array.isArray(recipe.ingredients) ? recipe.ingredients.filter(Boolean) : [];
};

const computeBatchStats = (ingredients) => {
    let totalWeightGrams = 0;
    let totalVolumeMl = 0;
    for (const item of ingredients) {
        const qty = toFiniteNumber(item?.quantity);
        if (!Number.isFinite(qty)) continue;
        const unit = normalizeUnit(item?.unit || '');
        if (unit === 'g') totalWeightGrams += qty;
        if (unit === 'kg') totalWeightGrams += qty * 1000;
        if (unit === 'ml' || unit === 'cc') totalVolumeMl += qty;
        if (unit === 'cl') totalVolumeMl += qty * 10;
        if (unit === 'l') totalVolumeMl += qty * 1000;
    }

    const hasWeightBasis = totalWeightGrams > 0;
    const hasVolumeBasis = totalVolumeMl > 0;
    const defaultBatchAmount = (hasWeightBasis || hasVolumeBasis) ? (totalWeightGrams + totalVolumeMl) : NaN;
    const defaultUnit = hasWeightBasis ? 'g' : (hasVolumeBasis ? 'ml' : 'g');

    return {
        totalWeightGrams,
        totalVolumeMl,
        defaultBatchAmount,
        defaultUnit,
    };
};

const createRowId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getDefaultSalesCount = (recipe) => {
    const servings = toFiniteNumber(recipe?.servings);
    if (!Number.isFinite(servings) || servings <= 0) return '';
    return String(servings);
};

export const RecipeCompositeCostCalculator = ({
    currentRecipe,
    currentIngredients,
    currentTotalCostTaxIncluded,
    showHeader = true,
    initialState = null,
    initialStateKey = '',
    onStateChange,
    queuedRecipeId = '',
    onQueuedRecipeHandled,
    onBaseRecipeChange,
    onBaseRecipeRemove,
}) => {
    const { user } = useAuth();
    const [candidateRecipes, setCandidateRecipes] = React.useState([]);
    const [loadingCandidates, setLoadingCandidates] = React.useState(false);
    const [rows, setRows] = React.useState([]);
    const [recipeDetails, setRecipeDetails] = React.useState({});
    const [overrideMapsByRecipe, setOverrideMapsByRecipe] = React.useState({});
    const [currentUsageAmount, setCurrentUsageAmount] = React.useState('');
    const [salesPrice, setSalesPrice] = React.useState('');
    const [salesCount, setSalesCount] = React.useState(() => getDefaultSalesCount(currentRecipe));
    const queuedRecipeHandledRef = React.useRef('');

    const currentMetrics = React.useMemo(() => {
        const ingredients = Array.isArray(currentIngredients) && currentIngredients.length > 0
            ? currentIngredients
            : getRecipeIngredients(currentRecipe);
        const stats = computeBatchStats(ingredients);
        const currentOverrideMap = overrideMapsByRecipe[String(currentRecipe?.id)] || new Map();
        const totalCost = Number.isFinite(toFiniteNumber(currentTotalCostTaxIncluded))
            ? toFiniteNumber(currentTotalCostTaxIncluded)
            : computeRecipeTotalCostTaxIncluded(
                { ...currentRecipe, ingredients },
                currentOverrideMap
            );
        return {
            recipeId: String(currentRecipe?.id || ''),
            title: currentRecipe?.title || 'このレシピ',
            ingredients,
            totalCostTaxIncluded: totalCost,
            ...stats,
        };
    }, [currentIngredients, currentRecipe, currentTotalCostTaxIncluded, overrideMapsByRecipe]);

    React.useEffect(() => {
        const safeRows = Array.isArray(initialState?.rows)
            ? initialState.rows
                .map((row) => ({
                    id: String(row?.id || createRowId()),
                    recipeId: String(row?.recipeId || ''),
                    usageAmount: row?.usageAmount == null ? '' : String(row.usageAmount),
                }))
            : [];
        setCurrentUsageAmount(
            initialState?.currentUsageAmount == null ? '' : String(initialState.currentUsageAmount)
        );
        setRows(safeRows);
        setSalesPrice(initialState?.salesPrice == null ? '' : String(initialState.salesPrice));
        setSalesCount(
            initialState?.salesCount == null
                ? getDefaultSalesCount(currentRecipe)
                : String(initialState.salesCount)
        );
    }, [currentMetrics.recipeId, currentRecipe, initialStateKey]);

    React.useEffect(() => {
        let cancelled = false;
        if (!user) return undefined;

        const loadCandidates = async () => {
            setLoadingCandidates(true);
            try {
                const list = await recipeService.fetchRecipes(user, {
                    includeIngredients: false,
                    includeSources: false,
                    timeoutMs: 12000,
                });
                if (cancelled) return;
                const filtered = (list || []).filter((r) => String(r.id) !== String(currentRecipe?.id));
                setCandidateRecipes(filtered);
            } catch {
                if (!cancelled) {
                    setCandidateRecipes([]);
                }
            } finally {
                if (!cancelled) setLoadingCandidates(false);
            }
        };

        loadCandidates();
        return () => {
            cancelled = true;
        };
    }, [user, currentRecipe?.id]);

    React.useEffect(() => {
        let cancelled = false;
        const recipeId = String(currentRecipe?.id || '').trim();
        if (!recipeId) return undefined;

        const loadCurrentOverride = async () => {
            try {
                const map = await categoryCostOverrideService.fetchByRecipeId(recipeId);
                if (cancelled) return;
                setOverrideMapsByRecipe((prev) => ({ ...prev, [recipeId]: map }));
            } catch {
                if (cancelled) return;
                setOverrideMapsByRecipe((prev) => ({ ...prev, [recipeId]: new Map() }));
            }
        };
        loadCurrentOverride();
        return () => {
            cancelled = true;
        };
    }, [currentRecipe?.id]);

    const getMetricsByRecipe = React.useCallback((recipeObj) => {
        if (!recipeObj) return null;
        const ingredients = getRecipeIngredients(recipeObj);
        const stats = computeBatchStats(ingredients);
        const recipeId = String(recipeObj.id || '');
        const overrideMap = overrideMapsByRecipe[recipeId] || new Map();
        return {
            recipeId: String(recipeObj.id),
            title: recipeObj.title || '無題',
            ingredients,
            totalCostTaxIncluded: computeRecipeTotalCostTaxIncluded(
                { ...recipeObj, ingredients },
                overrideMap
            ),
            ...stats,
        };
    }, [overrideMapsByRecipe]);

    const handleRecipeChange = async (rowId, recipeId) => {
        setRows((prev) => prev.map((row) => (
            row.id === rowId
                ? { ...row, recipeId: String(recipeId || ''), usageAmount: '' }
                : row
        )));
        if (!recipeId || recipeDetails[String(recipeId)]) return;

        try {
            const full = await recipeService.getRecipe(recipeId);
            setRecipeDetails((prev) => ({ ...prev, [String(recipeId)]: full }));
            const overrideMap = await categoryCostOverrideService.fetchByRecipeId(recipeId);
            setOverrideMapsByRecipe((prev) => ({ ...prev, [String(recipeId)]: overrideMap }));
        } catch {
            // Ignore here; row stays selectable and user can choose another recipe.
        }
    };

    const appendRecipeAsRow = React.useCallback(async (recipeId) => {
        const normalizedId = String(recipeId || '').trim();
        if (!normalizedId) return;
        if (normalizedId === String(currentRecipe?.id || '')) return;

        const rowId = createRowId();
        setRows((prev) => [...prev, {
            id: rowId,
            recipeId: normalizedId,
            usageAmount: '',
        }]);

        if (recipeDetails[normalizedId]) return;
        try {
            const full = await recipeService.getRecipe(normalizedId);
            setRecipeDetails((prev) => ({ ...prev, [normalizedId]: full }));
            const overrideMap = await categoryCostOverrideService.fetchByRecipeId(normalizedId);
            setOverrideMapsByRecipe((prev) => ({ ...prev, [normalizedId]: overrideMap }));
        } catch {
            // Keep row selectable; user can modify/remove even if fetch fails.
        }
    }, [currentRecipe?.id, recipeDetails]);

    const removeRow = (rowId) => {
        setRows((prev) => prev.filter((row) => row.id !== rowId));
    };

    const updateRowField = (rowId, field, value) => {
        setRows((prev) => prev.map((row) => (
            row.id === rowId ? { ...row, [field]: value } : row
        )));
    };

    const currentLine = React.useMemo(() => {
        const batch = toFiniteNumber(currentMetrics.defaultBatchAmount);
        const use = toFiniteNumber(currentUsageAmount);
        const unitCost = Number.isFinite(batch) && batch > 0
            ? (currentMetrics.totalCostTaxIncluded / batch)
            : NaN;
        const lineCost = (Number.isFinite(unitCost) && Number.isFinite(use) && use >= 0)
            ? (unitCost * use)
            : NaN;
        return { batch, use, unitCost, lineCost };
    }, [currentUsageAmount, currentMetrics.defaultBatchAmount, currentMetrics.totalCostTaxIncluded]);

    const otherLines = React.useMemo(() => {
        return rows.map((row) => {
            const detail = recipeDetails[row.recipeId];
            const metrics = detail ? getMetricsByRecipe(detail) : null;
            const batch = toFiniteNumber(metrics?.defaultBatchAmount);
            const use = toFiniteNumber(row.usageAmount);
            const unitCost = (metrics && Number.isFinite(batch) && batch > 0)
                ? (metrics.totalCostTaxIncluded / batch)
                : NaN;
            const lineCost = (Number.isFinite(unitCost) && Number.isFinite(use) && use >= 0)
                ? (unitCost * use)
                : NaN;
            return {
                row,
                metrics,
                batch,
                use,
                unitCost,
                lineCost,
            };
        });
    }, [rows, recipeDetails, getMetricsByRecipe]);

    const totalCompositeCost = React.useMemo(() => {
        let total = 0;
        if (Number.isFinite(currentLine.lineCost)) total += currentLine.lineCost;
        for (const line of otherLines) {
            if (Number.isFinite(line.lineCost)) total += line.lineCost;
        }
        return total;
    }, [currentLine.lineCost, otherLines]);

    const compositeFinancials = React.useMemo(() => {
        const price = toFiniteNumber(salesPrice);
        const count = toFiniteNumber(salesCount);
        const hasCount = Number.isFinite(count) && count > 0;
        const hasPrice = Number.isFinite(price) && price > 0;
        const totalSales = hasPrice && hasCount ? price * count : NaN;
        const unitCost = hasCount ? totalCompositeCost / count : NaN;
        const grossProfit = Number.isFinite(totalSales) ? totalSales - totalCompositeCost : NaN;
        const costRate = Number.isFinite(totalSales) && totalSales > 0
            ? (totalCompositeCost / totalSales) * 100
            : NaN;

        return {
            price,
            count,
            totalSales,
            unitCost,
            grossProfit,
            costRate,
        };
    }, [salesCount, salesPrice, totalCompositeCost]);

    const snapshot = React.useMemo(() => ({
        baseRecipeId: currentMetrics.recipeId,
        currentUsageAmount,
        rows: rows.map((row) => ({
            recipeId: String(row.recipeId || ''),
            usageAmount: row.usageAmount == null ? '' : String(row.usageAmount),
        })),
        salesPrice,
        salesCount,
        totalCompositeCost,
        unitCost: compositeFinancials.unitCost,
        totalSales: compositeFinancials.totalSales,
        grossProfit: compositeFinancials.grossProfit,
        costRate: compositeFinancials.costRate,
    }), [
        currentMetrics.recipeId,
        currentUsageAmount,
        rows,
        salesPrice,
        salesCount,
        totalCompositeCost,
        compositeFinancials,
    ]);

    React.useEffect(() => {
        if (typeof onStateChange !== 'function') return;
        onStateChange(snapshot);
    }, [onStateChange, snapshot]);

    React.useEffect(() => {
        const normalizedId = String(queuedRecipeId || '').trim();
        if (!normalizedId) {
            queuedRecipeHandledRef.current = '';
            return;
        }
        if (queuedRecipeHandledRef.current === normalizedId) return;
        queuedRecipeHandledRef.current = normalizedId;
        appendRecipeAsRow(normalizedId)
            .finally(() => {
                if (typeof onQueuedRecipeHandled === 'function') {
                    onQueuedRecipeHandled(normalizedId);
                }
            });
    }, [queuedRecipeId, appendRecipeAsRow, onQueuedRecipeHandled]);

    const formatMoney = (value) => {
        const n = toFiniteNumber(value);
        if (!Number.isFinite(n)) return '—';
        return `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    };

    const formatBatch = (amount, unit) => {
        const n = toFiniteNumber(amount);
        if (!Number.isFinite(n) || n <= 0) return '—';
        const normalizedUnit = String(unit || 'g').trim().toLowerCase();
        const safeUnit = normalizedUnit === 'ml' ? 'ml' : 'g';
        return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}${safeUnit}`;
    };

    return (
        <div className="screen-only no-print composite-cost">
            {showHeader && (
                <>
                    <h4 className="composite-cost__title">🥪 レシピ合成原価シミュレーター</h4>
                    <p className="composite-cost__desc">
                        複数レシピの「総出来上がり量」と「使用量」から、惣菜パンなどの合成原価（税込）を試算できます。
                    </p>
                </>
            )}

            <div className="composite-cost__grid">
                <div className="composite-cost__head-row">
                    <strong>レシピ</strong>
                    <strong>総出来上がり量（固定）</strong>
                    <strong>使用量</strong>
                    <strong>使用原価</strong>
                    <span className="composite-cost__remove-spacer" aria-hidden="true" />
                </div>

                <div className="composite-cost__row">
                    <select
                        className="composite-cost__input"
                        value={currentMetrics.recipeId}
                        onChange={(e) => {
                            if (typeof onBaseRecipeChange !== 'function') return;
                            onBaseRecipeChange(String(e.target.value || ''));
                        }}
                    >
                        <option value={String(currentRecipe?.id || '')}>{currentMetrics.title}</option>
                        {candidateRecipes
                            .filter((r) => String(r.id) !== String(currentRecipe?.id || ''))
                            .map((r) => (
                                <option key={r.id} value={String(r.id)}>{r.title}</option>
                            ))}
                    </select>
                    <div className="composite-cost__fixed-batch">{formatBatch(currentMetrics.defaultBatchAmount, currentMetrics.defaultUnit)}</div>
                    <input
                        className="composite-cost__input"
                        type="number"
                        min="0"
                        step="0.1"
                        value={currentUsageAmount}
                        onChange={(e) => setCurrentUsageAmount(e.target.value)}
                        placeholder="例: 100"
                    />
                    <div className="composite-cost__line-total">{formatMoney(currentLine.lineCost)}</div>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            if (typeof onBaseRecipeRemove === 'function') onBaseRecipeRemove();
                        }}
                        className="composite-cost__remove-btn"
                    >
                        ✕
                    </Button>
                </div>

                {rows.map((row) => {
                    const line = otherLines.find((x) => x.row.id === row.id);
                    return (
                        <div key={row.id} className="composite-cost__row composite-cost__row--with-remove">
                            <select
                                className="composite-cost__input"
                                value={row.recipeId}
                                onChange={(e) => handleRecipeChange(row.id, e.target.value)}
                            >
                                <option value="">レシピを選択</option>
                                {candidateRecipes.map((r) => (
                                    <option key={r.id} value={r.id}>{r.title}</option>
                                ))}
                            </select>
                            <div className="composite-cost__fixed-batch">
                                {row.recipeId
                                    ? formatBatch(line?.metrics?.defaultBatchAmount, line?.metrics?.defaultUnit)
                                    : '—'}
                            </div>
                            <input
                                className="composite-cost__input"
                                type="number"
                                min="0"
                                step="0.1"
                                value={row.usageAmount}
                                onChange={(e) => updateRowField(row.id, 'usageAmount', e.target.value)}
                                placeholder="例: 30"
                                disabled={!row.recipeId}
                            />
                            <div className="composite-cost__line-total">{formatMoney(line?.lineCost)}</div>
                            <Button type="button" variant="ghost" onClick={() => removeRow(row.id)} className="composite-cost__remove-btn">✕</Button>
                        </div>
                    );
                })}
            </div>

            <div className="composite-cost__footer">
                <span className="composite-cost__footer-label">合成原価合計（税込）</span>
                <strong className="composite-cost__footer-total">{formatMoney(totalCompositeCost)}</strong>
            </div>

            <div className="composite-cost__profit">
                <div className="composite-cost__profit-head">
                    <strong>合成原価率シミュレーター</strong>
                    <span>合成原価率 = 合成原価合計 ÷ (販売価格 × 販売数)</span>
                </div>

                <div className="composite-cost__profit-grid">
                    <div className="composite-cost__profit-field">
                        <label>販売価格 (1個/1人)</label>
                        <div className="composite-cost__currency-input">
                            <span>¥</span>
                            <input
                                className="composite-cost__input"
                                type="number"
                                min="0"
                                step="1"
                                value={salesPrice}
                                onChange={(e) => setSalesPrice(e.target.value)}
                                placeholder="例: 420"
                            />
                        </div>
                    </div>

                    <div className="composite-cost__profit-field">
                        <label>販売数</label>
                        <input
                            className="composite-cost__input"
                            type="number"
                            min="0"
                            step="1"
                            value={salesCount}
                            onChange={(e) => setSalesCount(e.target.value)}
                            placeholder="例: 10"
                        />
                    </div>
                </div>

                <div className="composite-cost__profit-cards">
                    <div className="composite-cost__profit-card">
                        <span className="composite-cost__profit-label">1個あたり原価(税込)</span>
                        <strong>{formatMoney(compositeFinancials.unitCost)}</strong>
                    </div>
                    <div className="composite-cost__profit-card">
                        <span className="composite-cost__profit-label">予想売上</span>
                        <strong>{formatMoney(compositeFinancials.totalSales)}</strong>
                    </div>
                    <div className="composite-cost__profit-card">
                        <span className="composite-cost__profit-label">粗利益</span>
                        <strong>{formatMoney(compositeFinancials.grossProfit)}</strong>
                    </div>
                    <div className={`composite-cost__profit-card ${Number.isFinite(compositeFinancials.costRate) ? 'composite-cost__profit-card--rate' : ''}`}>
                        <span className="composite-cost__profit-label">合成原価率</span>
                        <strong>
                            {Number.isFinite(compositeFinancials.costRate)
                                ? `${compositeFinancials.costRate.toFixed(1)}%`
                                : '—'}
                        </strong>
                    </div>
                </div>
            </div>
        </div>
    );
};
