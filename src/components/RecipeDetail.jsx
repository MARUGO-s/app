import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import { translationService } from '../services/translationService';
import { recipeService } from '../services/recipeService';
import {
    categoryCostOverrideService,
    getRecipeCostCategories,
    computeRecipeTotalCostTaxIncluded,
} from '../services/categoryCostOverrideService';
import { unitConversionService } from '../services/unitConversionService';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { SUPPORTED_LANGUAGES } from '../constants';
import { normalizeUnit } from '../utils/unitUtils';
import './RecipeDetail.css';
import QRCode from "react-qr-code";

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const toFiniteCurrencyNumber = (value) => {
    if (value == null) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const normalized = String(value).trim().replace(/[¥,\s]/g, '');
    if (!normalized) return NaN;
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : NaN;
};

const formatYen = (value, { maximumFractionDigits = 1 } = {}) => {
    const n = toFiniteCurrencyNumber(value);
    if (!Number.isFinite(n)) return null;
    return `¥${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits })}`;
};

const formatCompactNumber = (value, { maximumFractionDigits = 2 } = {}) => {
    if (!Number.isFinite(value)) return null;
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    });
};

const formatWeightSummary = (grams) => {
    if (!Number.isFinite(grams) || grams <= 0) return '—';
    if (grams >= 1000) {
        return `${formatCompactNumber(grams, { maximumFractionDigits: 1 })} g (${formatCompactNumber(grams / 1000)} kg)`;
    }
    return `${formatCompactNumber(grams, { maximumFractionDigits: 1 })} g`;
};

const formatVolumeSummary = (milliliters) => {
    if (!Number.isFinite(milliliters) || milliliters <= 0) return '—';
    if (milliliters >= 1000) {
        return `${formatCompactNumber(milliliters, { maximumFractionDigits: 1 })} ml (${formatCompactNumber(milliliters / 1000)} L)`;
    }
    return `${formatCompactNumber(milliliters, { maximumFractionDigits: 1 })} ml`;
};

const ALLOWED_ITEM_CATEGORIES = new Set(['food', 'alcohol', 'soft_drink', 'supplies']);
const TAX10_ITEM_CATEGORIES = new Set(['alcohol', 'supplies']);

const normalizeItemCategory = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'food_alcohol') return 'food';
    if (ALLOWED_ITEM_CATEGORIES.has(normalized)) return normalized;
    return '';
};

const isTax10Item = (item) => {
    const category = normalizeItemCategory(item?.itemCategory ?? item?.item_category);
    if (category) return TAX10_ITEM_CATEGORIES.has(category);
    return Boolean(item?.isAlcohol);
};

const getItemTaxRate = (item) => (isTax10Item(item) ? 1.10 : 1.08);

const normalizeIngredientName = (value) =>
    String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

const findConversionByName = (conversionMap, ingredientName) => {
    if (!conversionMap || conversionMap.size === 0) return null;
    if (!ingredientName) return null;

    const direct = conversionMap.get(ingredientName);
    if (direct) return direct;

    const target = normalizeIngredientName(ingredientName);
    if (!target) return null;

    for (const [key, value] of conversionMap.entries()) {
        if (normalizeIngredientName(key) === target) {
            return value;
        }
    }
    return null;
};

const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
};

const normalizeYieldPercent = (value) => {
    const n = toFiniteNumber(value);
    if (!Number.isFinite(n)) return 100;
    if (n <= 0) return 100;
    if (n > 100) return 100;
    return n;
};

const getYieldRate = (item, conversion) => {
    const raw = conversion?.yieldPercent ?? conversion?.yield_percent ?? item?.yieldPercent ?? item?.yield_percent;
    return normalizeYieldPercent(raw) / 100;
};

const normalizePurchaseCostByConversion = (basePrice, packetSize, packetUnit) => {
    const safeBase = toFiniteNumber(basePrice);
    const safePacketSize = toFiniteNumber(packetSize);
    if (!Number.isFinite(safeBase) || !Number.isFinite(safePacketSize) || safePacketSize <= 0) return NaN;

    const pu = String(packetUnit || '').trim().toLowerCase();
    if (['g', 'ｇ', 'ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(pu)) {
        return (safeBase / safePacketSize) * 1000;
    }
    if (['kg', 'ｋｇ', 'l', 'ｌ'].includes(pu)) {
        return safeBase / safePacketSize;
    }
    if (['cl', 'ｃｌ'].includes(pu)) {
        return (safeBase / safePacketSize) * 100;
    }
    return safeBase / safePacketSize;
};

const calculateCostByUnit = (quantity, purchaseCost, unit, { defaultWeightWhenUnitEmpty = false, forceWeightBased = false, yieldRate = 1 } = {}) => {
    const qty = toFiniteNumber(quantity);
    const pCost = toFiniteNumber(purchaseCost);
    if (!Number.isFinite(qty) || !Number.isFinite(pCost)) return NaN;

    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;

    const normalizedUnit = String(unit || '').trim().toLowerCase();
    if (forceWeightBased) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    if (!normalizedUnit && defaultWeightWhenUnitEmpty) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    if (['g', 'ｇ', 'ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(normalizedUnit)) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    if (['cl', 'ｃｌ'].includes(normalizedUnit)) {
        return ((qty * 10 / 1000) * pCost) / safeYieldRate;
    }
    return (qty * pCost) / safeYieldRate;
};

const summarizeIngredientGroup = (items, { multiplier = 1, totalRecipeCostTaxIncluded = 0 } = {}) => {
    const quantityByUnit = new Map();
    let ingredientCount = 0;
    let quantifiedItemCount = 0;
    let totalWeightGrams = 0;
    let totalVolumeMl = 0;
    let costTaxExcluded = 0;
    let costTaxIncluded = 0;

    items.forEach((item) => {
        if (!item) return;

        ingredientCount += 1;
        if (typeof item !== 'object') return;

        const qty = toFiniteNumber(item.quantity);
        const scaledQty = Number.isFinite(qty) ? qty * multiplier : NaN;
        const rawUnit = String(item.unit || '').trim();
        const normalizedUnit = normalizeUnit(rawUnit);

        if (Number.isFinite(scaledQty)) {
            quantifiedItemCount += 1;
            const quantityLabel = rawUnit || '単位なし';
            quantityByUnit.set(quantityLabel, (quantityByUnit.get(quantityLabel) || 0) + scaledQty);

            if (normalizedUnit === 'g') totalWeightGrams += scaledQty;
            if (normalizedUnit === 'kg') totalWeightGrams += scaledQty * 1000;
            if (normalizedUnit === 'ml' || normalizedUnit === 'cc') totalVolumeMl += scaledQty;
            if (normalizedUnit === 'cl') totalVolumeMl += scaledQty * 10;
            if (normalizedUnit === 'l') totalVolumeMl += scaledQty * 1000;
        }

        const rawCost = toFiniteNumber(item.cost);
        if (Number.isFinite(rawCost)) {
            const scaledCost = rawCost * multiplier;
            costTaxExcluded += scaledCost;
            costTaxIncluded += scaledCost * getItemTaxRate(item);
        }
    });

    const quantityBreakdown = Array.from(quantityByUnit.entries()).map(([unitLabel, total]) => ({
        unitLabel,
        total,
        display: unitLabel === '単位なし'
            ? `${formatCompactNumber(total)}`
            : `${formatCompactNumber(total)} ${unitLabel}`,
    }));

    const hasWeightBasis = totalWeightGrams > 0;
    const hasVolumeBasis = totalVolumeMl > 0;
    const hasMixedMeasure = hasWeightBasis && hasVolumeBasis;
    const defaultUsageUnit = hasWeightBasis ? 'g' : (hasVolumeBasis ? 'ml' : 'g');
    const defaultBatchAmount =
        hasWeightBasis || hasVolumeBasis
            ? (totalWeightGrams + totalVolumeMl)
            : null;
    const defaultBatchAmountSource = hasMixedMeasure
        ? 'mixed_g_plus_ml'
        : (hasWeightBasis ? 'weight_only' : (hasVolumeBasis ? 'volume_only' : 'manual'));

    return {
        ingredientCount,
        quantifiedItemCount,
        quantityBreakdown,
        totalWeightGrams,
        totalVolumeMl,
        hasWeightBasis,
        hasVolumeBasis,
        hasMixedMeasure,
        defaultUsageUnit,
        defaultBatchAmount,
        defaultBatchAmountSource,
        costTaxExcluded,
        costTaxIncluded,
        costShare: totalRecipeCostTaxIncluded > 0
            ? (costTaxIncluded / totalRecipeCostTaxIncluded) * 100
            : null,
    };
};

const isLikelyLegacyPackPrice = (item, normalizedCost) => {
    const stored = toFiniteNumber(item?.purchaseCost);
    const ref = toFiniteNumber(item?.purchaseCostRef ?? item?.purchase_cost);
    if (!Number.isFinite(normalizedCost)) return false;
    if (!Number.isFinite(stored)) return true;

    // Legacy case: purchaseCost was saved as pack price (= purchaseCostRef), not normalized unit cost.
    if (Number.isFinite(ref) && Math.abs(stored - ref) < 0.0001 && Math.abs(stored - normalizedCost) > 0.01) {
        return true;
    }
    return false;
};

const REQUIRED_TRANSLATION_VERSION = 2;

const UI_TEXT_DEFAULT = Object.freeze({
    course: 'コース',
    category: 'カテゴリー',
    storeName: '店舗名',
    servings: '分量',
    ingredients: '材料',
    ingredientName: '材料名',
    quantity: '分量',
    quantityGram: '分量 (g)',
    unit: '単位',
    purchase: '仕入れ',
    cost: '原価',
    totalCost: '合計原価',
    instructions: '作り方',
    sourceRecipe: '元レシピを見る',
    flourGroup: '粉グループ',
    otherIngredients: 'その他材料',
    scaleMultiplier: '分量倍率',
    noSteps: '手順情報がありません。',
    print: '印刷する',
    close: '閉じる',
});

const UI_TEXT_KEYS = Object.keys(UI_TEXT_DEFAULT);

export const RecipeDetail = ({ recipe, ownerLabel, onBack, onEdit, onDelete, onHardDelete, isDeleted, onView, onDuplicate, onOpenCompositeCost, backLabel, onList, forceEditEnabled = false }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [showDuplicateConfirm, setShowDuplicateConfirm] = React.useState(false);
    const [showHardDeleteConfirm, setShowHardDeleteConfirm] = React.useState(false);
    const [completedSteps, setCompletedSteps] = React.useState(new Set());
    const [previewCompletedSteps, setPreviewCompletedSteps] = React.useState(new Set());
    const [previewCompletedIngredients, setPreviewCompletedIngredients] = React.useState(new Set());

    const [translationCache, setTranslationCache] = React.useState({}); // {[langCode]: recipeObj }
    const [currentLang, setCurrentLang] = React.useState('ORIGINAL'); // 'ORIGINAL' is source text
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [showOriginal, setShowOriginal] = React.useState(true); // Default to showing original
    const [showPrintModal, setShowPrintModal] = React.useState(false);
    const [selectedIngredientGroupStats, setSelectedIngredientGroupStats] = React.useState(null);
    const [costReferenceMode, setCostReferenceMode] = React.useState('original');
    const [categoryCostOverrides, setCategoryCostOverrides] = React.useState(new Map());
    const [overrideCostInput, setOverrideCostInput] = React.useState('');
    const [isSavingCategoryOverride, setIsSavingCategoryOverride] = React.useState(false);
    const [groupUsageUnit, setGroupUsageUnit] = React.useState('g');
    const [groupTotalBatchAmount, setGroupTotalBatchAmount] = React.useState('');
    const [groupUsageAmount, setGroupUsageAmount] = React.useState('');
    const [groupUsageAmountByCategory, setGroupUsageAmountByCategory] = React.useState(new Map());
    const [conversionMap, setConversionMap] = React.useState(new Map());
    const [uiTextCache, setUiTextCache] = React.useState({});

    // Scaling State
    const [baseItem, setBaseItem] = React.useState('total'); // 'total', 'flourTotal', 'flour-0', 'other-1', etc.
    const [targetTotal, setTargetTotal] = React.useState(''); // For Bread (actually represents targetBaseAmount now)
    const [multiplier, setMultiplier] = React.useState(1);    // For Normal
    const [normalBaseItem, setNormalBaseItem] = React.useState('multiplier'); // 'multiplier', 'ing-0', 'ing-groupId-0', etc.
    const [normalBaseTarget, setNormalBaseTarget] = React.useState(''); // For Normal base item target qty

    // Profit Calculator State
    const [salesPrice, setSalesPrice] = React.useState('');
    const [calcServings, setCalcServings] = React.useState('');

    // Helper for Normal Recipe Scaling
    const getScaledQty = (qty, mult) => {
        if (!qty) return '';
        const num = parseFloat(qty);
        if (isNaN(num)) return qty;
        // Float precision handling could be better but simple for now
        const val = num * parseFloat(mult);
        // Avoid .00 if integer
        return Number.isInteger(val) ? val.toString() : val.toFixed(1).replace(/\.0$/, '');
    };

    const getScaledCost = (cost, mult) => {
        if (!cost) return '';
        const num = parseFloat(cost);
        if (isNaN(num)) return cost;
        // Round to 2 decimals for display consistency? Or integer for yen?
        // User wants decimal input, but maybe integer display scaled?
        // Let's keep decimal precision for accurate totals, verify display later.
        // If the cost is small (e.g. 0.5), scaling by 1 should be 0.5.
        // parseInt was truncating 0.5 to 0.
        return (num * parseFloat(mult)).toFixed(2).replace(/\.00$/, '');
    };

    // State for full recipe data (fetched if steps are missing)
    const [fullRecipe, setFullRecipe] = React.useState(recipe);
    const [_loadingDetail, setLoadingDetail] = React.useState(false);
    const [showQrCodeModal, setShowQrCodeModal] = React.useState(false);

    // Source recipe for original-language references (prefer full detail once loaded)
    const sourceRecipe = fullRecipe || recipe;

    // Determines which data to show
    const displayRecipe = currentLang === 'ORIGINAL' ? fullRecipe : (translationCache[currentLang] || fullRecipe);
    const uiText = (currentLang === 'ORIGINAL' || currentLang === 'JA')
        ? UI_TEXT_DEFAULT
        : (uiTextCache[currentLang] || UI_TEXT_DEFAULT);
    const tUi = (key) => uiText[key] || UI_TEXT_DEFAULT[key] || key;

    React.useEffect(() => {
        let mounted = true;
        unitConversionService.getAllConversions()
            .then((map) => {
                if (mounted) setConversionMap(map);
            })
            .catch(() => {
                if (mounted) setConversionMap(new Map());
            });
        return () => {
            mounted = false;
        };
    }, []);

    const costAdjustedRecipe = React.useMemo(() => {
        const adjustItem = (item, options = {}) => {
            if (!item || typeof item !== 'object') return item;

            const conv = findConversionByName(conversionMap, item.name);
            const normalizedCategory = normalizeItemCategory(item.itemCategory ?? item.item_category ?? conv?.itemCategory);
            const yieldRate = getYieldRate(item, conv);

            let nextItem = item;
            if (normalizedCategory) {
                nextItem = {
                    ...nextItem,
                    itemCategory: normalizedCategory,
                    isAlcohol: TAX10_ITEM_CATEGORIES.has(normalizedCategory),
                };
            }

            if (!conv || !conv.packetSize) {
                const unitRaw = String(item.unit || '').trim();
                const shouldWeightBased =
                    options.forceWeightBased || (options.defaultWeightWhenUnitEmpty && !unitRaw);
                if (shouldWeightBased) {
                    const expectedCostRaw = calculateCostByUnit(item.quantity, nextItem.purchaseCost, item.unit, { ...options, yieldRate });
                    const expectedCost = Number.isFinite(expectedCostRaw)
                        ? Math.round(expectedCostRaw * 100) / 100
                        : NaN;
                    const currentCost = toFiniteNumber(nextItem.cost);
                    if (Number.isFinite(expectedCost) && (!Number.isFinite(currentCost) || Math.abs(currentCost - expectedCost) > 0.01)) {
                        return {
                            ...nextItem,
                            cost: expectedCost,
                        };
                    }
                }
                return nextItem;
            }

            const basePriceCandidates = [
                conv.lastPrice,
                item.purchaseCostRef,
                item.purchase_cost,
                item.purchaseCost,
            ];
            const basePrice = basePriceCandidates.find((v) => Number.isFinite(toFiniteNumber(v)));
            const normalizedCost = normalizePurchaseCostByConversion(basePrice, conv.packetSize, conv.packetUnit);
            if (!Number.isFinite(normalizedCost)) return nextItem;

            if (!isLikelyLegacyPackPrice(item, normalizedCost)) {
                return nextItem;
            }

            const recalculatedCost = calculateCostByUnit(item.quantity, normalizedCost, item.unit, { ...options, yieldRate });

            return {
                ...nextItem,
                purchaseCost: Math.round(normalizedCost * 100) / 100,
                cost: Number.isFinite(recalculatedCost)
                    ? Math.round(recalculatedCost * 100) / 100
                    : nextItem.cost,
            };
        };

        return {
            ...displayRecipe,
            ingredients: (displayRecipe.ingredients || []).map((item) => adjustItem(item)),
            flours: (displayRecipe.flours || []).map((item) =>
                adjustItem(item, { forceWeightBased: true })
            ),
            breadIngredients: (displayRecipe.breadIngredients || []).map((item) =>
                adjustItem(item, { forceWeightBased: true })
            ),
        };
    }, [conversionMap, displayRecipe]);

    React.useEffect(() => {
        // If recipe prop changes, reset fullRecipe to it initially
        setFullRecipe(recipe);

        // If steps are missing, fetch full details
        if (!recipe.steps && !isDeleted) {
            setLoadingDetail(true);
            recipeService.getRecipe(recipe.id)
                .then(data => {
                    setFullRecipe(data);
                })
                .catch(err => {
                    console.error("Failed to load details", err);
                })
                .finally(() => {
                    setLoadingDetail(false);
                });
        }
    }, [recipe, isDeleted]);

    React.useEffect(() => {
        let cancelled = false;
        if (isDeleted || !recipe?.id) {
            setCategoryCostOverrides(new Map());
            setGroupUsageAmountByCategory(new Map());
            return undefined;
        }
        setGroupUsageAmountByCategory(new Map());

        const loadCategoryOverrides = async () => {
            try {
                const overrideMap = await categoryCostOverrideService.fetchByRecipeId(recipe.id);
                if (cancelled) return;
                setCategoryCostOverrides(overrideMap);
            } catch {
                if (cancelled) return;
                setCategoryCostOverrides(new Map());
            }
        };

        loadCategoryOverrides();
        return () => {
            cancelled = true;
        };
    }, [recipe?.id, isDeleted]);

    const [isPublic, setIsPublic] = React.useState(recipe.tags?.includes('public') || false);
    const isOwner =
        user?.role === 'admin' ||
        (recipe.tags && recipe.tags.includes(`owner:${user?.id}`)) ||
        (user?.displayId && recipe.tags && recipe.tags.includes(`owner:${user.displayId}`));
    // If no owner tag, assume public/legacy, but for safety treat as owner if no tag present? 
    // Actually, logic in service says "No owner tag -> Visible". So let's say "Can Edit" if (No Owner OR Owner is Me OR Admin).
    const hasOwnerTag = recipe.tags && recipe.tags.some(t => t.startsWith('owner:'));
    const canEdit = !hasOwnerTag || isOwner;

    // Toggle Public Handler
    const handleTogglePublic = async () => {
        const newStatus = !isPublic;
        try {
            const currentTags = recipe.tags || [];
            let newTags;
            if (newStatus) {
                newTags = [...currentTags, 'public'];
            } else {
                newTags = currentTags.filter(t => t !== 'public');
            }

            // Optimistic update
            setIsPublic(newStatus);

            // Save
            // Update tags only (avoid overwriting steps/sourceUrl when the list-view recipe is partial).
            await recipeService.updateRecipe({ id: recipe.id, tags: newTags });

            // Ideally notify update parent, but local state is fine for switch
        } catch (e) {
            console.error("Failed to toggle public", e);
            toast.error("公開設定の変更に失敗しました");
            setIsPublic(!newStatus); // Revert
        }
    };


    const renderText = (text, originalText, isLongText = false) => {
        if (currentLang === 'ORIGINAL' || !showOriginal || !originalText || text === originalText) {
            return text;
        }
        return (
            <>
                {text}
                {isLongText ? <br /> : ' '}
                <span className="original-text-sub" style={{ opacity: 0.6, fontSize: '0.85em', fontWeight: 'normal' }}>
                    ({originalText})
                </span>
            </>
        );
    };

    const renderPrintText = (text, originalText) => {
        const translated = String(text ?? '').trim();
        const original = String(originalText ?? '').trim();
        if (currentLang === 'ORIGINAL' || !showOriginal || !original || translated === original) {
            return translated || original;
        }
        return `${translated}；${original}`;
    };

    const hasDetailedRecipeData = (targetRecipe) => {
        if (!targetRecipe) return false;

        const hasSteps = Array.isArray(targetRecipe.steps);
        if (!hasSteps) return false;

        if (targetRecipe.type === 'bread') {
            return Array.isArray(targetRecipe.flours) && Array.isArray(targetRecipe.breadIngredients);
        }

        return Array.isArray(targetRecipe.ingredients);
    };

    const isTranslationComplete = (translatedRecipe, sourceRecipe) => {
        if (!translatedRecipe || !sourceRecipe) return false;
        if (translatedRecipe.__translationVersion !== REQUIRED_TRANSLATION_VERSION) {
            return false;
        }

        if (Array.isArray(sourceRecipe.steps) && !Array.isArray(translatedRecipe.steps)) {
            return false;
        }

        if (sourceRecipe.type === 'bread') {
            if ((sourceRecipe.flours || []).length > 0 && (translatedRecipe.flours || []).length === 0) {
                return false;
            }
            if ((sourceRecipe.breadIngredients || []).length > 0 && (translatedRecipe.breadIngredients || []).length === 0) {
                return false;
            }
            return true;
        }

        if ((sourceRecipe.ingredients || []).length > 0 && (translatedRecipe.ingredients || []).length === 0) {
            return false;
        }

        return true;
    };

    const handleLanguageChange = async (e) => {
        const langCode = e.target.value;
        setCurrentLang(langCode);

        if (langCode === 'ORIGINAL') {
            return;
        }

        let targetRecipe = fullRecipe || recipe;

        // Important: list view provides partial recipe data.
        // Ensure translation runs against full detail (ingredients + steps).
        if (!isDeleted && recipe?.id && !hasDetailedRecipeData(targetRecipe)) {
            try {
                setLoadingDetail(true);
                const detailed = await recipeService.getRecipe(recipe.id);
                if (detailed) {
                    targetRecipe = detailed;
                    setFullRecipe(detailed);
                }
            } catch (detailError) {
                console.error("Failed to load full recipe for translation", detailError);
            } finally {
                setLoadingDetail(false);
            }
        }

        const hasRecipeTranslation = translationCache[langCode] && isTranslationComplete(translationCache[langCode], targetRecipe);
        const needsUiTranslation = langCode !== 'JA' && !uiTextCache[langCode];

        if (hasRecipeTranslation && !needsUiTranslation) return;

        setIsTranslating(true);
        try {
            let recipeError = null;

            await Promise.all([
                (async () => {
                    if (hasRecipeTranslation) return;
                    try {
                        const translated = await translationService.translateRecipe(targetRecipe, langCode);
                        setTranslationCache(prev => ({ ...prev, [langCode]: translated }));
                    } catch (err) {
                        recipeError = err;
                    }
                })(),
                (async () => {
                    if (!needsUiTranslation) return;
                    try {
                        const translatedUiValues = await translationService.translateList(
                            UI_TEXT_KEYS.map((key) => UI_TEXT_DEFAULT[key]),
                            langCode
                        );
                        const translatedUi = UI_TEXT_KEYS.reduce((acc, key, index) => {
                            acc[key] = translatedUiValues[index] || UI_TEXT_DEFAULT[key];
                            return acc;
                        }, {});
                        setUiTextCache((prev) => ({ ...prev, [langCode]: translatedUi }));
                    } catch (uiErr) {
                        console.error("Failed to translate UI labels", uiErr);
                    }
                })(),
            ]);

            if (recipeError) {
                throw recipeError;
            }
        } catch (err) {
            console.error(err);
            toast.error("翻訳に失敗しました");
            setCurrentLang('ORIGINAL');
        } finally {
            setIsTranslating(false);
        }
    };

    const toggleStep = (index) => {
        setCompletedSteps(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const togglePreviewStep = (index) => {
        setPreviewCompletedSteps(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const togglePreviewIngredient = (id) => {
        setPreviewCompletedIngredients(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    React.useEffect(() => {
        window.scrollTo(0, 0);
        if (onView && recipe && !isDeleted) {
            onView(recipe.id);
        }

        // Update document title for printing/PDF filename
        const originalTitle = document.title;
        if (recipe && recipe.title) {
            document.title = recipe.title;
        }

        // Reset translation on recipe change
        setTranslationCache({});
        setCurrentLang('ORIGINAL');
        setCompletedSteps(new Set());
        setPreviewCompletedSteps(new Set());
        setPreviewCompletedIngredients(new Set());
        setSelectedIngredientGroupStats(null);
        // Reset public state based on new recipe
        setIsPublic(recipe.tags?.includes('public') || false);

        // Revert title on unmount or recipe change
        return () => {
            document.title = originalTitle;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipe.id, recipe.title]);

    // Initialize calcServings when recipe changes
    React.useEffect(() => {
        if (recipe && recipe.servings) {
            setCalcServings(recipe.servings.toString());
        } else {
            setCalcServings('');
        }
        setSalesPrice('');
    }, [recipe]);

    // ... (handlers kept same)

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
    };

    const confirmDelete = () => {
        setShowDeleteConfirm(false);
        onDelete(recipe);
    };

    const cancelDelete = () => {
        setShowDeleteConfirm(false);
    };

    const handleHardDeleteClick = () => {
        setShowHardDeleteConfirm(true);
    };

    const confirmHardDelete = () => {
        setShowHardDeleteConfirm(false);
        onHardDelete(recipe);
    };

    const cancelHardDelete = () => {
        setShowHardDeleteConfirm(false);
    };

    const handleDuplicateClick = () => {
        setShowDuplicateConfirm(true);
    };

    const confirmDuplicate = async () => {
        setShowDuplicateConfirm(false);
        try {
            const newRecipe = await recipeService.duplicateRecipe(recipe, user);
            if (onDuplicate) onDuplicate(newRecipe);
        } catch (e) {
            console.error("Duplication failed", e);
            toast.error("複製に失敗しました");
        }
    };

    const cancelDuplicate = () => {
        setShowDuplicateConfirm(false);
    };

    // ... (rest of logic)

    // Swipe to back logic
    const touchStartRef = React.useRef(null);
    const touchEndRef = React.useRef(null);

    const onTouchStart = (e) => {
        touchEndRef.current = null;
        touchStartRef.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e) => {
        touchEndRef.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        if (!touchStartRef.current || !touchEndRef.current) return;
        const distance = touchStartRef.current - touchEndRef.current;
        const isLeftEdge = touchStartRef.current < 50;
        const isRightSwipe = distance < -100;

        if (isLeftEdge && isRightSwipe) {
            onBack();
        }
    };

    // --- Helper for Profit Calculation UI ---
    // Note: totalCost passed here usually represents Tax Excluded (sum of ingredients).
    // We will apply 8% tax (consumption tax for food ingredients) to get the "Actual Cost".
    const renderProfitCalculator = (totalCostTaxIncluded) => {
        // totalCostTaxIncluded is already tax included
        const costNum = Math.round(parseFloat(totalCostTaxIncluded));
        const priceNum = parseFloat(salesPrice);
        const servingsNum = parseFloat(calcServings);

        let costRate = null;
        let totalSales = null;
        let unitCost = null;

        if (!isNaN(costNum) && !isNaN(servingsNum) && servingsNum > 0) {
            unitCost = costNum / servingsNum;
        }

        if (!isNaN(costNum) && !isNaN(priceNum) && !isNaN(servingsNum) && priceNum > 0 && servingsNum > 0) {
            totalSales = priceNum * servingsNum;
            costRate = (costNum / totalSales) * 100;
        }

        return (
            <div className="profit-calculator screen-only" style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
            }}>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '1rem', color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>💰 原価率シミュレーター <small style={{ fontSize: '0.7em', fontWeight: 'normal' }}>(税込計算)</small></span>
                    <span style={{ fontSize: '0.7em', fontWeight: 'normal' }}>※原価は材料ごとに税率(8% or 10%)を適用</span>
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>販売価格 (1個/1人)</label>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}>¥</span>
                            <input
                                type="number"
                                value={salesPrice}
                                onChange={(e) => setSalesPrice(e.target.value)}
                                placeholder="0"
                                style={{
                                    padding: '6px 6px 6px 20px',
                                    width: '100px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    fontSize: '1rem'
                                }}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>個数 (人分)</label>
                        <input
                            type="number"
                            value={calcServings}
                            onChange={(e) => setCalcServings(e.target.value)}
                            placeholder="0"
                            style={{
                                padding: '6px',
                                width: '60px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                fontSize: '1rem',
                                textAlign: 'center'
                            }}
                        />
                    </div>

                    {unitCost !== null && (
                        <div style={{
                            marginLeft: 'auto',
                            padding: '8px 12px',
                            background: costRate !== null ? (costRate > 40 ? '#ffebee' : '#e8f5e9') : '#eef3ff',
                            borderRadius: '6px',
                            border: `1px solid ${costRate !== null ? (costRate > 40 ? '#ffcdd2' : '#c8e6c9') : '#d6e3ff'}`,
                            textAlign: 'right'
                        }}>
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: costRate !== null ? '6px' : '0' }}>
                                1個あたり原価(税込): <strong>¥{unitCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                            </div>
                            {costRate !== null && (
                                <>
                                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>
                                        予想売上: ¥{totalSales.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>
                                        粗利益: ¥{(totalSales - costNum).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: costRate > 40 ? '#d32f2f' : '#2e7d32' }}>
                                        原価率: {costRate.toFixed(1)}%
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Safety check for array rendering
    const ingredients = costAdjustedRecipe.ingredients || [];

    // 通常レシピ用：基準材料からの実効倍率
    const normalEffectiveMultiplier = React.useMemo(() => {
        if (normalBaseItem === 'multiplier') {
            return parseFloat(multiplier) || 1;
        }
        // 基準材料の元の分量を取得
        const getBaseQty = () => {
            const match = normalBaseItem.match(/^ing-(\d+)$/);
            if (match) {
                const idx = parseInt(match[1]);
                const ing = ingredients[idx];
                if (ing) return parseFloat(ing.quantity) || 0;
            }
            const groupMatch = normalBaseItem.match(/^ing-(.+)-(\d+)$/);
            if (groupMatch) {
                const groupId = groupMatch[1];
                const idx = parseInt(groupMatch[2]);
                const groups = displayRecipe?.ingredientGroups || [];
                const group = groups.find(g => String(g.id) === groupId);
                if (group) {
                    const groupIngs = ingredients.filter(i => i.groupId === group.id);
                    const ing = groupIngs[idx];
                    if (ing) return parseFloat(ing.quantity) || 0;
                }
            }
            return 0;
        };
        const baseQty = getBaseQty();
        const target = parseFloat(normalBaseTarget);
        if (!baseQty || !target) return 1;
        return target / baseQty;
    }, [normalBaseItem, normalBaseTarget, multiplier, ingredients, displayRecipe]);
    // Normalization: Check if steps are hidden in ingredient groups (common in this app's data)
    let normalizedSteps = displayRecipe.steps || [];
    const normalizeGroupName = (name) => String(name || '').trim().toLowerCase();
    const isStepGroupName = (name) => {
        const normalized = normalizeGroupName(name);
        if (!normalized) return false;
        return ['作り方', '手順', 'steps', 'method'].some(keyword => normalized === keyword || normalized.includes(keyword));
    };

    // If no standard steps, look for an ingredient group named "作り方" or similar
    if (!normalizedSteps.length && displayRecipe.ingredientGroups) {
        const stepGroup = displayRecipe.ingredientGroups.find(g => isStepGroupName(g.name));
        if (stepGroup) {
            // Found a group that should be steps
            const stepItems = ingredients.filter(ing => ing.groupId === stepGroup.id);
            // Convert to simple strings or objects as expected by renderer
            // Ingredient items usually have 'name' property
            normalizedSteps = stepItems.map(item => {
                if (typeof item === 'string') return item;
                // Preserve all properties (including groupId) and ensure text property exists
                return {
                    ...item,
                    text: item.name || item.text || ""
                };
            });
        } else {
            // Fallback: legacy items may carry group name directly on the item
            const stepItems = ingredients.filter(ing => isStepGroupName(ing.group) || isStepGroupName(ing.groupName));
            if (stepItems.length) {
                normalizedSteps = stepItems.map(item => {
                    if (typeof item === 'string') return item;
                    return {
                        ...item,
                        text: item.name || item.text || ""
                    };
                });
            }
        }
    }

    const steps = normalizedSteps;

    const printIngredientSections = React.useMemo(() => {
        const rawGroups = displayRecipe.ingredientGroups || [];
        const skipNames = ['作り方', 'steps', 'method', '手順'];
        const normalizeName = (name) => String(name || '').trim().toLowerCase();
        const skipGroupIds = new Set(
            rawGroups
                .filter(group => skipNames.includes(normalizeName(group.name)))
                .map(group => group.id)
        );

        const groups = rawGroups.filter(group => !skipGroupIds.has(group.id));

        if (!groups.length) {
            return [{ id: 'default', name: null, items: ingredients.filter(ing => !skipGroupIds.has(ing.groupId)) }];
        }

        const mapped = groups.map(group => {
            const items = ingredients.filter(ing => ing.groupId === group.id);
            return { id: group.id, name: group.name === '材料' ? null : group.name, items };
        }).filter(section => section.items.length > 0);

        const ungrouped = ingredients.filter(ing => {
            if (!ing.groupId) return true;
            if (skipGroupIds.has(ing.groupId)) return false;
            return !groups.some(g => g.id === ing.groupId);
        });
        if (ungrouped.length) {
            mapped.push({ id: 'ungrouped', name: null, items: ungrouped });
        }

        return mapped.length ? mapped : [{ id: 'default', name: null, items: ingredients.filter(ing => !skipGroupIds.has(ing.groupId)) }];
    }, [displayRecipe.ingredientGroups, ingredients]);

    const breadPrintContext = React.useMemo(() => {
        if (displayRecipe.type !== 'bread') return null;
        const flours = costAdjustedRecipe.flours || [];
        const others = costAdjustedRecipe.breadIngredients || [];
        const totalFlour = flours.reduce((sum, f) => sum + (parseFloat(f.quantity) || 0), 0);
        const grandTotal = totalFlour + others.reduce((sum, o) => sum + (parseFloat(o.quantity) || 0), 0);
        const target = parseFloat(targetTotal);

        let scaleFactor = 1;
        const getBaseValue = () => {
            if (baseItem === 'total') return grandTotal;
            if (baseItem === 'flourTotal') return totalFlour;
            if (baseItem.startsWith('flour-')) {
                const idx = parseInt(baseItem.split('-')[1], 10);
                return parseFloat(flours[idx]?.quantity) || 0;
            }
            if (baseItem.startsWith('other-')) {
                const idx = parseInt(baseItem.split('-')[1], 10);
                return parseFloat(others[idx]?.quantity) || 0;
            }
            return grandTotal;
        };
        const baseVal = getBaseValue();
        scaleFactor = (target && baseVal) ? (target / baseVal) : 1;

        const calcPercent = (qty) => totalFlour ? ((parseFloat(qty) || 0) / totalFlour * 100).toFixed(1) : '0.0';
        const getScaledQtyValue = (qty) => {
            if (!target) return qty;
            return ((parseFloat(qty) || 0) * scaleFactor).toFixed(1);
        };
        const getScaledCostValue = (cost) => {
            const raw = parseFloat(cost) || 0;
            if (!target) return raw;
            const scaled = raw * scaleFactor;
            return Math.round(scaled * 100) / 100;
        };
        const formatCostValue = (cost) => {
            const val = getScaledCostValue(cost);
            if (!Number.isFinite(val)) return '';
            return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
        };
        const calcTaxedCost = (items) => {
            return items.reduce((sum, item) => {
                const rawCost = parseFloat(item.cost) || 0;
                const scaledCost = rawCost * (target ? scaleFactor : 1);
                const taxRate = getItemTaxRate(item);
                return sum + (scaledCost * taxRate);
            }, 0);
        };

        return {
            flours,
            others,
            totalFlour,
            grandTotal,
            calcPercent,
            getScaledQtyValue,
            getScaledCostValue,
            formatCostValue,
            scaleFactor,
            totalTaxIncluded: calcTaxedCost(flours) + calcTaxedCost(others)
        };
    }, [costAdjustedRecipe.breadIngredients, costAdjustedRecipe.flours, displayRecipe.type, targetTotal, baseItem]);

    const normalPrintTotal = React.useMemo(() => {
        if (displayRecipe.type === 'bread') return 0;
        const overrideMap = costReferenceMode === 'override' ? categoryCostOverrides : new Map();
        return computeRecipeTotalCostTaxIncluded(
            { ...displayRecipe, ingredients },
            overrideMap,
            { multiplier: normalEffectiveMultiplier }
        );
    }, [displayRecipe, ingredients, normalEffectiveMultiplier, costReferenceMode, categoryCostOverrides]);

    const printCostTotalDisplay = displayRecipe.type === 'bread'
        ? (breadPrintContext ? Math.round(breadPrintContext.totalTaxIncluded).toLocaleString() : '0')
        : Math.round(normalPrintTotal).toLocaleString();

    const printDescription = displayRecipe.description || sourceRecipe.description;

    const breadBasisName = React.useMemo(() => {
        if (displayRecipe.type !== 'bread' || !breadPrintContext) return null;
        const { flours, others } = breadPrintContext;
        if (baseItem === 'flourTotal') return '粉グループの総重量';
        if (baseItem.startsWith('flour-')) {
            const idx = parseInt(baseItem.split('-')[1], 10);
            return (flours[idx]?.name || '材料');
        }
        if (baseItem.startsWith('other-')) {
            const idx = parseInt(baseItem.split('-')[1], 10);
            return (others[idx]?.name || '材料');
        }
        return null;
    }, [displayRecipe.type, baseItem, breadPrintContext]);

    const normalBasisName = React.useMemo(() => {
        if (displayRecipe.type === 'bread' || normalBaseItem === 'multiplier') return null;
        const match = normalBaseItem.match(/^ing-(\d+)$/);
        if (match) {
            const idx = parseInt(match[1]);
            return ingredients[idx]?.name || '材料';
        }
        const groupMatch = normalBaseItem.match(/^ing-(.+)-(\d+)$/);
        if (groupMatch) {
            const groupId = groupMatch[1];
            const idx = parseInt(groupMatch[2]);
            const groups = displayRecipe?.ingredientGroups || [];
            const group = groups.find(g => String(g.id) === groupId);
            if (group) {
                const groupIngs = ingredients.filter(i => i.groupId === group.id);
                return groupIngs[idx]?.name || '材料';
            }
        }
        return null;
    }, [displayRecipe.type, normalBaseItem, ingredients, displayRecipe]);

    const categoryDisplayMultiplierMap = React.useMemo(() => {
        if (costReferenceMode !== 'override') return new Map();
        if (displayRecipe.type === 'bread') return new Map();

        const categories = getRecipeCostCategories({ ...displayRecipe, ingredients }, { multiplier: 1 });
        const map = new Map();
        for (const category of categories) {
            const original = toFiniteNumber(category?.costTaxIncluded);
            const overridden = toFiniteNumber(categoryCostOverrides.get(category?.categoryKey));
            if (Number.isFinite(original) && original > 0 && Number.isFinite(overridden) && overridden >= 0) {
                map.set(category.categoryKey, overridden / original);
            } else {
                map.set(category.categoryKey, 1);
            }
        }
        return map;
    }, [costReferenceMode, displayRecipe, ingredients, categoryCostOverrides]);

    const getCategoryDisplayMultiplier = React.useCallback((categoryKey) => {
        if (costReferenceMode !== 'override') return 1;
        const v = toFiniteNumber(categoryDisplayMultiplierMap.get(categoryKey));
        if (!Number.isFinite(v) || v <= 0) return 1;
        return v;
    }, [costReferenceMode, categoryDisplayMultiplierMap]);

    const openIngredientGroupStats = React.useCallback((groupKey, groupName, groupIngredients) => {
        const summary = summarizeIngredientGroup(groupIngredients, {
            multiplier: normalEffectiveMultiplier,
            totalRecipeCostTaxIncluded: normalPrintTotal,
        });
        const multiplierBase = Number.isFinite(normalEffectiveMultiplier) && normalEffectiveMultiplier > 0
            ? normalEffectiveMultiplier
            : 1;
        const originalBase = summary.costTaxIncluded / multiplierBase;
        const overriddenBase = toFiniteNumber(categoryCostOverrides.get(groupKey));
        const effectiveCostTaxIncluded =
            costReferenceMode === 'override' && Number.isFinite(overriddenBase)
                ? (overriddenBase * multiplierBase)
                : summary.costTaxIncluded;

        setSelectedIngredientGroupStats({
            groupName,
            groupKey,
            ...summary,
            baseOriginalCostTaxIncluded: originalBase,
            overrideBaseCostTaxIncluded: Number.isFinite(overriddenBase) ? overriddenBase : null,
            costTaxIncluded: effectiveCostTaxIncluded,
        });
    }, [normalEffectiveMultiplier, normalPrintTotal, categoryCostOverrides, costReferenceMode]);

    React.useEffect(() => {
        if (!selectedIngredientGroupStats) {
            setGroupUsageUnit('g');
            setGroupTotalBatchAmount('');
            setGroupUsageAmount('');
            setOverrideCostInput('');
            return;
        }

        const nextUnit = selectedIngredientGroupStats.defaultUsageUnit || 'g';
        setGroupUsageUnit(nextUnit);
        setGroupTotalBatchAmount(
            selectedIngredientGroupStats.defaultBatchAmount != null
                ? String(Math.round(selectedIngredientGroupStats.defaultBatchAmount * 100) / 100)
                : ''
        );
        const savedUsageAmount = selectedIngredientGroupStats.groupKey
            ? groupUsageAmountByCategory.get(selectedIngredientGroupStats.groupKey)
            : null;
        setGroupUsageAmount(savedUsageAmount ?? '');
        setOverrideCostInput(
            Number.isFinite(toFiniteNumber(selectedIngredientGroupStats.overrideBaseCostTaxIncluded))
                ? String(selectedIngredientGroupStats.overrideBaseCostTaxIncluded)
                : ''
        );
    }, [selectedIngredientGroupStats, groupUsageAmountByCategory]);

    const groupUsageSimulation = React.useMemo(() => {
        if (!selectedIngredientGroupStats) return null;

        const totalBatchAmount = toFiniteNumber(groupTotalBatchAmount);
        const usageAmount = toFiniteNumber(groupUsageAmount);
        const categoryCost = toFiniteNumber(selectedIngredientGroupStats.costTaxIncluded);

        const costPerUnit =
            Number.isFinite(totalBatchAmount) && totalBatchAmount > 0 && Number.isFinite(categoryCost)
                ? categoryCost / totalBatchAmount
                : null;
        const usageCost =
            costPerUnit != null && Number.isFinite(usageAmount) && usageAmount >= 0
                ? costPerUnit * usageAmount
                : null;

        return {
            totalBatchAmount,
            usageAmount,
            costPerUnit,
            usageCost,
        };
    }, [groupTotalBatchAmount, groupUsageAmount, selectedIngredientGroupStats]);

    const groupUsageNotice = React.useMemo(() => {
        if (!selectedIngredientGroupStats) return null;

        if (selectedIngredientGroupStats.defaultBatchAmountSource === 'mixed_g_plus_ml') {
            return `初期値は 総重量 ${formatCompactNumber(selectedIngredientGroupStats.totalWeightGrams, { maximumFractionDigits: 1 })}g と 総液量 ${formatCompactNumber(selectedIngredientGroupStats.totalVolumeMl, { maximumFractionDigits: 1 })}ml を、1ml=1g の概算で合算しています。個・本などは自動換算に含めていません。`;
        }

        if (selectedIngredientGroupStats.defaultBatchAmountSource === 'weight_only') {
            return `初期値は重量合計 ${formatCompactNumber(selectedIngredientGroupStats.totalWeightGrams, { maximumFractionDigits: 1 })}g をそのまま入れています。個・本などは自動換算に含めていません。`;
        }

        if (selectedIngredientGroupStats.defaultBatchAmountSource === 'volume_only') {
            return `初期値は液量合計 ${formatCompactNumber(selectedIngredientGroupStats.totalVolumeMl, { maximumFractionDigits: 1 })}ml を入れています。必要なら実際の仕上がり量に合わせて調整してください。`;
        }

        return '総出来上がり量が自動で出せないため、実際の仕上がり量を入力してください。';
    }, [selectedIngredientGroupStats]);

    React.useEffect(() => {
        if (!selectedIngredientGroupStats) return;
        const hasSavedOverride = Number.isFinite(
            toFiniteNumber(selectedIngredientGroupStats.overrideBaseCostTaxIncluded)
        );
        if (hasSavedOverride) return;
        const usageCost = toFiniteNumber(groupUsageSimulation?.usageCost);
        if (!Number.isFinite(usageCost)) return;
        setOverrideCostInput(String(Math.round(usageCost * 100) / 100));
    }, [groupUsageSimulation?.usageCost, selectedIngredientGroupStats]);

    const handleSaveCategoryOverride = React.useCallback(async () => {
        if (!selectedIngredientGroupStats?.groupKey) return;
        const nextCost = toFiniteNumber(overrideCostInput);
        if (!Number.isFinite(nextCost) || nextCost < 0) {
            toast.warning('再設定する原価は 0 以上の数値で入力してください。');
            return;
        }

        if (!recipe?.id) return;

        try {
            setIsSavingCategoryOverride(true);
            await categoryCostOverrideService.upsertForRecipeCategory({
                recipeId: recipe.id,
                categoryKey: selectedIngredientGroupStats.groupKey,
                categoryName: selectedIngredientGroupStats.groupName,
                overriddenCostTaxIncluded: nextCost,
            });
            setCategoryCostOverrides((prev) => {
                const next = new Map(prev);
                next.set(selectedIngredientGroupStats.groupKey, nextCost);
                return next;
            });
            setSelectedIngredientGroupStats((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    overrideBaseCostTaxIncluded: nextCost,
                    costTaxIncluded: (Number.isFinite(normalEffectiveMultiplier) && normalEffectiveMultiplier > 0)
                        ? nextCost * normalEffectiveMultiplier
                        : nextCost,
                };
            });
            setCostReferenceMode('override');
            toast.success('カテゴリ原価を再設定しました。');
        } catch (error) {
            toast.error(`カテゴリ原価の保存に失敗しました: ${error?.message || 'unknown error'}`);
        } finally {
            setIsSavingCategoryOverride(false);
        }
    }, [selectedIngredientGroupStats, overrideCostInput, toast, recipe?.id, normalEffectiveMultiplier]);


    return (
        <>
            <div
                className="recipe-detail fade-in"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {/* ... (modals kept same) */}
                {showDuplicateConfirm && (
                    <div className="modal-overlay fade-in" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', color: '#333' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--color-primary)' }}>レシピの複製</h3>
                            <p style={{ margin: '1rem 0', color: '#333' }}>
                                このレシピのコピーを作成しますか？
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                                <Button variant="ghost" onClick={cancelDuplicate}>キャンセル</Button>
                                <Button variant="primary" onClick={confirmDuplicate}>複製する</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {showHardDeleteConfirm && (
                    <div className="modal-overlay fade-in" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', border: '2px solid var(--color-danger)', color: '#333' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--color-danger)' }}>⚠️ 完全に削除しますか？</h3>
                            <p style={{ margin: '1rem 0', color: '#333' }}>
                                この操作は取り消せません。<br />
                                永久に削除され、二度と復元できなくなります。
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                                <Button variant="ghost" onClick={cancelHardDelete}>キャンセル</Button>
                                <Button variant="danger" onClick={confirmHardDelete}>完全に削除する</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {showDeleteConfirm && (
                    <div className="modal-overlay fade-in" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', color: '#333' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--color-danger)' }}>レシピの削除</h3>
                            <p style={{ margin: '1rem 0', color: '#333' }}>
                                本当にこのレシピを削除しますか？<br />
                                <small style={{ color: '#666' }}>（削除済みアイテムとしてゴミ箱に移動します）</small>
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                                <Button variant="ghost" onClick={cancelDelete}>キャンセル</Button>
                                <Button variant="danger" onClick={confirmDelete}>削除する</Button>
                            </div>
                        </Card>
                    </div>
                )}

                <Modal
                    isOpen={Boolean(selectedIngredientGroupStats)}
                    onClose={() => setSelectedIngredientGroupStats(null)}
                    title={selectedIngredientGroupStats ? `${selectedIngredientGroupStats.groupName} の集計` : 'カテゴリ集計'}
                    size="medium"
                >
                    {selectedIngredientGroupStats && (
                        <div className="group-stats-modal">
                            <p className="group-stats-modal__intro">
                                現在表示中の分量倍率を反映したカテゴリ別集計です。
                                {normalEffectiveMultiplier !== 1 && (
                                    <span className="group-stats-modal__multiplier"> 倍率: ×{normalEffectiveMultiplier.toFixed(3)}</span>
                                )}
                            </p>

                            <div className="group-stats-grid">
                                <div className="group-stats-card">
                                    <span className="group-stats-card__label">材料数</span>
                                    <strong className="group-stats-card__value">{selectedIngredientGroupStats.ingredientCount} 点</strong>
                                </div>
                                <div className="group-stats-card">
                                    <span className="group-stats-card__label">数量入力あり</span>
                                    <strong className="group-stats-card__value">{selectedIngredientGroupStats.quantifiedItemCount} 点</strong>
                                </div>
                                <div className="group-stats-card">
                                    <span className="group-stats-card__label">総重量</span>
                                    <strong className="group-stats-card__value">{formatWeightSummary(selectedIngredientGroupStats.totalWeightGrams)}</strong>
                                </div>
                                <div className="group-stats-card">
                                    <span className="group-stats-card__label">総液量</span>
                                    <strong className="group-stats-card__value">{formatVolumeSummary(selectedIngredientGroupStats.totalVolumeMl)}</strong>
                                </div>
                                <div className="group-stats-card">
                                    <span className="group-stats-card__label">原価小計</span>
                                    <strong className="group-stats-card__value">{formatYen(selectedIngredientGroupStats.costTaxExcluded, { maximumFractionDigits: 2 }) ?? '—'}</strong>
                                </div>
                                <div className="group-stats-card">
                                    <span className="group-stats-card__label">原価（税込）</span>
                                    <strong className="group-stats-card__value">{formatYen(selectedIngredientGroupStats.costTaxIncluded, { maximumFractionDigits: 2 }) ?? '—'}</strong>
                                </div>
                                <div className="group-stats-card">
                                    <span className="group-stats-card__label">カテゴリ原価率</span>
                                    <strong className="group-stats-card__value">
                                        {selectedIngredientGroupStats.costShare == null
                                            ? '—'
                                            : `${selectedIngredientGroupStats.costShare.toFixed(1)}%`}
                                    </strong>
                                </div>
                                <div className="group-stats-card group-stats-card--wide">
                                    <span className="group-stats-card__label">分量集計（単位別）</span>
                                    {selectedIngredientGroupStats.quantityBreakdown.length > 0 ? (
                                        <div className="group-stats-chip-list">
                                            {selectedIngredientGroupStats.quantityBreakdown.map((entry) => (
                                                <span key={entry.unitLabel} className="group-stats-chip">
                                                    {entry.display}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <strong className="group-stats-card__value">—</strong>
                                    )}
                                </div>
                            </div>

                            <div className="group-usage-simulator">
                                <div className="group-usage-simulator__header">
                                    <h4 className="group-usage-simulator__title">使用量シミュレーション</h4>
                                    <p className="group-usage-simulator__desc">
                                        このカテゴリ全体をひとつの仕込みとして、使用量に応じた原価（税込）を計算します。
                                    </p>
                                </div>

                                <div className="group-usage-simulator__controls">
                                    <label className="group-usage-simulator__field">
                                        <span className="group-usage-simulator__label">総出来上がり量</span>
                                        <div className="group-usage-simulator__input-row">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={groupTotalBatchAmount}
                                                onChange={(e) => setGroupTotalBatchAmount(e.target.value)}
                                                placeholder={selectedIngredientGroupStats.defaultBatchAmount != null ? String(Math.round(selectedIngredientGroupStats.defaultBatchAmount)) : '例: 280'}
                                            />
                                            <select value={groupUsageUnit} onChange={(e) => setGroupUsageUnit(e.target.value)}>
                                                <option value="g">g</option>
                                                <option value="ml">ml</option>
                                            </select>
                                        </div>
                                    </label>

                                    <label className="group-usage-simulator__field">
                                        <span className="group-usage-simulator__label">今回使う量</span>
                                        <div className="group-usage-simulator__input-row">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={groupUsageAmount}
                                                onChange={(e) => {
                                                    const nextValue = e.target.value;
                                                    setGroupUsageAmount(nextValue);
                                                    if (!selectedIngredientGroupStats?.groupKey) return;
                                                    setGroupUsageAmountByCategory((prev) => {
                                                        const next = new Map(prev);
                                                        next.set(selectedIngredientGroupStats.groupKey, nextValue);
                                                        return next;
                                                    });
                                                }}
                                                placeholder={`例: 20`}
                                            />
                                            <span className="group-usage-simulator__unit-pill">{groupUsageUnit}</span>
                                        </div>
                                    </label>
                                </div>

                                <div className="group-usage-simulator__notes">
                                    <p>{groupUsageNotice}</p>
                                </div>

                                <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #dbeafe', borderRadius: '8px', background: '#f8fbff' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '6px', fontWeight: 700 }}>
                                        カテゴリ原価の再設定（倍率1基準・税込）
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                            元データ: {formatYen(selectedIngredientGroupStats.baseOriginalCostTaxIncluded, { maximumFractionDigits: 2 }) ?? '—'}
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={overrideCostInput}
                                            onChange={(e) => setOverrideCostInput(e.target.value)}
                                            placeholder="再設定原価"
                                            style={{ width: '140px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={handleSaveCategoryOverride}
                                            disabled={isSavingCategoryOverride}
                                        >
                                            {isSavingCategoryOverride ? '保存中...' : '再設定を保存'}
                                        </Button>
                                    </div>
                                </div>

                                <div className="group-usage-simulator__results">
                                    <div className="group-usage-simulator__result-card">
                                        <span className="group-usage-simulator__result-label">1{groupUsageUnit}あたり原価（税込）</span>
                                        <strong className="group-usage-simulator__result-value">
                                            {groupUsageSimulation?.costPerUnit == null
                                                ? '—'
                                                : formatYen(groupUsageSimulation.costPerUnit, { maximumFractionDigits: 2 })}
                                        </strong>
                                    </div>
                                    <div className="group-usage-simulator__result-card group-usage-simulator__result-card--accent">
                                        <span className="group-usage-simulator__result-label">
                                            {groupUsageAmount || '入力した量'} {groupUsageUnit} 使用時の原価（税込）
                                        </span>
                                        <strong className="group-usage-simulator__result-value">
                                            {groupUsageSimulation?.usageCost == null
                                                ? '—'
                                                : formatYen(groupUsageSimulation.usageCost, { maximumFractionDigits: 2 })}
                                        </strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </Modal>

                <div className="recipe-detail__header">
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" onClick={onBack} size="sm">{backLabel || "← 戻る"}</Button>
                        {onList && (
                            <Button variant="secondary" onClick={onList} size="sm">レシピ一覧</Button>
                        )}
                    </div>
                    {!isDeleted && (
                        <div className="recipe-detail__actions">

                            {/* Public Toggle (Owner Only) */}
                            {canEdit && (user?.displayId === 'yoshito' || user?.role === 'admin') && (
                                <div style={{ marginRight: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label className="switch" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={isPublic}
                                            onChange={handleTogglePublic}
                                            style={{ accentColor: '#4CAF50', transform: 'scale(1.2)' }}
                                        />
                                        <span style={{ marginLeft: '4px', fontSize: '0.9rem', fontWeight: 'bold', color: isPublic ? '#4CAF50' : '#888' }}>
                                            {isPublic ? '公開中' : '非公開'}
                                        </span>
                                    </label>
                                </div>
                            )}

                            {!canEdit && !forceEditEnabled && (
                                <span style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#e0e0e0',
                                    color: '#555',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    marginRight: '0.5rem'
                                }}>
                                    🔒 マスターデータ (閲覧のみ)
                                </span>
                            )}

                            <select
                                className="language-select"
                                value={currentLang}
                                onChange={handleLanguageChange}
                                disabled={isTranslating}
                                style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc', marginRight: '0.5rem', cursor: 'pointer' }}
                            >
                                <option value="ORIGINAL">📄 Original (原文)</option>
                                {SUPPORTED_LANGUAGES.map(lang => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.label}
                                    </option>
                                ))}
                            </select>
                            {currentLang !== 'ORIGINAL' && (
                                <label style={{ display: 'flex', alignItems: 'center', marginRight: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={showOriginal}
                                        onChange={(e) => setShowOriginal(e.target.checked)}
                                        style={{ marginRight: '4px' }}
                                    />
                                    原文表示
                                </label>
                            )}
                            <Button variant="secondary" size="sm" onClick={() => setShowPrintModal(true)}>🖨️ プレビュー</Button>
                            <Button variant="secondary" size="sm" onClick={() => window.print()}>🖨️ 印刷</Button>
                            <Button variant="secondary" size="sm" onClick={handleDuplicateClick}>複製</Button>
                            {onOpenCompositeCost && (
                                <Button variant="secondary" size="sm" onClick={onOpenCompositeCost}>🥪 合成原価</Button>
                            )}

                            {(canEdit || forceEditEnabled) && (
                                <Button variant="secondary" size="sm" onClick={onEdit}>編集</Button>
                            )}
                            {canEdit && (
                                <Button variant="danger" size="sm" onClick={handleDeleteClick} style={{ marginLeft: '0.5rem' }}>削除</Button>
                            )}

                        </div>
                    )}
                    {isDeleted && (
                        <div className="recipe-detail__actions">
                            <Button variant="ghost" size="sm" onClick={handleHardDeleteClick} style={{ color: 'var(--color-danger)', marginRight: 'auto' }}>完全に削除</Button>
                            <Button variant="primary" size="sm" onClick={() => onDelete(recipe, true)}>復元する</Button>
                        </div>
                    )}
                </div>

                <div className="recipe-detail__hero">
                    {displayRecipe.image ? (
                        <img src={displayRecipe.image} alt={displayRecipe.title} className="recipe-detail__image" />
                    ) : (
                        <div className="recipe-detail__image-placeholder" style={{ height: '100%', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                            画像なし
                        </div>
                    )}
                </div>

                <div className="recipe-detail__title-card glass-panel">
                    <h1>{renderText(displayRecipe.title, sourceRecipe.title)}</h1>
                    <p className="recipe-detail__desc">{renderText(displayRecipe.description, sourceRecipe.description, true)}</p>
                    {user?.role === 'admin' && ownerLabel && (
                        <div className="recipe-detail__owner">
                            👤 作成者: {ownerLabel}
                        </div>
                    )}
                    <div className="recipe-detail__meta">
                        {displayRecipe.course && (
                            <div className="meta-item">
                                <span className="meta-label">{tUi('course')}</span>
                                <span className="meta-value">{renderText(displayRecipe.course, sourceRecipe.course)}</span>
                            </div>
                        )}
                        {displayRecipe.category && (
                            <div className="meta-item">
                                <span className="meta-label">{tUi('category')}</span>
                                <span className="meta-value">{renderText(displayRecipe.category, sourceRecipe.category)}</span>
                            </div>
                        )}
                        {displayRecipe.storeName && (
                            <div className="meta-item">
                                <span className="meta-label">{tUi('storeName')}</span>
                                <span className="meta-value">{renderText(displayRecipe.storeName, sourceRecipe.storeName)}</span>
                            </div>
                        )}
                        <div className="meta-item">
                            <span className="meta-label">{tUi('servings')}</span>
                            <span className="meta-value">{displayRecipe.servings}人分</span>
                        </div>
                    </div>

                    {displayRecipe.sourceUrl && (
                        <div className="print-qr-container" style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <a href={displayRecipe.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    🔗 <span className="screen-only">{tUi('sourceRecipe')}</span>
                                    <span className="print-only">{tUi('sourceRecipe')}</span>
                                </a>

                                <button
                                    onClick={() => setShowQrCodeModal(true)}
                                    className="screen-only"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--color-text-muted)',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    📱 QRコード
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="recipe-detail-dates" style={{ marginTop: '0.5rem', marginBottom: '1.5rem', borderTop: 'none', paddingRight: '0.5rem' }}>
                    <span>📅 登録: {formatDate(recipe.created_at)}</span>
                    {recipe.updated_at && <span>🔄 更新: {formatDate(recipe.updated_at)}</span>}
                </div>

                <div className="recipe-detail__content">
                    <div className="recipe-detail__main">
                        <section className="detail-section">
                            <h2>{tUi('ingredients')}</h2>
                            <Card className="ingredients-card">
                                {displayRecipe.type === 'bread' ? (
                                    <div className="bread-detail-view">
                                        {/* Helper for total calculation */}
                                        {(() => {
                                            const flours = costAdjustedRecipe.flours || [];
                                            const others = costAdjustedRecipe.breadIngredients || [];
                                            const totalFlour = flours.reduce((sum, f) => sum + (parseFloat(f.quantity) || 0), 0);
                                            const grandTotal = totalFlour + others.reduce((sum, o) => sum + (parseFloat(o.quantity) || 0), 0);
                                            const totalPercent = totalFlour ? (grandTotal / totalFlour * 100).toFixed(1) : '0.0';

                                            const calcPercent = (q) => totalFlour ? ((parseFloat(q) || 0) / totalFlour * 100).toFixed(1) : '0.0';

                                            // Scaling logic
                                            const target = parseFloat(targetTotal);
                                            let scaleFactor = 1;
                                            
                                            const getBaseValue = () => {
                                                if (baseItem === 'total') return grandTotal;
                                                if (baseItem === 'flourTotal') return totalFlour;
                                                if (baseItem.startsWith('flour-')) {
                                                    const idx = parseInt(baseItem.split('-')[1], 10);
                                                    return parseFloat(flours[idx]?.quantity) || 0;
                                                }
                                                if (baseItem.startsWith('other-')) {
                                                    const idx = parseInt(baseItem.split('-')[1], 10);
                                                    return parseFloat(others[idx]?.quantity) || 0;
                                                }
                                                return grandTotal;
                                            };
                                            const baseVal = getBaseValue();
                                            scaleFactor = (target && baseVal) ? (target / baseVal) : 1;

                                            const getBaseName = () => {
                                                if (baseItem === 'total') return '仕上がり総重量';
                                                if (baseItem === 'flourTotal') return '粉グループの総重量';
                                                if (baseItem.startsWith('flour-')) {
                                                    const idx = parseInt(baseItem.split('-')[1], 10);
                                                    return (flours[idx]?.name || '材料') + ' の目標分量';
                                                }
                                                if (baseItem.startsWith('other-')) {
                                                    const idx = parseInt(baseItem.split('-')[1], 10);
                                                    return (others[idx]?.name || '材料') + ' の目標分量';
                                                }
                                                return '目標分量';
                                            };

                                            const getScaledQty = (q) => {
                                                if (!target) return q;
                                                return ((parseFloat(q) || 0) * scaleFactor).toFixed(1);
                                            };
                                            const getScaledCost = (c) => {
                                                const raw = parseFloat(c) || 0;
                                                if (!target) return raw;
                                                const scaled = raw * scaleFactor;
                                                return Math.round(scaled * 100) / 100;
                                            };
                                            const formatCost = (value) => {
                                                if (!Number.isFinite(value)) return '-';
                                                return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
                                            };

                                            return (
                                                <>
                                                    {/* Scaling Controls */}
                                                    <div className="screen-only" style={{
                                                        background: '#f1f3f5',
                                                        padding: '0.5rem',
                                                        borderRadius: '6px',
                                                        marginBottom: '1rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.5rem',
                                                        border: '1px solid #dee2e6',
                                                        lineHeight: 1.2,
                                                        width: '100%',
                                                        boxSizing: 'border-box'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                                            <label className="base-item-control screen-only" title="総重量を基準に計算する" style={{marginRight:'2px'}}>
                                                                <input type="radio" name="baseItem" className="base-item-radio" checked={baseItem === 'total'} onChange={() => setBaseItem('total')} />
                                                                <span className="base-item-label">基準</span>
                                                            </label>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#000' }}>現在の総重量:</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#000' }}>{grandTotal.toLocaleString()}g</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#444' }}>({totalPercent}%)</span>
                                                        </div>
                                                        <div style={{ height: '1px', width: '100%', background: '#dee2e6' }}></div>
                                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                                            <label htmlFor="target-total-input" style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#000' }}>{getBaseName()}:</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <input
                                                                    id="target-total-input"
                                                                    type="number"
                                                                    value={targetTotal}
                                                                    onChange={(e) => setTargetTotal(e.target.value)}
                                                                    placeholder="1000"
                                                                    style={{
                                                                        padding: '2px 20px 2px 6px',
                                                                        width: '80px',
                                                                        borderRadius: '4px',
                                                                        border: '1.5px solid #333',
                                                                        fontSize: '0.9rem',
                                                                        fontWeight: 'bold',
                                                                        textAlign: 'right',
                                                                        color: '#000',
                                                                        backgroundColor: '#fff'
                                                                    }}
                                                                />
                                                                <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#333' }}>g</span>
                                                            </div>
                                                            {targetTotal && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setTargetTotal('')}
                                                                    style={{ padding: '0 4px', fontSize: '0.7rem', color: '#555', height: '22px', border: '1px solid #dee2e6' }}
                                                                >
                                                                    リセット
                                                                </Button>
                                                            )}
                                                        </div>
                                                        {targetTotal && (
                                                            <div style={{ fontSize: '0.75rem', color: '#000', fontWeight: 'bold', marginLeft: 'auto' }}>
                                                                ← 倍率: ×{scaleFactor.toFixed(3)} で計算中
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="bread-section" style={{ marginBottom: '2rem' }}>
                                                        <h3 style={{
                                                            fontSize: '1.2rem',
                                                            borderLeft: '4px solid var(--color-primary)',
                                                            paddingLeft: '10px',
                                                            marginBottom: '1rem',
                                                            marginTop: 0,
                                                            display: 'flex',
                                                            flexWrap: 'wrap',
                                                            gap: '0.5rem',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            color: 'var(--color-text-main)'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <label className="base-item-control screen-only" title="粉グループ総重量を基準に計算する">
                                                                    <input type="radio" name="baseItem" className="base-item-radio" checked={baseItem === 'flourTotal'} onChange={() => setBaseItem('flourTotal')} />
                                                                    <span className="base-item-label">基準</span>
                                                                </label>
                                                                <span>{tUi('flourGroup')}</span>
                                                            </div>
                                                            <span style={{ fontSize: '0.9rem', background: 'var(--color-primary)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold' }}>Total: {targetTotal ? getScaledQty(totalFlour) : totalFlour}g (100%)</span>
                                                        </h3>
                                                        <div style={{ overflowX: 'auto', width: '100%' }}>
                                                            <table className="ingredients-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>{tUi('ingredientName')}</th>
                                                                    <th style={{ textAlign: 'right' }}>{tUi('quantityGram')}</th>
                                                                    <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>{tUi('purchase')}</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>{tUi('cost')}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {flours.map((item, i) => {
                                                                    const originalItem = sourceRecipe.flours?.[i] || {};
                                                                    return (
                                                                        <tr key={i}>
                                                                            <td>
                                                                                <div className="ingredient-name">
                                                                                    <label className="base-item-control screen-only" title="この材料を基準に計算する">
                                                                                        <input type="radio" name="baseItem" className="base-item-radio" checked={baseItem === `flour-${i}`} onChange={() => setBaseItem(`flour-${i}`)} />
                                                                                        <span className="base-item-label">基準</span>
                                                                                    </label>
                                                                                    <span>{renderText(item.name, originalItem?.name)}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                                                {targetTotal ? (
                                                                                    <span style={{ color: 'var(--color-primary)' }}>{getScaledQty(item.quantity)}</span>
                                                                                ) : (
                                                                                    item.quantity
                                                                                )}
                                                                            </td>
                                                                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                                                                {calcPercent(item.quantity)}%
                                                                            </td>
                                                                            <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{formatYen(item.purchaseCost) ?? '-'}</td>
                                                                            <td style={{ textAlign: 'right' }}>
                                                                                {item.cost ? `¥${formatCost(getScaledCost(item.cost))}` : '-'}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    <div className="bread-section" style={{ marginTop: '3rem' }}>
                                                        <h3 style={{
                                                            fontSize: '1.2rem',
                                                            borderLeft: '4px solid #f39c12',
                                                            paddingLeft: '10px',
                                                            marginBottom: '1rem',
                                                            color: 'var(--color-text-main)'
                                                        }}>
                                                            {tUi('otherIngredients')}
                                                        </h3>
                                                        <div style={{ overflowX: 'auto', width: '100%' }}>
                                                            <table className="ingredients-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>{tUi('ingredientName')}</th>
                                                                    <th style={{ textAlign: 'right' }}>{tUi('quantityGram')}</th>
                                                                    <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>{tUi('purchase')}</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>{tUi('cost')}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {others.map((item, i) => {
                                                                    const originalItem = sourceRecipe.breadIngredients?.[i] || {};
                                                                    return (
                                                                        <tr key={i}>
                                                                            <td>
                                                                                <div className="ingredient-name">
                                                                                    <label className="base-item-control screen-only" title="この材料を基準に計算する">
                                                                                        <input type="radio" name="baseItem" className="base-item-radio" checked={baseItem === `other-${i}`} onChange={() => setBaseItem(`other-${i}`)} />
                                                                                        <span className="base-item-label">基準</span>
                                                                                    </label>
                                                                                    <span>{renderText(item.name, originalItem?.name)}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                                                {targetTotal ? (
                                                                                    <span style={{ color: 'var(--color-primary)' }}>{getScaledQty(item.quantity)}</span>
                                                                                ) : (
                                                                                    item.quantity
                                                                                )}
                                                                            </td>
                                                                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>
                                                                                {calcPercent(item.quantity)}%
                                                                            </td>
                                                                            <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{formatYen(item.purchaseCost) ?? '-'}</td>
                                                                            <td style={{ textAlign: 'right' }}>
                                                                                {item.cost ? `¥${formatCost(getScaledCost(item.cost))}` : '-'}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="cost-summary">
                                                            <span className="cost-summary__label">{tUi('totalCost')}:</span>
                                                            <span className="cost-summary__value">
                                                                ¥{(() => {
                                                                    // Calculate Total Tax Included
                                                                    // Iterate all items, apply tax rate per item, then sum
                                                                    // Note: 'item.cost' is Tax Excluded unit cost * qty? No, in bread form logic:
                                                                    // item.cost = (qty/1000 * purchaseCost). This is Tax Excluded Total for that item.

                                                                    const calcTaxedCost = (items) => {
                                                                        return items.reduce((sum, item) => {
                                                                            const rawCost = parseFloat(item.cost) || 0;
                                                                            const taxRate = getItemTaxRate(item);
                                                                            // Scale applies to the raw cost (which depends on Quantity)
                                                                            const scaledCost = rawCost * scaleFactor;
                                                                            return sum + (scaledCost * taxRate);
                                                                        }, 0);
                                                                    }

                                                                    const totalTaxIncluded = calcTaxedCost(flours) + calcTaxedCost(others);
                                                                    return Math.round(totalTaxIncluded).toLocaleString();
                                                                })()}

                                                            </span>
                                                            <span className="cost-summary__note">(税込)</span>
                                                        </div>

                                                        {/* Profit Calculator for Bread */}
                                                        {(() => {
                                                            const calcTaxedCost = (items) => {
                                                                return items.reduce((sum, item) => {
                                                                    const rawCost = parseFloat(item.cost) || 0;
                                                                    const taxRate = getItemTaxRate(item);
                                                                    const scaledCost = rawCost * scaleFactor;
                                                                    return sum + (scaledCost * taxRate);
                                                                }, 0);
                                                            }
                                                            const total = calcTaxedCost(flours) + calcTaxedCost(others);
                                                            return renderProfitCalculator(total);
                                                        })()}
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <>
                                        {/* Normal Recipe Scaling UI */}
                                        {(() => {
                                            // 通常レシピ用の基準材料名取得
                                            const getNormalBaseName = () => {
                                                if (normalBaseItem === 'multiplier') return tUi('scaleMultiplier');
                                                const match = normalBaseItem.match(/^ing-(\d+)$/);
                                                if (match) {
                                                    const idx = parseInt(match[1]);
                                                    const ing = ingredients[idx];
                                                    if (ing) return typeof ing === 'string' ? ing : ing.name;
                                                }
                                                // グループ内の材料
                                                const groupMatch = normalBaseItem.match(/^ing-(.+)-(\d+)$/);
                                                if (groupMatch) {
                                                    const groupId = groupMatch[1];
                                                    const idx = parseInt(groupMatch[2]);
                                                    const groups = displayRecipe.ingredientGroups || [];
                                                    const group = groups.find(g => String(g.id) === groupId);
                                                    if (group) {
                                                        const groupIngs = ingredients.filter(i => i.groupId === group.id);
                                                        const ing = groupIngs[idx];
                                                        if (ing) return typeof ing === 'string' ? ing : ing.name;
                                                    }
                                                }
                                                return tUi('scaleMultiplier');
                                            };

                                            // 基準材料の元の分量を取得
                                            const getNormalBaseOriginalQty = () => {
                                                if (normalBaseItem === 'multiplier') return null;
                                                const match = normalBaseItem.match(/^ing-(\d+)$/);
                                                if (match) {
                                                    const idx = parseInt(match[1]);
                                                    const ing = ingredients[idx];
                                                    if (ing) return parseFloat(ing.quantity) || 0;
                                                }
                                                const groupMatch = normalBaseItem.match(/^ing-(.+)-(\d+)$/);
                                                if (groupMatch) {
                                                    const groupId = groupMatch[1];
                                                    const idx = parseInt(groupMatch[2]);
                                                    const groups = displayRecipe.ingredientGroups || [];
                                                    const group = groups.find(g => String(g.id) === groupId);
                                                    if (group) {
                                                        const groupIngs = ingredients.filter(i => i.groupId === group.id);
                                                        const ing = groupIngs[idx];
                                                        if (ing) return parseFloat(ing.quantity) || 0;
                                                    }
                                                }
                                                return null;
                                            };

                                            // 実効倍率の計算
                                            const effectiveMultiplier = (() => {
                                                if (normalBaseItem === 'multiplier') {
                                                    return parseFloat(multiplier) || 1;
                                                }
                                                const baseQty = getNormalBaseOriginalQty();
                                                const target = parseFloat(normalBaseTarget);
                                                if (!baseQty || !target) return 1;
                                                return target / baseQty;
                                            })();

                                            return (
                                                <div className="screen-only no-print" style={{
                                                    background: '#f1f3f5',
                                                    padding: '0.5rem',
                                                    borderRadius: '6px',
                                                    marginBottom: '1rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.5rem',
                                                    border: '1px solid #dee2e6',
                                                    lineHeight: 1.2,
                                                    width: '100%',
                                                    boxSizing: 'border-box'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                                        <label className="base-item-control screen-only" title="倍率を直接入力する" style={{marginRight:'2px'}}>
                                                            <input type="radio" name="normalBaseItem" className="base-item-radio" checked={normalBaseItem === 'multiplier'} onChange={() => { setNormalBaseItem('multiplier'); setNormalBaseTarget(''); }} />
                                                            <span className="base-item-label">基準</span>
                                                        </label>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#000' }}>{tUi('scaleMultiplier')}:</span>
                                                        {normalBaseItem === 'multiplier' ? (
                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', marginRight: '4px', color: '#333' }}>×</span>
                                                                <input
                                                                    id="multiplier-input"
                                                                    type="number"
                                                                    min="0.1"
                                                                    step="0.1"
                                                                    value={multiplier}
                                                                    onChange={(e) => setMultiplier(e.target.value)}
                                                                    style={{
                                                                        width: '60px', padding: '2px 6px', fontSize: '0.9rem', fontWeight: 'bold',
                                                                        textAlign: 'center', borderRadius: '4px', border: '1.5px solid #333',
                                                                        background: '#fff', color: '#000'
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#000' }}>×{effectiveMultiplier.toFixed(3)}</span>
                                                        )}
                                                    </div>
                                                    {normalBaseItem !== 'multiplier' && (
                                                        <>
                                                            <div style={{ height: '1px', width: '100%', background: '#dee2e6' }}></div>
                                                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                                                <label htmlFor="normal-base-target" style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#000' }}>{getNormalBaseName()} の目標分量:</label>
                                                                <div style={{ position: 'relative' }}>
                                                                    <input
                                                                        id="normal-base-target"
                                                                        type="number"
                                                                        value={normalBaseTarget}
                                                                        onChange={(e) => setNormalBaseTarget(e.target.value)}
                                                                        placeholder={String(getNormalBaseOriginalQty() || '')}
                                                                        style={{
                                                                            padding: '2px 6px', width: '80px', borderRadius: '4px',
                                                                            border: '1.5px solid #333', fontSize: '0.9rem', fontWeight: 'bold',
                                                                            textAlign: 'right', color: '#000', backgroundColor: '#fff'
                                                                        }}
                                                                    />
                                                                </div>
                                                                {normalBaseTarget && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => { setNormalBaseTarget(''); setNormalBaseItem('multiplier'); }}
                                                                        style={{ padding: '0 4px', fontSize: '0.7rem', color: '#555', height: '22px', border: '1px solid #dee2e6' }}
                                                                    >
                                                                        リセット
                                                                    </Button>
                                                                )}
                                                            </div>
                                                                {normalBaseTarget && (
                                                                <div style={{ fontSize: '0.75rem', color: '#000', fontWeight: 'bold', marginLeft: 'auto' }}>
                                                                    ← 倍率: ×{normalEffectiveMultiplier.toFixed(3)} で計算中
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                    {normalBaseItem === 'multiplier' && parseFloat(multiplier) !== 1 && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setMultiplier('1')}
                                                            style={{ fontSize: '0.7rem', padding: '0 4px', color: '#555', height: '22px', border: '1px solid #dee2e6', alignSelf: 'flex-start' }}
                                                        >
                                                            リセット
                                                        </Button>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        <div className="screen-only no-print" style={{ margin: '0.25rem 0 0.9rem 0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 700 }}>原価参照モード:</span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={costReferenceMode === 'original' ? 'primary' : 'secondary'}
                                                onClick={() => setCostReferenceMode('original')}
                                            >
                                                元データ
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={costReferenceMode === 'override' ? 'primary' : 'secondary'}
                                                onClick={() => setCostReferenceMode('override')}
                                            >
                                                カテゴリ再設定
                                            </Button>
                                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                ※ 合成原価では再設定を優先。未設定カテゴリは元データを参照します。
                                            </span>
                                        </div>

                                        {(() => {
                                            // Grouping Logic
                                            const groups = displayRecipe.ingredientGroups && displayRecipe.ingredientGroups.length > 0
                                                ? displayRecipe.ingredientGroups
                                                : null;

                                            if (groups) {
                                                return groups.map((group) => {
                                                    const groupIngredients = ingredients.filter(ing => ing.groupId === group.id);
                                                    if (groupIngredients.length === 0) return null;

                                                    if (['作り方', 'Steps', 'Method', '手順'].includes(group.name)) return null;
                                                    const shouldHideHeading = ['材料', 'Ingredients', 'ingredients'].includes(group.name);
                                                    const categoryMultiplier = getCategoryDisplayMultiplier(`group:${String(group.id)}`);
                                                    const overrideBase = toFiniteNumber(categoryCostOverrides.get(`group:${String(group.id)}`));
                                                    const hasSetCost = Number.isFinite(overrideBase);
                                                    const groupSetCost = hasSetCost
                                                        ? (overrideBase * normalEffectiveMultiplier)
                                                        : null;

                                                    return (
                                                        <div key={group.id} style={{ marginBottom: '1.5rem' }}>
                                                            {!shouldHideHeading && (
                                                                <h3 className="ingredient-group-heading">
                                                                    <button
                                                                        type="button"
                                                                        className="ingredient-group-heading__button"
                                                                        onClick={() => openIngredientGroupStats(`group:${String(group.id)}`, group.name, groupIngredients)}
                                                                    >
                                                                        <span>{group.name}</span>
                                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            {hasSetCost && (
                                                                                <span className="ingredient-group-heading__set-cost screen-only">
                                                                                    セット原価: {formatYen(groupSetCost, { maximumFractionDigits: 2 }) ?? '—'}
                                                                                </span>
                                                                            )}
                                                                            <span className="ingredient-group-heading__hint screen-only">集計を見る</span>
                                                                        </span>
                                                                    </button>
                                                                </h3>
                                                            )}
                                                            <table className="ingredients-table">
                                                                <thead>
                                                                    <tr>
                                                                        <th style={{ width: '40%' }}>{tUi('ingredientName')}</th>
                                                                        <th style={{ width: '20%', textAlign: 'right', paddingRight: '0.5rem' }}>{tUi('quantity')}</th>
                                                                        <th style={{ width: '15%', paddingLeft: '0.5rem' }}>{tUi('unit')}</th>
                                                                        <th style={{ width: '15%', textAlign: 'right' }}>{tUi('purchase')}</th>
                                                                        <th style={{ width: '15%', textAlign: 'right' }}>{tUi('cost')}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {groupIngredients.map((ing, i) => {
                                                                        const originalIndex = ingredients.indexOf(ing);
                                                                        const originalIng = sourceRecipe.ingredients?.[originalIndex];
                                                                        const displayRef = typeof ing === 'string' ? ing : ing.name;
                                                                        const originalRef = originalIng ? (typeof originalIng === 'string' ? originalIng : originalIng.name) : '';
                                                                        const displayUnit = typeof ing === 'object' ? ing.unit : '';
                                                                        const originalUnit = originalIng && typeof originalIng === 'object' ? originalIng.unit : '';

                                                                        const effectiveMultiplier = normalEffectiveMultiplier * categoryMultiplier;
                                                                        const scaledQty = getScaledQty(ing.quantity, effectiveMultiplier);
                                                                        const scaledCost = getScaledCost(ing.cost, effectiveMultiplier);
                                                                        const isScaled = effectiveMultiplier !== 1;
                                                                        const baseId = `ing-${group.id}-${i}`;

                                                                        return (
                                                                            <tr key={i} className="ingredient-row">
                                                                                <td>
                                                                                    <div className="ingredient-name">
                                                                                        <label className="base-item-control screen-only" title="この材料を基準に計算する">
                                                                                            <input type="radio" name="normalBaseItem" className="base-item-radio" checked={normalBaseItem === baseId} onChange={() => setNormalBaseItem(baseId)} />
                                                                                            <span className="base-item-label">基準</span>
                                                                                        </label>
                                                                                        <span>{renderText(displayRef, originalRef)}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td style={{ textAlign: 'right', paddingRight: '0.5rem', fontWeight: isScaled ? 'bold' : 'normal', color: isScaled ? 'var(--color-primary)' : 'inherit' }}>
                                                                                    {scaledQty}
                                                                                </td>
                                                                                <td style={{ paddingLeft: '0.5rem' }}>{renderText(displayUnit, originalUnit)}</td>
                                                                                <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{formatYen(ing.purchaseCost) ?? '-'}</td>
                                                                                <td style={{ textAlign: 'right' }}>
                                                                                    {formatYen(scaledCost) ?? '-'}
                                                                                    {isTax10Item(ing) && <span style={{ fontSize: '0.7em', color: '#d35400', marginLeft: '2px' }}>(税10%)</span>}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    );
                                                });
                                            }

                                            // Fallback: Legacy Flat View
                                            return (
                                                <>
                                                    {(() => {
                                                        const categoryMultiplier = getCategoryDisplayMultiplier('group:all');
                                                        return (
                                                    <table className="ingredients-table">
                                                        <thead>
                                                            <tr>
                                                                <th style={{ width: '40%' }}>{tUi('ingredientName')}</th>
                                                                <th style={{ width: '20%', textAlign: 'right', paddingRight: '0.5rem' }}>{tUi('quantity')}</th>
                                                                <th style={{ width: '15%', paddingLeft: '0.5rem' }}>{tUi('unit')}</th>
                                                                <th style={{ width: '15%', textAlign: 'right' }}>{tUi('purchase')}</th>
                                                                <th style={{ width: '15%', textAlign: 'right' }}>{tUi('cost')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {ingredients.map((ing, i) => {
                                                                const originalIng = sourceRecipe.ingredients?.[i];
                                                                const displayRef = typeof ing === 'string' ? ing : ing.name;
                                                                const originalRef = originalIng ? (typeof originalIng === 'string' ? originalIng : originalIng.name) : '';
                                                                const displayUnit = typeof ing === 'object' ? ing.unit : '';
                                                                const originalUnit = originalIng && typeof originalIng === 'object' ? originalIng.unit : '';

                                                                const effectiveMultiplier = normalEffectiveMultiplier * categoryMultiplier;
                                                                const scaledQty = getScaledQty(ing.quantity, effectiveMultiplier);
                                                                const scaledCost = getScaledCost(ing.cost, effectiveMultiplier);
                                                                const isScaled = effectiveMultiplier !== 1;
                                                                const baseId = `ing-${i}`;

                                                                return (
                                                                    <tr key={i} className="ingredient-row">
                                                                        <td>
                                                                            <div className="ingredient-name">
                                                                                <label className="base-item-control screen-only" title="この材料を基準に計算する">
                                                                                    <input type="radio" name="normalBaseItem" className="base-item-radio" checked={normalBaseItem === baseId} onChange={() => setNormalBaseItem(baseId)} />
                                                                                    <span className="base-item-label">基準</span>
                                                                                </label>
                                                                                <span>{renderText(displayRef, originalRef)}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td style={{ textAlign: 'right', paddingRight: '0.5rem', fontWeight: isScaled ? 'bold' : 'normal', color: isScaled ? 'var(--color-primary)' : 'inherit' }}>
                                                                            {scaledQty}
                                                                        </td>
                                                                        <td style={{ paddingLeft: '0.5rem' }}>{renderText(displayUnit, originalUnit)}</td>
                                                                        <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{formatYen(ing.purchaseCost) ?? '-'}</td>
                                                                        <td style={{ textAlign: 'right' }}>
                                                                            {formatYen(scaledCost) ?? '-'}
                                                                            {isTax10Item(ing) && <span style={{ fontSize: '0.7em', color: '#d35400', marginLeft: '2px' }}>(税10%)</span>}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                        );
                                                    })()}
                                                    <div className="cost-summary">
                                                        <span className="cost-summary__label">{tUi('totalCost')}:</span>
                                                        <span className="cost-summary__value">
                                                            ¥{Math.round(normalPrintTotal).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </>
                                            );
                                        })()}

                                        <div className="screen-only no-print">
                                            <div className="cost-summary">
                                                <span className="cost-summary__label">{tUi('totalCost')}:</span>
                                                <span className="cost-summary__value">
                                                    ¥{Math.round(normalPrintTotal).toLocaleString()}
                                                </span>
                                                <span className="cost-summary__note">(税込)</span>
                                            </div>
                                        </div>
                                        <p className="recipe-detail__subtle recipe-detail__tax-footnote">※原価は材料ごとに税率(8% or 10%)を適用</p>

                                        {(() => {
                                            return renderProfitCalculator(normalPrintTotal);
                                        })()}
                                    </>
                                )}

                            </Card>
                        </section>
                        <section className="detail-section">
                            <h2>{tUi('instructions')}</h2>
                            {(() => {
                                const stepGroups = displayRecipe.stepGroups && displayRecipe.stepGroups.length > 0 ? displayRecipe.stepGroups : null;
                                const hasGroupedSteps = stepGroups && steps.some(s => {
                                    if (!s || typeof s !== 'object' || !s.groupId) return false;
                                    return stepGroups.some(g => g.id === s.groupId);
                                });

                                if (stepGroups && hasGroupedSteps) {
                                    return (
                                        <div className="steps-container">
                                            {stepGroups.map(group => {
                                                const groupSteps = steps.filter(s => {
                                                    const sGroupId = typeof s === 'object' ? s.groupId : null;
                                                    return sGroupId === group.id;
                                                });

                                                if (groupSteps.length === 0) return null;

                                                return (
                                                    <div key={group.id} className="step-group" style={{ marginBottom: '2rem' }}>
                                                        {/* Skip redundant group headers */}
                                                        {group.name !== '作り方' && group.name !== 'Steps' && (
                                                            <h3 style={{
                                                                fontSize: '1.1rem',
                                                                marginBottom: '1rem',
                                                                color: 'var(--color-text-main)',
                                                                borderLeft: '4px solid var(--color-primary)',
                                                                paddingLeft: '10px'
                                                            }}>
                                                                {group.name}
                                                            </h3>
                                                        )}
                                                        <div className="steps-list">
                                                            {groupSteps.map((step, i) => {
                                                                // Find original index relative to full list for correct translation mapping logic if needed
                                                                const originalIndex = steps.indexOf(step);
                                                                const stepText = typeof step === 'object' ? step.text : step;
                                                                const originalStep = sourceRecipe.steps?.[originalIndex];
                                                                const originalText = typeof originalStep === 'object' ? originalStep.text : originalStep;

                                                                // Strip HTML tags for safety and clean print
                                                                const cleanText = (txt) => {
                                                                    if (!txt) return '';
                                                                    return txt.replace(/<[^>]*>?/gm, '');
                                                                };

                                                                return (
                                                                    <Card
                                                                        key={i}
                                                                        className={`step-card ${completedSteps.has(originalIndex) ? 'is-completed' : ''}`}
                                                                        onClick={() => toggleStep(originalIndex)}
                                                                    >
                                                                        <div className="step-number">{originalIndex + 1}</div>
                                                                        <p className="step-text">{renderText(cleanText(stepText), cleanText(originalText), true)}</p>
                                                                    </Card>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                }

                                // Legacy Flat List
                                return (
                                    <div className="steps-list">
                                        {steps.map((step, i) => {
                                            const stepText = typeof step === 'object' ? step.text : step;
                                            const originalStep = sourceRecipe.steps?.[i];
                                            const originalText = typeof originalStep === 'object' ? originalStep.text : originalStep;

                                            return (
                                                <Card
                                                    key={i}
                                                    className={`step-card ${completedSteps.has(i) ? 'is-completed' : ''}`}
                                                    onClick={() => toggleStep(i)}
                                                >
                                                    <div className="step-number">{i + 1}</div>
                                                    <p className="step-text">{renderText(stepText, originalText, true)}</p>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </section>
                    </div>
                </div >

                {/* 印刷プレビューモーダル */}
                <Modal
                    isOpen={showPrintModal}
                    onClose={() => setShowPrintModal(false)}
                    title="🖨️ レシピプレビュー"
                    size="large"
                >
                    <div className="print-preview-recipe">
                        {/* ヘッダー */}
                        <div className="preview-header">
                            <h2>{displayRecipe.title}</h2>
                            {/* プレビューではレシピ画像を表示しない */}
                        </div>

                        {/* メタ情報 */}
                        <div className="preview-meta">
                            {displayRecipe.course && <div><strong>コース:</strong> {displayRecipe.course}</div>}
                            {displayRecipe.category && <div><strong>カテゴリー:</strong> {displayRecipe.category}</div>}
                            {displayRecipe.storeName && <div><strong>店舗名:</strong> {displayRecipe.storeName}</div>}
                            {displayRecipe.servings && <div><strong>分量:</strong> {displayRecipe.servings}人分</div>}
                        </div>

                        {displayRecipe.description && (
                            <div className="preview-description">
                                <p>{displayRecipe.description}</p>
                            </div>
                        )}

                        <div className="preview-controls">
                            {displayRecipe.type === 'bread' ? (
                                <div className="preview-control-row">
                                    <label className="preview-control-label" htmlFor="preview-target-total" style={{ display: 'block', marginBottom: '4px' }}>
                                        {breadBasisName ? `${breadBasisName} の目標分量` : '仕上がり総重量(g)'}
                                    </label>
                                    <input
                                        id="preview-target-total"
                                        className="preview-control-input"
                                        type="number"
                                        value={targetTotal}
                                        onChange={(e) => setTargetTotal(e.target.value)}
                                        placeholder="1000"
                                    />
                                    {targetTotal && (
                                        <button
                                            type="button"
                                            className="preview-control-reset"
                                            onClick={() => setTargetTotal('')}
                                        >
                                            リセット
                                        </button>
                                    )}
                                    {breadPrintContext?.grandTotal ? (
                                        <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                                            <span className="preview-control-note">
                                                現在の{breadBasisName || '総重量'}: {
                                                    (breadBasisName === '粉グループの総重量' 
                                                        ? breadPrintContext.totalFlour 
                                                        : (breadBasisName 
                                                            ? (parseFloat(breadPrintContext.flours.find(f => f.name === breadBasisName)?.quantity || breadPrintContext.others.find(o => o.name === breadBasisName)?.quantity) || 0)
                                                            : breadPrintContext.grandTotal)
                                                    ).toLocaleString()
                                                }g
                                            </span>
                                            {breadBasisName && (
                                                <div style={{ color: 'var(--color-primary)', fontWeight: 'bold', marginTop: '2px' }}>
                                                    再計算後の総重量: {(breadPrintContext.grandTotal * breadPrintContext.scaleFactor).toLocaleString()}g
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="preview-control-row">
                                    <label className="preview-control-label" htmlFor="preview-normal-input" style={{ display: 'block', marginBottom: '4px' }}>
                                        {normalBasisName ? `${normalBasisName} の目標分量` : tUi('scaleMultiplier')}
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {!normalBasisName && <span className="preview-control-mult">×</span>}
                                        <input
                                            id="preview-normal-input"
                                            className="preview-control-input"
                                            type="number"
                                            step={normalBasisName ? "1" : "0.1"}
                                            value={normalBasisName ? normalBaseTarget : multiplier}
                                            onChange={(e) => normalBasisName ? setNormalBaseTarget(e.target.value) : setMultiplier(e.target.value)}
                                            placeholder={normalBasisName ? "100" : "1"}
                                            style={{ width: normalBasisName ? '100px' : '80px' }}
                                        />
                                        {normalBasisName && <span style={{ fontSize: '0.9rem' }}>g</span>}
                                        {((normalBasisName && normalBaseTarget) || (!normalBasisName && String(multiplier) !== '1')) && (
                                            <button
                                                type="button"
                                                className="preview-control-reset"
                                                onClick={() => normalBasisName ? setNormalBaseTarget('') : setMultiplier('1')}
                                            >
                                                リセット
                                            </button>
                                        )}
                                    </div>
                                    {normalBasisName && (
                                        <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                                            <span className="preview-control-note">
                                                現在の{normalBasisName}: {
                                                    (() => {
                                                        const match = normalBaseItem.match(/^ing-(\d+)$/);
                                                        if (match) {
                                                            const idx = parseInt(match[1]);
                                                            return parseFloat(ingredients[idx]?.quantity) || 0;
                                                        }
                                                        const groupMatch = normalBaseItem.match(/^ing-(.+)-(\d+)$/);
                                                        if (groupMatch) {
                                                            const groupId = groupMatch[1];
                                                            const idx = parseInt(groupMatch[2]);
                                                            const groups = displayRecipe?.ingredientGroups || [];
                                                            const group = groups.find(g => String(g.id) === groupId);
                                                            if (group) {
                                                                const groupIngs = ingredients.filter(i => i.groupId === group.id);
                                                                return parseFloat(groupIngs[idx]?.quantity) || 0;
                                                            }
                                                        }
                                                        return 0;
                                                    })().toLocaleString()
                                                }g
                                            </span>
                                            <div style={{ color: 'var(--color-primary)', fontWeight: 'bold', marginTop: '2px' }}>
                                                ← 倍率: ×{normalEffectiveMultiplier.toFixed(3)} で計算中
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 材料 */}
                        <div className="preview-section">
                            <h3>{tUi('ingredients')}</h3>
                            {displayRecipe.type === 'bread' ? (
                                <div className="preview-ingredients-bread">
                                    {/* パンレシピの場合 */}
                                    <div className="bread-group">
                                        <h4>{tUi('flourGroup')}</h4>
                                        <table className="preview-table">
                                            <thead>
                                                <tr>
                                                    <th>{tUi('ingredientName')}</th>
                                                    <th style={{ textAlign: 'right' }}>{tUi('quantity')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(costAdjustedRecipe.flours || []).map((item, i) => {
                                                    const itemId = `flour-${i}`;
                                                    const qty = breadPrintContext ? breadPrintContext.getScaledQtyValue(item.quantity) : item.quantity;
                                                    return (
                                                        <tr
                                                            key={i}
                                                            className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                            onClick={() => togglePreviewIngredient(itemId)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    togglePreviewIngredient(itemId);
                                                                }
                                                            }}
                                                        >
                                                            <td>{item.name}</td>
                                                            <td style={{ textAlign: 'right' }}>{qty}g</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="bread-group">
                                        <h4>{tUi('otherIngredients')}</h4>
                                        <table className="preview-table">
                                            <thead>
                                                <tr>
                                                    <th>{tUi('ingredientName')}</th>
                                                    <th style={{ textAlign: 'right' }}>{tUi('quantity')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(costAdjustedRecipe.breadIngredients || []).map((item, i) => {
                                                    const itemId = `bread-${i}`;
                                                    const qty = breadPrintContext ? breadPrintContext.getScaledQtyValue(item.quantity) : item.quantity;
                                                    return (
                                                        <tr
                                                            key={i}
                                                            className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                            onClick={() => togglePreviewIngredient(itemId)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    togglePreviewIngredient(itemId);
                                                                }
                                                            }}
                                                        >
                                                            <td>{item.name}</td>
                                                            <td style={{ textAlign: 'right' }}>{qty}g</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="preview-ingredients-normal">
                                    {(() => {
                                        const groups = displayRecipe.ingredientGroups && displayRecipe.ingredientGroups.length > 0
                                            ? displayRecipe.ingredientGroups
                                            : null;

                                        if (groups) {
                                            return groups.map((group) => {
                                                const groupIngredients = ingredients.filter(ing => ing.groupId === group.id);
                                                if (groupIngredients.length === 0) return null;
                                                if (['作り方', 'Steps', 'Method', '手順'].includes(group.name)) return null;
                                                const categoryMultiplier = getCategoryDisplayMultiplier(`group:${String(group.id)}`);

                                                return (
                                                    <div key={group.id} className="ingredient-group">
                                                        <h4>{group.name}</h4>
                                                        <table className="preview-table preview-table--normal">
                                                            <thead>
                                                                <tr>
                                                                    <th>{tUi('ingredientName')}</th>
                                                                    <th style={{ textAlign: 'right' }}>{tUi('quantity')}</th>
                                                                    <th>{tUi('unit')}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {groupIngredients.map((ing, i) => {
                                                                    const itemId = `${group.id}-${i}`;
                                                                    const name = typeof ing === 'string' ? ing : ing.name;
                                                                    const qty = typeof ing === 'object'
                                                                        ? getScaledQty(ing.quantity, normalEffectiveMultiplier * categoryMultiplier)
                                                                        : '';
                                                                    const unit = typeof ing === 'object' ? ing.unit : '';
                                                                    return (
                                                                        <tr
                                                                            key={i}
                                                                            className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                                            onClick={() => togglePreviewIngredient(itemId)}
                                                                            role="button"
                                                                            tabIndex={0}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                                    e.preventDefault();
                                                                                    togglePreviewIngredient(itemId);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <td>{name}</td>
                                                                            <td style={{ textAlign: 'right' }}>{qty}</td>
                                                                            <td>{unit}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            });
                                        } else {
                                            const categoryMultiplier = getCategoryDisplayMultiplier('group:all');
                                            return (
                                                <table className="preview-table preview-table--normal">
                                                    <thead>
                                                        <tr>
                                                            <th>{tUi('ingredientName')}</th>
                                                            <th style={{ textAlign: 'right' }}>{tUi('quantity')}</th>
                                                            <th>{tUi('unit')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {ingredients.map((ing, i) => {
                                                            const itemId = `ungrouped-${i}`;
                                                            const name = typeof ing === 'string' ? ing : ing.name;
                                                            const qty = typeof ing === 'object'
                                                                ? getScaledQty(ing.quantity, normalEffectiveMultiplier * categoryMultiplier)
                                                                : '';
                                                            const unit = typeof ing === 'object' ? ing.unit : '';
                                                            return (
                                                                <tr
                                                                    key={i}
                                                                    className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                                    onClick={() => togglePreviewIngredient(itemId)}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                            e.preventDefault();
                                                                            togglePreviewIngredient(itemId);
                                                                        }
                                                                    }}
                                                                >
                                                                    <td>{name}</td>
                                                                    <td style={{ textAlign: 'right' }}>{qty}</td>
                                                                    <td>{unit}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            );
                                        }
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* 作り方 */}
                        {steps.length > 0 && (
                            <div className="preview-section">
                                <h3>{tUi('instructions')}</h3>
                                <ol className="preview-steps">
                                    {steps.map((step, i) => {
                                        const stepText = typeof step === 'object' ? step.text : step;
                                        return (
                                            <li
                                                key={i}
                                                className={previewCompletedSteps.has(i) ? 'is-completed' : ''}
                                                onClick={() => togglePreviewStep(i)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        togglePreviewStep(i);
                                                    }
                                                }}
                                            >
                                                {stepText}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        )}

                        {/* アクションボタン */}
                        <div className="modal-actions">
                            <Button variant="primary" onClick={() => window.print()}>
                                🖨️ {tUi('print')}
                            </Button>
                            <Button variant="ghost" onClick={() => setShowPrintModal(false)}>
                                {tUi('close')}
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div >

            <Modal
                isOpen={showQrCodeModal}
                onClose={() => setShowQrCodeModal(false)}
                title="📱 QRコード"
                size="small"
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#666', textAlign: 'center' }}>
                        スマートフォンで読み取ると、<br />元のレシピページにアクセスできます。
                    </p>
                    <div style={{ background: 'white', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                        <QRCode value={displayRecipe.sourceUrl || ''} size={200} />
                    </div>
                    <Button variant="secondary" onClick={() => setShowQrCodeModal(false)}>
                        閉じる
                    </Button>
                </div>
            </Modal>

            <div className="print-layout">
                <div className="recipe-detail__hero">
                    {displayRecipe.image ? (
                        <img src={displayRecipe.image} alt={displayRecipe.title} className="recipe-detail__image" />
                    ) : (
                        <div className="recipe-detail__image-placeholder" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.8rem' }}>
                            No Image
                        </div>
                    )}
                </div>
                <div className="recipe-detail__title-card">
                    <h1>{renderPrintText(displayRecipe.title, sourceRecipe.title)}</h1>
                    {printDescription && (
                        <p className="recipe-detail__desc">
                            {renderPrintText(printDescription, sourceRecipe.description)}
                        </p>
                    )}
                </div>
                <div className="recipe-detail__meta">
                    {displayRecipe.category && (
                        <div className="meta-item">
                            <span className="meta-label">{tUi('category')}</span>
                            <span className="meta-value">{renderPrintText(displayRecipe.category, sourceRecipe.category)}</span>
                        </div>
                    )}
                    {displayRecipe.storeName && (
                        <div className="meta-item">
                            <span className="meta-label">{tUi('storeName')}</span>
                            <span className="meta-value meta-value--store">
                                {renderPrintText(displayRecipe.storeName, sourceRecipe.storeName)}
                            </span>
                        </div>
                    )}
                    {displayRecipe.course && (
                        <div className="meta-item">
                            <span className="meta-label">{tUi('course')}</span>
                            <span className="meta-value">{renderPrintText(displayRecipe.course, sourceRecipe.course)}</span>
                        </div>
                    )}
                    {displayRecipe.servings && (
                        <div className="meta-item">
                            <span className="meta-label">{tUi('servings')}</span>
                            <span className="meta-value">
                                {renderPrintText(
                                    `${displayRecipe.servings}人分`,
                                    sourceRecipe.servings ? `${sourceRecipe.servings}人分` : ''
                                )}
                            </span>
                        </div>
                    )}
                </div>
                {displayRecipe.sourceUrl && (
                    <div className="print-layout__source">
                        <div className="print-layout__source-label">{tUi('sourceRecipe')}</div>
                        <div className="print-layout__source-qr">
                            <QRCode value={displayRecipe.sourceUrl} size={84} style={{ display: 'block' }} />
                        </div>
                    </div>
                )}
                <div className="recipe-detail__main">
                    <section className="detail-section">
                        <h2>{tUi('ingredients')}</h2>
                        {displayRecipe.type === 'bread' && breadPrintContext ? (
                            <div>
                                <div className="bread-section" style={{ marginBottom: '1.5rem' }}>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{tUi('flourGroup')}</h3>
                                    <table className="ingredients-table">
                                        <thead>
                                            <tr>
                                                <th>{tUi('ingredientName')}</th>
                                                <th style={{ textAlign: 'right' }}>{tUi('quantityGram')}</th>
                                                <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>{tUi('purchase')}</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>{tUi('cost')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {breadPrintContext.flours.map((item, idx) => {
                                                const originalItem = sourceRecipe.flours?.[idx] || {};
                                                const displayQty = breadPrintContext.getScaledQtyValue(item.quantity);
                                                const originalQty = targetTotal ? '' : originalItem.quantity;
                                                return (
                                                    <tr key={`print-flour-${idx}`}>
                                                        <td>{renderPrintText(item.name, originalItem.name)}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                            {renderPrintText(displayQty, originalQty)}
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#555' }}>
                                                            {breadPrintContext.calcPercent(item.quantity)}%
                                                        </td>
                                                        <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{formatYen(item.purchaseCost) ?? '-'}</td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            {item.cost ? `¥${breadPrintContext.formatCostValue(item.cost)}` : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="bread-section">
                                    <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{tUi('otherIngredients')}</h3>
                                    <table className="ingredients-table">
                                        <thead>
                                            <tr>
                                                <th>{tUi('ingredientName')}</th>
                                                <th style={{ textAlign: 'right' }}>{tUi('quantityGram')}</th>
                                                <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>{tUi('purchase')}</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>{tUi('cost')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {breadPrintContext.others.map((item, idx) => {
                                                const originalItem = sourceRecipe.breadIngredients?.[idx] || {};
                                                const displayQty = breadPrintContext.getScaledQtyValue(item.quantity);
                                                const originalQty = targetTotal ? '' : originalItem.quantity;
                                                return (
                                                    <tr key={`print-others-${idx}`}>
                                                        <td>{renderPrintText(item.name, originalItem.name)}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                            {renderPrintText(displayQty, originalQty)}
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#555' }}>
                                                            {breadPrintContext.calcPercent(item.quantity)}%
                                                        </td>
                                                        <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{formatYen(item.purchaseCost) ?? '-'}</td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            {item.cost ? `¥${breadPrintContext.formatCostValue(item.cost)}` : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            printIngredientSections.map(section => {
                                const originalSectionName = sourceRecipe.ingredientGroups?.find((g) => g.id === section.id)?.name || '';
                                const sectionCategoryKey = section.id === 'ungrouped'
                                    ? 'group:ungrouped'
                                    : `group:${String(section.id)}`;
                                const sectionCategoryMultiplier = getCategoryDisplayMultiplier(sectionCategoryKey);
                                const printEffectiveMultiplier = normalEffectiveMultiplier * sectionCategoryMultiplier;
                                return (
                                    <div key={section.id} style={{ marginBottom: '1.2rem' }}>
                                        {section.name && (
                                            <div className="print-group-heading">{renderPrintText(section.name, originalSectionName)}</div>
                                        )}
                                        <table className="ingredients-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '40%' }}>{tUi('ingredientName')}</th>
                                                    <th style={{ width: '20%', textAlign: 'right', paddingRight: '0.5rem' }}>{tUi('quantity')}</th>
                                                    <th style={{ width: '15%', paddingLeft: '0.5rem' }}>{tUi('unit')}</th>
                                                    <th style={{ width: '15%', textAlign: 'right' }}>{tUi('purchase')}</th>
                                                    <th style={{ width: '15%', textAlign: 'right' }}>{tUi('cost')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {section.items.map((ing, idx) => {
                                                    const qty = typeof ing === 'object' ? ing.quantity : '';
                                                    const unit = typeof ing === 'object' ? ing.unit : '';
                                                    const purchase = typeof ing === 'object' ? ing.purchaseCost : null;
                                                    const costVal = typeof ing === 'object' ? ing.cost : null;
                                                    const name = typeof ing === 'string' ? ing : ing.name;
                                                    const scaledQty = typeof ing === 'object' ? getScaledQty(ing.quantity, printEffectiveMultiplier) : qty;
                                                    const originalIndex = ingredients.indexOf(ing);
                                                    const originalIng = sourceRecipe.ingredients?.[originalIndex];
                                                    const originalName = originalIng
                                                        ? (typeof originalIng === 'string' ? originalIng : originalIng.name)
                                                        : '';
                                                    const originalUnit = originalIng && typeof originalIng === 'object' ? originalIng.unit : '';
                                                    const originalQty = String(printEffectiveMultiplier) === '1'
                                                        ? (originalIng && typeof originalIng === 'object' ? originalIng.quantity : '')
                                                        : '';
                                                    return (
                                                        <tr key={`print-ing-${section.id}-${idx}`}>
                                                            <td>{renderPrintText(name, originalName)}</td>
                                                            <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                                                                {renderPrintText(scaledQty, originalQty)}
                                                            </td>
                                                            <td style={{ paddingLeft: '0.5rem' }}>{renderPrintText(unit, originalUnit)}</td>
                                                            <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{formatYen(purchase) ?? '-'}</td>
                                                            <td style={{ textAlign: 'right' }}>{formatYen(costVal) ?? '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })
                        )}
                        <div className="cost-summary">
                            <span className="cost-summary__label">{tUi('totalCost')}:</span>
                            <span className="cost-summary__value">¥{printCostTotalDisplay}</span>
                            <span className="cost-summary__note">(税込)</span>
                        </div>
                        <p className="recipe-detail__subtle recipe-detail__tax-footnote">※原価は材料ごとに税率(8% or 10%)を適用</p>
                    </section>
                    <section className="detail-section">
                        <h2>{tUi('instructions')}</h2>
                        {steps.length > 0 ? (
                            <div className="steps-list">
                                {steps.map((step, index) => {
                                    const stepText = typeof step === 'object' ? step.text : step;
                                    const originalStep = sourceRecipe.steps?.[index];
                                    const originalText = typeof originalStep === 'object' ? originalStep?.text : originalStep;
                                    return (
                                        <div className="step-card" key={`print-step-${index}`}>
                                            <div className="step-number">{index + 1}</div>
                                            <p className="step-text">{renderPrintText(stepText, originalText)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p style={{ fontSize: '0.9rem', color: '#555' }}>{tUi('noSteps')}</p>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
};
