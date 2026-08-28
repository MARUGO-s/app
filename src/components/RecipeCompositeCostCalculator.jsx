import React from 'react';
import { Button } from './Button';
import { recipeService } from '../services/recipeService';
import { ingredientSearchService } from '../services/ingredientSearchService';
import { useAuth } from '../contexts/useAuth';
import { costFromQuantityAndUnit, normalizeUnit } from '../utils/unitUtils';
import {
    categoryCostOverrideService,
    computeRecipeTotalCostTaxIncluded,
} from '../services/categoryCostOverrideService';
import {
    buildRecipeMetrics,
    computeBatchStats,
    computeCompositeFinancials,
    getIngredientTaxRate,
    getRecipeIngredients,
    normalizeIngredientCandidate,
    normalizeSavedIngredient,
    toFiniteNumber,
} from '../utils/compositeCostUtils';
import './RecipeCompositeCostCalculator.css';

const createRowId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const IMPACT_CHART_COLORS = [
    '#7A5230',
    '#B8935A',
    '#2F6F73',
    '#587B4D',
    '#9B4E42',
    '#596A8A',
    '#C0894A',
    '#455A64',
];

const getDefaultSalesCount = (recipe) => {
    const servings = toFiniteNumber(recipe?.servings);
    if (!Number.isFinite(servings) || servings <= 0) return '';
    return String(servings);
};

const getUnitCostBasisLabel = (ingredient) => {
    const unit = normalizeUnit(ingredient?.defaultUsageUnit || ingredient?.unit || '');
    if (unit === 'g') return '1kg';
    if (unit === 'ml') return '1L';
    return `1${unit || '単位'}`;
};

const getUsageUnitOptions = (ingredient) => {
    const unit = normalizeUnit(ingredient?.defaultUsageUnit || ingredient?.unit || '');
    if (unit === 'g') return ['g', 'kg'];
    if (unit === 'ml') return ['ml', 'cc', 'cl', 'l'];
    return [unit || '個'];
};

const solveIngredientUsageFromCost = ({ targetCostTaxIncluded, unitCostTaxExcluded, usageUnit, taxRate }) => {
    const target = toFiniteNumber(targetCostTaxIncluded);
    const unitCost = toFiniteNumber(unitCostTaxExcluded);
    const rate = toFiniteNumber(taxRate);
    if (!Number.isFinite(target) || target < 0) return NaN;
    if (!Number.isFinite(unitCost) || unitCost <= 0) return NaN;
    if (!Number.isFinite(rate) || rate <= 0) return NaN;

    const taxExcludedTarget = target / rate;
    const unit = normalizeUnit(usageUnit || '');
    if (unit === 'cl') return (taxExcludedTarget * 100) / unitCost;
    if (unit === 'g' || unit === 'ml' || unit === 'cc') return (taxExcludedTarget * 1000) / unitCost;
    return taxExcludedTarget / unitCost;
};


export const RecipeCompositeCostCalculator = ({
    currentRecipe,
    currentIngredients,
    currentTotalCostTaxIncluded,
    showHeader = true,
    readOnly = false,
    initialState = null,
    initialStateKey = '',
    onStateChange,
    queuedRecipeId = '',
    onQueuedRecipeHandled,
    onBaseRecipeChange,
    onBaseRecipeRemove,
    onOpenRecipeDetail,
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
    const [recipeSearchQuery, setRecipeSearchQuery] = React.useState('');
    const [ingredientSearchQuery, setIngredientSearchQuery] = React.useState('');
    const [ingredientResults, setIngredientResults] = React.useState([]);
    const [loadingIngredients, setLoadingIngredients] = React.useState(false);
    const [targetCostRate, setTargetCostRate] = React.useState('');
    const [comparisonSlots, setComparisonSlots] = React.useState({ a: null, b: null });
    const [usageSolverTargetId, setUsageSolverTargetId] = React.useState('base');
    const [impactChartView, setImpactChartView] = React.useState('pie');
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
                    itemType: row?.itemType === 'ingredient' || row?.ingredient ? 'ingredient' : 'recipe',
                    recipeId: String(row?.recipeId || ''),
                    ingredient: row?.ingredient ? normalizeSavedIngredient(row.ingredient) : null,
                    usageAmount: row?.usageAmount == null ? '' : String(row.usageAmount),
                    usageUnit: row?.usageUnit == null ? '' : String(row.usageUnit),
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
        setTargetCostRate(
            initialState?.targetCostRate == null ? '' : String(initialState.targetCostRate)
        );
        setComparisonSlots({ a: null, b: null });
        setUsageSolverTargetId('base');
    }, [
        currentMetrics.recipeId,
        currentRecipe,
        initialStateKey,
        initialState?.currentUsageAmount,
        initialState?.rows,
        initialState?.salesCount,
        initialState?.salesPrice,
        initialState?.targetCostRate,
    ]);

    React.useEffect(() => {
        let cancelled = false;
        if (readOnly) {
            setCandidateRecipes([]);
            setLoadingCandidates(false);
            return undefined;
        }
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
    }, [user, currentRecipe?.id, readOnly]);

    React.useEffect(() => {
        let cancelled = false;
        const recipeIdsToLoad = Array.from(
            new Set(
                rows
                    .filter((row) => (row?.itemType || 'recipe') === 'recipe')
                    .map((row) => String(row?.recipeId || '').trim())
                    .filter((id) => id && !recipeDetails[id])
            )
        );
        if (recipeIdsToLoad.length === 0) return undefined;

        const loadMissingDetails = async () => {
            for (const recipeId of recipeIdsToLoad) {
                try {
                    const full = await recipeService.getRecipe(recipeId);
                    if (cancelled) return;
                    setRecipeDetails((prev) => ({ ...prev, [recipeId]: full }));
                } catch {
                    // Keep UI usable even if one detail fetch fails.
                }
                try {
                    const overrideMap = await categoryCostOverrideService.fetchByRecipeId(recipeId);
                    if (cancelled) return;
                    setOverrideMapsByRecipe((prev) => ({ ...prev, [recipeId]: overrideMap }));
                } catch {
                    if (cancelled) return;
                    setOverrideMapsByRecipe((prev) => ({ ...prev, [recipeId]: prev[recipeId] || new Map() }));
                }
            }
        };

        loadMissingDetails();
        return () => {
            cancelled = true;
        };
    }, [rows, recipeDetails]);

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

    React.useEffect(() => {
        let cancelled = false;
        if (readOnly) {
            setIngredientResults([]);
            setLoadingIngredients(false);
            return undefined;
        }
        const query = String(ingredientSearchQuery || '').trim();
        if (!query) {
            setIngredientResults([]);
            setLoadingIngredients(false);
            return undefined;
        }

        setLoadingIngredients(true);
        const timer = window.setTimeout(async () => {
            try {
                const results = await ingredientSearchService.search(query);
                if (cancelled) return;
                setIngredientResults(Array.isArray(results) ? results.slice(0, 8) : []);
            } catch {
                if (!cancelled) setIngredientResults([]);
            } finally {
                if (!cancelled) setLoadingIngredients(false);
            }
        }, 220);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [ingredientSearchQuery, readOnly]);

    const getMetricsByRecipe = React.useCallback((recipeObj) => {
        if (!recipeObj) return null;
        const recipeId = String(recipeObj.id || '');
        return buildRecipeMetrics(recipeObj, overrideMapsByRecipe[recipeId] || new Map());
    }, [overrideMapsByRecipe]);

    const filteredRecipeSearchResults = React.useMemo(() => {
        const query = String(recipeSearchQuery || '').trim().toLowerCase();
        const candidates = candidateRecipes.filter((r) => String(r.id) !== String(currentRecipe?.id || ''));
        if (!query) return candidates.slice(0, 6);
        return candidates
            .filter((recipe) => {
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
                return haystack.includes(query);
            })
            .slice(0, 8);
    }, [candidateRecipes, currentRecipe?.id, recipeSearchQuery]);

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
            itemType: 'recipe',
            recipeId: normalizedId,
            usageAmount: '',
            usageUnit: '',
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

    const appendIngredientAsRow = React.useCallback((item) => {
        const ingredient = normalizeIngredientCandidate(item);
        if (!ingredient.name) return;
        setRows((prev) => [...prev, {
            id: createRowId(),
            itemType: 'ingredient',
            recipeId: '',
            ingredient,
            usageAmount: '',
            usageUnit: ingredient.defaultUsageUnit || ingredient.unit || 'g',
        }]);
        setIngredientSearchQuery('');
        setIngredientResults([]);
    }, []);

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
            if ((row.itemType || 'recipe') === 'ingredient') {
                const ingredient = row.ingredient || null;
                const use = toFiniteNumber(row.usageAmount);
                const unit = row.usageUnit || ingredient?.defaultUsageUnit || ingredient?.unit || 'g';
                const unitCost = toFiniteNumber(ingredient?.unitCostTaxExcluded);
                const taxExcluded = costFromQuantityAndUnit(use, unitCost, unit);
                const taxRate = getIngredientTaxRate(ingredient);
                const lineCost = Number.isFinite(taxExcluded) ? taxExcluded * taxRate : NaN;
                return {
                    row,
                    itemType: 'ingredient',
                    ingredient,
                    metrics: null,
                    batch: NaN,
                    use,
                    unitCost,
                    lineCost,
                };
            }

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

    const lineSummaries = React.useMemo(() => {
        const recipeTitleById = new Map(
            candidateRecipes.map((recipe) => [String(recipe.id), recipe.title || `レシピ#${recipe.id}`])
        );
        const total = toFiniteNumber(totalCompositeCost);
        const safePercent = (cost) => (
            Number.isFinite(total) && total > 0 && Number.isFinite(cost)
                ? (cost / total) * 100
                : NaN
        );

        const baseUnit = currentMetrics.defaultUnit || 'g';
        const baseLine = {
            id: 'base',
            itemType: 'recipe',
            label: currentMetrics.title || 'ベースレシピ',
            roleLabel: 'ベース',
            usageAmount: currentUsageAmount,
            usageUnit: baseUnit,
            lineCost: currentLine.lineCost,
            percent: safePercent(currentLine.lineCost),
            recipeUnitCostTaxIncluded: currentLine.unitCost,
            canSolveUsage: Number.isFinite(currentLine.unitCost) && currentLine.unitCost > 0,
        };

        const rowLines = rows.map((row, index) => {
            const line = otherLines.find((x) => x.row.id === row.id);
            if ((row.itemType || 'recipe') === 'ingredient') {
                const ingredient = row.ingredient || {};
                const usageUnit = row.usageUnit || ingredient.defaultUsageUnit || ingredient.unit || 'g';
                const taxRate = getIngredientTaxRate(ingredient);
                const unitCost = toFiniteNumber(ingredient?.unitCostTaxExcluded);
                return {
                    id: row.id,
                    itemType: 'ingredient',
                    label: ingredient.name || `材料${index + 1}`,
                    roleLabel: '材料',
                    usageAmount: row.usageAmount,
                    usageUnit,
                    lineCost: line?.lineCost,
                    percent: safePercent(line?.lineCost),
                    ingredient,
                    ingredientUnitCostTaxExcluded: unitCost,
                    ingredientTaxRate: taxRate,
                    canSolveUsage: Number.isFinite(unitCost) && unitCost > 0 && Number.isFinite(taxRate) && taxRate > 0,
                };
            }

            const recipeId = String(row.recipeId || '');
            const label = line?.metrics?.title
                || recipeDetails[recipeId]?.title
                || recipeTitleById.get(recipeId)
                || (recipeId ? `レシピ#${recipeId}` : `レシピ${index + 1}`);
            return {
                id: row.id,
                itemType: 'recipe',
                label,
                roleLabel: 'レシピ',
                usageAmount: row.usageAmount,
                usageUnit: line?.metrics?.defaultUnit || 'g',
                lineCost: line?.lineCost,
                percent: safePercent(line?.lineCost),
                recipeUnitCostTaxIncluded: line?.unitCost,
                canSolveUsage: Number.isFinite(line?.unitCost) && line.unitCost > 0,
            };
        });

        return [baseLine, ...rowLines];
    }, [
        candidateRecipes,
        currentLine.lineCost,
        currentLine.unitCost,
        currentMetrics.defaultUnit,
        currentMetrics.title,
        currentUsageAmount,
        otherLines,
        recipeDetails,
        rows,
        totalCompositeCost,
    ]);

    const costImpactRows = React.useMemo(() => (
        lineSummaries
            .filter((line) => Number.isFinite(toFiniteNumber(line.lineCost)) && toFiniteNumber(line.lineCost) > 0)
            .sort((a, b) => toFiniteNumber(b.lineCost) - toFiniteNumber(a.lineCost))
    ), [lineSummaries]);

    const impactPieChart = React.useMemo(() => {
        const total = costImpactRows.reduce((sum, line) => sum + toFiniteNumber(line.lineCost), 0);
        if (!Number.isFinite(total) || total <= 0) {
            return {
                total: 0,
                gradient: '#e2e8f0',
            };
        }

        let start = 0;
        const segments = costImpactRows.map((line, index) => {
            const value = toFiniteNumber(line.lineCost);
            const end = index === costImpactRows.length - 1
                ? 360
                : start + (value / total) * 360;
            const color = IMPACT_CHART_COLORS[index % IMPACT_CHART_COLORS.length];
            const segment = `${color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
            start = end;
            return segment;
        });

        return {
            total,
            gradient: `conic-gradient(${segments.join(', ')})`,
        };
    }, [costImpactRows]);

    React.useEffect(() => {
        if (lineSummaries.some((line) => line.id === usageSolverTargetId)) return;
        setUsageSolverTargetId('base');
    }, [lineSummaries, usageSolverTargetId]);

    const compositeFinancials = React.useMemo(() => (
        computeCompositeFinancials({
            totalCompositeCost,
            salesPrice,
            salesCount,
        })
    ), [salesCount, salesPrice, totalCompositeCost]);

    const pricingTarget = React.useMemo(() => {
        const rate = toFiniteNumber(targetCostRate);
        const validRate = Number.isFinite(rate) && rate > 0 && rate < 100;
        const requiredSalesPrice = validRate && Number.isFinite(compositeFinancials.unitCost)
            ? compositeFinancials.unitCost / (rate / 100)
            : NaN;
        const salesPriceValue = toFiniteNumber(salesPrice);
        const gapFromCurrentPrice = Number.isFinite(requiredSalesPrice) && Number.isFinite(salesPriceValue)
            ? salesPriceValue - requiredSalesPrice
            : NaN;
        const isMeetingTarget = validRate && Number.isFinite(compositeFinancials.costRate)
            ? compositeFinancials.costRate <= rate
            : null;

        return {
            rate,
            validRate,
            requiredSalesPrice,
            gapFromCurrentPrice,
            isMeetingTarget,
        };
    }, [targetCostRate, salesPrice, compositeFinancials.unitCost, compositeFinancials.costRate]);

    const usageSolver = React.useMemo(() => {
        const rate = toFiniteNumber(targetCostRate);
        const price = toFiniteNumber(salesPrice);
        const targetLine = lineSummaries.find((line) => line.id === usageSolverTargetId) || lineSummaries[0] || null;
        const validInputs = Number.isFinite(rate) && rate > 0 && rate < 100 && Number.isFinite(price) && price > 0;
        const targetCostLimit = validInputs ? price * (rate / 100) : NaN;
        const otherCost = lineSummaries
            .filter((line) => line.id !== targetLine?.id)
            .reduce((sum, line) => {
                const cost = toFiniteNumber(line.lineCost);
                return Number.isFinite(cost) ? sum + cost : sum;
            }, 0);
        const allowedLineCost = Number.isFinite(targetCostLimit) ? targetCostLimit - otherCost : NaN;
        let solvedUsage = NaN;
        if (targetLine && Number.isFinite(allowedLineCost) && allowedLineCost >= 0 && targetLine.canSolveUsage) {
            if (targetLine.itemType === 'ingredient') {
                solvedUsage = solveIngredientUsageFromCost({
                    targetCostTaxIncluded: allowedLineCost,
                    unitCostTaxExcluded: targetLine.ingredientUnitCostTaxExcluded,
                    usageUnit: targetLine.usageUnit,
                    taxRate: targetLine.ingredientTaxRate,
                });
            } else {
                const unitCost = toFiniteNumber(targetLine.recipeUnitCostTaxIncluded);
                solvedUsage = Number.isFinite(unitCost) && unitCost > 0
                    ? allowedLineCost / unitCost
                    : NaN;
            }
        }

        const currentUsage = toFiniteNumber(targetLine?.usageAmount);
        const usageDiff = Number.isFinite(solvedUsage) && Number.isFinite(currentUsage)
            ? solvedUsage - currentUsage
            : NaN;

        return {
            targetLine,
            validInputs,
            targetCostLimit,
            otherCost,
            allowedLineCost,
            solvedUsage,
            currentUsage,
            usageDiff,
            canApply: !readOnly && Number.isFinite(solvedUsage) && solvedUsage >= 0 && !!targetLine,
            isAlreadyOverOtherCost: Number.isFinite(allowedLineCost) && allowedLineCost < 0,
        };
    }, [lineSummaries, readOnly, salesPrice, targetCostRate, usageSolverTargetId]);

    const snapshot = React.useMemo(() => ({
        baseRecipeId: currentMetrics.recipeId,
        currentUsageAmount,
        rows: rows.map((row) => ({
            itemType: row.itemType || 'recipe',
            recipeId: String(row.recipeId || ''),
            usageAmount: row.usageAmount == null ? '' : String(row.usageAmount),
            usageUnit: row.usageUnit == null ? '' : String(row.usageUnit),
            ingredient: row.ingredient ? {
                name: row.ingredient.name,
                source: row.ingredient.source,
                displaySource: row.ingredient.displaySource,
                price: row.ingredient.price,
                packetSize: row.ingredient.packetSize,
                packetUnit: row.ingredient.packetUnit,
                unit: row.ingredient.unit,
                defaultUsageUnit: row.ingredient.defaultUsageUnit,
                unitCostTaxExcluded: row.ingredient.unitCostTaxExcluded,
                itemCategory: row.ingredient.itemCategory,
            } : null,
        })),
        salesPrice,
        salesCount,
        targetCostRate,
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
        targetCostRate,
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

    const formatPercent = (value) => {
        const n = toFiniteNumber(value);
        if (!Number.isFinite(n)) return '—';
        return `${n.toFixed(1)}%`;
    };

    const formatUsage = (value, unit) => {
        const n = toFiniteNumber(value);
        if (!Number.isFinite(n)) return '—';
        return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit || ''}`;
    };

    const formatBatch = (amount, unit) => {
        const n = toFiniteNumber(amount);
        if (!Number.isFinite(n) || n <= 0) return '—';
        const normalizedUnit = String(unit || 'g').trim().toLowerCase();
        const safeUnit = normalizedUnit === 'ml' ? 'ml' : 'g';
        return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}${safeUnit}`;
    };

    const formatIngredientUnitCost = (ingredient) => {
        const unitCost = toFiniteNumber(ingredient?.unitCostTaxExcluded);
        if (!Number.isFinite(unitCost)) return '単価未設定';
        const taxIncluded = unitCost * getIngredientTaxRate(ingredient);
        return `${formatMoney(taxIncluded)} / ${getUnitCostBasisLabel(ingredient)}`;
    };

    const formatIngredientPack = (ingredient) => {
        const price = toFiniteNumber(ingredient?.price);
        const size = toFiniteNumber(ingredient?.packetSize);
        const unit = ingredient?.packetUnit || ingredient?.unit || '';
        if (Number.isFinite(price) && Number.isFinite(size) && size > 0) {
            return `仕入: ${formatMoney(price)} / ${size.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}`;
        }
        if (Number.isFinite(price)) return `仕入: ${formatMoney(price)}`;
        return '単価情報なし';
    };

    const captureComparisonSlot = (slotKey) => {
        setComparisonSlots((prev) => ({
            ...prev,
            [slotKey]: {
                savedAt: new Date().toISOString(),
                summary: {
                    baseRecipeTitle: currentMetrics.title,
                    baseUsageAmount: currentUsageAmount === '' ? '未入力' : `${currentUsageAmount}g`,
                    rowCount: rows.length + 1,
                    salesPrice: formatMoney(salesPrice),
                    salesCount: salesCount === '' ? '未入力' : `${salesCount}`,
                    unitCost: formatMoney(compositeFinancials.unitCost),
                    totalSales: formatMoney(compositeFinancials.totalSales),
                    grossProfit: formatMoney(compositeFinancials.grossProfit),
                    costRate: Number.isFinite(compositeFinancials.costRate)
                        ? `${compositeFinancials.costRate.toFixed(1)}%`
                        : '—',
                },
            },
        }));
    };

    const applySolvedUsage = () => {
        if (!usageSolver.canApply || !usageSolver.targetLine) return;
        const rounded = Math.max(0, Math.round(usageSolver.solvedUsage * 100) / 100);
        const nextValue = String(rounded);
        if (usageSolver.targetLine.id === 'base') {
            setCurrentUsageAmount(nextValue);
            return;
        }
        updateRowField(usageSolver.targetLine.id, 'usageAmount', nextValue);
    };

    const comparisonRows = React.useMemo(() => {
        const slotA = comparisonSlots.a?.summary || null;
        const slotB = comparisonSlots.b?.summary || null;
        if (!slotA && !slotB) return [];

        const fallback = '—';
        const definitions = [
            ['ベースレシピ', slotA?.baseRecipeTitle ?? fallback, slotB?.baseRecipeTitle ?? fallback],
            ['ベース使用量', slotA?.baseUsageAmount ?? fallback, slotB?.baseUsageAmount ?? fallback],
            ['項目数', slotA ? `${slotA.rowCount}件` : fallback, slotB ? `${slotB.rowCount}件` : fallback],
            ['販売価格', slotA?.salesPrice ?? fallback, slotB?.salesPrice ?? fallback],
            ['販売数', slotA?.salesCount ?? fallback, slotB?.salesCount ?? fallback],
            ['1個原価', slotA?.unitCost ?? fallback, slotB?.unitCost ?? fallback],
            ['予想売上', slotA?.totalSales ?? fallback, slotB?.totalSales ?? fallback],
            ['粗利益', slotA?.grossProfit ?? fallback, slotB?.grossProfit ?? fallback],
            ['原価率', slotA?.costRate ?? fallback, slotB?.costRate ?? fallback],
        ];

        return definitions.map(([label, valueA, valueB]) => ({
            label,
            valueA,
            valueB,
            changed: valueA !== valueB,
        }));
    }, [comparisonSlots]);

    return (
        <div className="screen-only no-print composite-cost">
            {showHeader && (
                <>
                    <h4 className="composite-cost__title">
                        {readOnly ? '📘 合成レシピ版の読み取り専用表示' : '🥪 レシピ合成原価シミュレーター'}
                    </h4>
                    <p className="composite-cost__desc">
                        {readOnly
                            ? '保存されている版の内容を読み取り専用で表示しています。'
                            : '複数レシピの「総出来上がり量」と「使用量」から、惣菜パンなどの合成原価（税込）を試算できます。'}
                    </p>
                </>
            )}

            {!readOnly && (
            <div className="composite-cost__add-panel">
                <div className="composite-cost__add-box">
                    <label htmlFor="composite-recipe-search">レシピ検索</label>
                    <input
                        id="composite-recipe-search"
                        className="composite-cost__input"
                        type="search"
                        value={recipeSearchQuery}
                        onChange={(e) => setRecipeSearchQuery(e.target.value)}
                        placeholder={loadingCandidates ? 'レシピ一覧を読み込み中...' : '例: グリッシーニ'}
                        autoComplete="off"
                    />
                    {recipeSearchQuery && (
                        <div className="composite-cost__quick-results">
                            {filteredRecipeSearchResults.length === 0 ? (
                                <span className="composite-cost__quick-empty">該当するレシピがありません</span>
                            ) : filteredRecipeSearchResults.map((recipe) => (
                                <button
                                    key={recipe.id}
                                    type="button"
                                    className="composite-cost__quick-result"
                                    onClick={() => {
                                        appendRecipeAsRow(recipe.id);
                                        setRecipeSearchQuery('');
                                    }}
                                >
                                    <strong>{recipe.title}</strong>
                                    <span>{[recipe.category, recipe.course, recipe.storeName || recipe.store_name].filter(Boolean).join(' / ') || 'レシピ'}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="composite-cost__add-box">
                    <label htmlFor="composite-ingredient-search">材料検索</label>
                    <input
                        id="composite-ingredient-search"
                        className="composite-cost__input"
                        type="search"
                        value={ingredientSearchQuery}
                        onChange={(e) => setIngredientSearchQuery(e.target.value)}
                        placeholder="例: 生ハム"
                        autoComplete="off"
                    />
                    {ingredientSearchQuery && (
                        <div className="composite-cost__quick-results">
                            {loadingIngredients ? (
                                <span className="composite-cost__quick-empty">材料を検索中...</span>
                            ) : ingredientResults.length === 0 ? (
                                <span className="composite-cost__quick-empty">該当する材料がありません</span>
                            ) : ingredientResults.map((item) => {
                                const ingredient = normalizeIngredientCandidate(item);
                                return (
                                    <button
                                        key={`${item.source}-${item.name}-${item.unit}-${item.size}`}
                                        type="button"
                                        className="composite-cost__quick-result"
                                        onClick={() => appendIngredientAsRow(item)}
                                    >
                                        <strong>{item.name}</strong>
                                        <span>{item.displaySource || '材料'} / {formatIngredientUnitCost(ingredient)} / {formatIngredientPack(ingredient)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            )}

            <div className="composite-cost__grid">
                <div className="composite-cost__head-row">
                    <strong>レシピ</strong>
                    <strong>総量 / 単価基準</strong>
                    <strong>使用量</strong>
                    <strong>使用原価</strong>
                    <span className="composite-cost__remove-spacer" aria-hidden="true" />
                </div>

                <div className="composite-cost__row">
                    <div className="composite-cost__recipe-select-group">
                        <Button
                            type="button"
                            variant="secondary"
                            className="composite-cost__detail-btn"
                            onClick={() => {
                                if (typeof onOpenRecipeDetail !== 'function') return;
                                onOpenRecipeDetail(String(currentRecipe?.id || ''));
                            }}
                            disabled={!currentRecipe?.id}
                        >
                            詳細
                        </Button>
                        <select
                            className="composite-cost__input"
                            value={currentMetrics.recipeId}
                            disabled={readOnly}
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
                    </div>
                    <div className="composite-cost__fixed-batch">{formatBatch(currentMetrics.defaultBatchAmount, currentMetrics.defaultUnit)}</div>
                    <input
                        className="composite-cost__input"
                        type="number"
                        min="0"
                        step="0.1"
                        value={currentUsageAmount}
                        disabled={readOnly}
                        onChange={(e) => setCurrentUsageAmount(e.target.value)}
                        placeholder="例: 100"
                    />
                    <div className="composite-cost__line-total">{formatMoney(currentLine.lineCost)}</div>
                    {readOnly ? (
                        <span className="composite-cost__remove-spacer" aria-hidden="true" />
                    ) : (
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
                    )}
                </div>

                {rows.map((row) => {
                    const line = otherLines.find((x) => x.row.id === row.id);
                    if ((row.itemType || 'recipe') === 'ingredient') {
                        const ingredient = row.ingredient || {};
                        const unitOptions = getUsageUnitOptions(ingredient);
                        return (
                            <div key={row.id} className="composite-cost__row composite-cost__row--with-remove">
                                <div className="composite-cost__ingredient-name">
                                    <strong>{ingredient.name || '材料'}</strong>
                                    <span>{ingredient.displaySource || '材料'} / {formatIngredientPack(ingredient)}</span>
                                </div>
                                <div className="composite-cost__fixed-batch">{formatIngredientUnitCost(ingredient)}</div>
                                <div className="composite-cost__usage-group">
                                    <input
                                        className="composite-cost__input"
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={row.usageAmount}
                                        disabled={readOnly}
                                        onChange={(e) => updateRowField(row.id, 'usageAmount', e.target.value)}
                                        placeholder="例: 10"
                                    />
                                    <select
                                        className="composite-cost__input composite-cost__unit-select"
                                        value={row.usageUnit || ingredient.defaultUsageUnit || ingredient.unit || unitOptions[0]}
                                        disabled={readOnly}
                                        onChange={(e) => updateRowField(row.id, 'usageUnit', e.target.value)}
                                    >
                                        {unitOptions.map((unit) => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="composite-cost__line-total">{formatMoney(line?.lineCost)}</div>
                                {readOnly ? (
                                    <span className="composite-cost__remove-spacer" aria-hidden="true" />
                                ) : (
                                    <Button type="button" variant="ghost" onClick={() => removeRow(row.id)} className="composite-cost__remove-btn">✕</Button>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div key={row.id} className="composite-cost__row composite-cost__row--with-remove">
                            <div className="composite-cost__recipe-select-group">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="composite-cost__detail-btn"
                                    onClick={() => {
                                        if (typeof onOpenRecipeDetail !== 'function') return;
                                        onOpenRecipeDetail(String(row.recipeId || ''));
                                    }}
                                    disabled={!row.recipeId}
                                >
                                    詳細
                                </Button>
                                <select
                                    className="composite-cost__input"
                                    value={row.recipeId}
                                    disabled={readOnly}
                                    onChange={(e) => handleRecipeChange(row.id, e.target.value)}
                                >
                                    <option value="">レシピを選択</option>
                                    {candidateRecipes.map((r) => (
                                        <option key={r.id} value={r.id}>{r.title}</option>
                                    ))}
                                </select>
                            </div>
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
                                disabled={readOnly || !row.recipeId}
                            />
                            <div className="composite-cost__line-total">{formatMoney(line?.lineCost)}</div>
                            {readOnly ? (
                                <span className="composite-cost__remove-spacer" aria-hidden="true" />
                            ) : (
                                <Button type="button" variant="ghost" onClick={() => removeRow(row.id)} className="composite-cost__remove-btn">✕</Button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="composite-cost__footer">
                <span className="composite-cost__footer-label">合成原価合計（税込）</span>
                <strong className="composite-cost__footer-total">{formatMoney(totalCompositeCost)}</strong>
            </div>

            <div className="composite-cost__impact">
                <div className="composite-cost__impact-head">
                    <div className="composite-cost__impact-head-main">
                        <strong>原価インパクト分析</strong>
                        <span>合成原価に占める割合が大きい順に表示します。</span>
                    </div>
                    <div className="composite-cost__impact-switch" role="group" aria-label="原価インパクト分析の表示切替">
                        <button
                            type="button"
                            className={`composite-cost__impact-switch-btn ${impactChartView === 'bar' ? 'is-active' : ''}`}
                            aria-pressed={impactChartView === 'bar'}
                            onClick={() => setImpactChartView('bar')}
                        >
                            棒グラフ
                        </button>
                        <button
                            type="button"
                            className={`composite-cost__impact-switch-btn ${impactChartView === 'pie' ? 'is-active' : ''}`}
                            aria-pressed={impactChartView === 'pie'}
                            onClick={() => setImpactChartView('pie')}
                        >
                            円グラフ
                        </button>
                    </div>
                </div>
                {costImpactRows.length === 0 ? (
                    <div className="composite-cost__impact-empty">使用量を入力すると、行別の寄与率が表示されます。</div>
                ) : impactChartView === 'pie' ? (
                    <div className="composite-cost__impact-pie-view">
                        <div className="composite-cost__impact-pie-wrap">
                            <div
                                className="composite-cost__impact-pie"
                                style={{ background: impactPieChart.gradient }}
                                role="img"
                                aria-label="合成原価に占める行別割合の円グラフ"
                            />
                            <div className="composite-cost__impact-pie-center">
                                <span>合計</span>
                                <strong>{formatMoney(impactPieChart.total)}</strong>
                            </div>
                        </div>
                        <div className="composite-cost__impact-legend">
                            {costImpactRows.map((line, index) => (
                                <div key={line.id} className="composite-cost__impact-legend-row">
                                    <span
                                        className="composite-cost__impact-legend-swatch"
                                        style={{ background: IMPACT_CHART_COLORS[index % IMPACT_CHART_COLORS.length] }}
                                        aria-hidden="true"
                                    />
                                    <div className="composite-cost__impact-legend-name">
                                        <strong>{line.label}</strong>
                                        <span>{line.roleLabel} / {formatUsage(line.usageAmount, line.usageUnit)}</span>
                                    </div>
                                    <div className="composite-cost__impact-legend-values">
                                        <strong>{formatMoney(line.lineCost)}</strong>
                                        <span>{formatPercent(line.percent)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="composite-cost__impact-list">
                        {costImpactRows.map((line, index) => (
                            <div key={line.id} className="composite-cost__impact-row">
                                <div className="composite-cost__impact-name">
                                    <span>{index + 1}</span>
                                    <div>
                                        <strong>{line.label}</strong>
                                        <em>{line.roleLabel} / {formatUsage(line.usageAmount, line.usageUnit)}</em>
                                    </div>
                                </div>
                                <div className="composite-cost__impact-meter" aria-label={`${line.label} ${formatPercent(line.percent)}`}>
                                    <span style={{ width: `${Math.min(100, Math.max(0, toFiniteNumber(line.percent) || 0))}%` }} />
                                </div>
                                <div className="composite-cost__impact-values">
                                    <strong>{formatMoney(line.lineCost)}</strong>
                                    <span>{formatPercent(line.percent)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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
                                disabled={readOnly}
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
                            disabled={readOnly}
                            onChange={(e) => setSalesCount(e.target.value)}
                            placeholder="例: 10"
                        />
                    </div>

                    <div className="composite-cost__profit-field">
                        <label>目標原価率 (%)</label>
                        <input
                            className="composite-cost__input"
                            type="number"
                            min="0.1"
                            max="99.9"
                            step="0.1"
                            value={targetCostRate}
                            disabled={readOnly}
                            onChange={(e) => setTargetCostRate(e.target.value)}
                            placeholder="例: 35"
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
                    <div className={`composite-cost__profit-card ${pricingTarget.validRate ? 'composite-cost__profit-card--target' : ''}`}>
                        <span className="composite-cost__profit-label">目標達成に必要な売価</span>
                        <strong>{formatMoney(pricingTarget.requiredSalesPrice)}</strong>
                    </div>
                    <div className={`composite-cost__profit-card ${pricingTarget.isMeetingTarget === false ? 'composite-cost__profit-card--warning' : ''}`}>
                        <span className="composite-cost__profit-label">現在売価との差額</span>
                        <strong>
                            {Number.isFinite(pricingTarget.gapFromCurrentPrice)
                                ? `${pricingTarget.gapFromCurrentPrice >= 0 ? '+' : ''}${formatMoney(pricingTarget.gapFromCurrentPrice)}`
                                : '—'}
                        </strong>
                    </div>
                </div>

                <div className="composite-cost__target-note">
                    {pricingTarget.validRate
                        ? (
                            pricingTarget.isMeetingTarget === null
                                ? `目標原価率 ${pricingTarget.rate.toFixed(1)}% から必要売価を逆算しています。`
                                : (
                                    pricingTarget.isMeetingTarget
                                        ? `現在の売価は、目標原価率 ${pricingTarget.rate.toFixed(1)}% を満たしています。`
                                        : `現在の売価では目標原価率 ${pricingTarget.rate.toFixed(1)}% を超えています。必要売価を基準に見直してください。`
                                )
                        )
                        : '目標原価率を入れると、必要な売価を逆算できます。'}
                </div>

                {!readOnly && (
                    <div className="composite-cost__usage-solver">
                        <div className="composite-cost__usage-solver-head">
                            <strong>目標原価率から使用量を逆算</strong>
                            <span>対象行以外の原価を固定して、目標内に収まる使用量を出します。</span>
                        </div>
                        <div className="composite-cost__usage-solver-grid">
                            <div className="composite-cost__profit-field">
                                <label>逆算する行</label>
                                <select
                                    className="composite-cost__input"
                                    value={usageSolverTargetId}
                                    onChange={(e) => setUsageSolverTargetId(e.target.value)}
                                >
                                    {lineSummaries.map((line) => (
                                        <option key={line.id} value={line.id}>
                                            {line.roleLabel}: {line.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="composite-cost__usage-solver-card">
                                <span>許容原価</span>
                                <strong>{formatMoney(usageSolver.targetCostLimit)}</strong>
                            </div>
                            <div className="composite-cost__usage-solver-card">
                                <span>対象外の原価</span>
                                <strong>{formatMoney(usageSolver.otherCost)}</strong>
                            </div>
                            <div className={`composite-cost__usage-solver-card ${usageSolver.isAlreadyOverOtherCost ? 'composite-cost__usage-solver-card--warning' : ''}`}>
                                <span>対象行に使える原価</span>
                                <strong>{formatMoney(usageSolver.allowedLineCost)}</strong>
                            </div>
                            <div className="composite-cost__usage-solver-card composite-cost__usage-solver-card--result">
                                <span>上限使用量</span>
                                <strong>{formatUsage(usageSolver.solvedUsage, usageSolver.targetLine?.usageUnit)}</strong>
                            </div>
                            <div className="composite-cost__usage-solver-card">
                                <span>現在との差</span>
                                <strong>
                                    {Number.isFinite(usageSolver.usageDiff)
                                        ? `${usageSolver.usageDiff >= 0 ? '+' : ''}${formatUsage(usageSolver.usageDiff, usageSolver.targetLine?.usageUnit)}`
                                        : '—'}
                                </strong>
                            </div>
                        </div>
                        <div className="composite-cost__usage-solver-actions">
                            <span>
                                {usageSolver.validInputs
                                    ? (usageSolver.isAlreadyOverOtherCost
                                        ? '対象行を0にしても、他の行だけで目標原価率を超えています。'
                                        : '販売価格と目標原価率から使用量を逆算しています。')
                                    : '販売価格と目標原価率を入力すると逆算できます。'}
                            </span>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={applySolvedUsage}
                                disabled={!usageSolver.canApply}
                            >
                                この使用量を反映
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {!readOnly && (
                <div className="composite-cost__compare">
                    <div className="composite-cost__compare-head">
                        <div>
                            <strong>2案比較</strong>
                            <span>現在の内容を案A / 案Bに保存して、売価・原価率・粗利を並べて比較します。</span>
                        </div>
                        <div className="composite-cost__compare-actions">
                            <Button type="button" variant="secondary" onClick={() => captureComparisonSlot('a')}>
                                現在を案Aに保存
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => captureComparisonSlot('b')}>
                                現在を案Bに保存
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setComparisonSlots({ a: null, b: null })}>
                                比較をクリア
                            </Button>
                        </div>
                    </div>

                    {(comparisonSlots.a || comparisonSlots.b) ? (
                        <>
                            <div className="composite-cost__compare-grid">
                                <div className="composite-cost__compare-card">
                                    <span className="composite-cost__compare-card-label">案A</span>
                                    <strong>{comparisonSlots.a ? `保存時刻 ${new Date(comparisonSlots.a.savedAt).toLocaleString()}` : '未保存'}</strong>
                                </div>
                                <div className="composite-cost__compare-card">
                                    <span className="composite-cost__compare-card-label">案B</span>
                                    <strong>{comparisonSlots.b ? `保存時刻 ${new Date(comparisonSlots.b.savedAt).toLocaleString()}` : '未保存'}</strong>
                                </div>
                            </div>

                            <div className="composite-cost__compare-table">
                                <div className="composite-cost__compare-table-head">
                                    <strong>比較項目</strong>
                                    <strong>案A</strong>
                                    <strong>案B</strong>
                                </div>
                                {comparisonRows.map((row) => (
                                    <div
                                        key={row.label}
                                        className={`composite-cost__compare-table-row ${row.changed ? 'is-changed' : ''}`}
                                    >
                                        <span>{row.label}</span>
                                        <strong>{row.valueA}</strong>
                                        <strong>{row.valueB}</strong>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="composite-cost__compare-empty">
                            まず現在の内容を案Aまたは案Bに保存してください。
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
