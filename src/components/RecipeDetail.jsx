import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import { translationService } from '../services/translationService';
import { recipeService } from '../services/recipeService';
import {
    buildRecipePayloadFromAiProposal,
    continueRecipeAiConversation,
    askRecipeAiQuestion,
    generateRecipeAiIntake,
    generateRecipeImprovement,
    isSakanaUnlocked,
    serializeRecipeAiDirectionContext,
    unlockSakana,
} from '../services/recipeAiService';
import { recordRecipeAiAdoption } from '../services/recipeAiLearningService';
import {
    categoryCostOverrideService,
    getRecipeCostCategories,
    computeRecipeTotalCostTaxIncluded,
} from '../services/categoryCostOverrideService';
import { unitConversionService } from '../services/unitConversionService';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { SUPPORTED_LANGUAGES } from '../constants';
import { getRecipeAiProgressConfig } from '../constants/recipeAiProgress';
import { normalizeUnit } from '../utils/unitUtils';
import './RecipeDetail.css';
import { FavoriteStarButton } from './FavoriteStarButton';
import './FavoriteStarButton.css';
import QRCode from "react-qr-code";

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const formatAiDisplayText = (value) => String(value ?? '')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

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

        const qty = parseQuantityValue(item.quantity);
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
            ? `${formatCompactNumber(total, { maximumFractionDigits: 3 })}`
            : `${formatCompactNumber(total, { maximumFractionDigits: 3 })} ${unitLabel}`,
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
    country: '国',
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

const formatScaledQuantity = (value) => {
    if (!Number.isFinite(value)) return '';
    return String(Math.round(value * 10) / 10)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*?)0+$/, '$1');
};

const getUsageAmountStorageKey = (scopeKey) => `recipe-detail:group-usage-amounts:${String(scopeKey ?? '')}`;
const getUsageScopeKey = (recipeId, recipeTitle) => {
    if (recipeId) return `id:${String(recipeId)}`;
    if (recipeTitle) return `title:${String(recipeTitle)}`;
    return '';
};

const loadUsageAmountMap = (scopeKey) => {
    if (!scopeKey || typeof window === 'undefined') return new Map();
    try {
        const raw = window.localStorage.getItem(getUsageAmountStorageKey(scopeKey));
        if (!raw) return new Map();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return new Map();
        const next = new Map();
        for (const [key, value] of Object.entries(parsed)) {
            if (!key) continue;
            next.set(key, value == null ? '' : String(value));
        }
        return next;
    } catch {
        return new Map();
    }
};

const saveUsageAmountMap = (scopeKey, usageMap) => {
    if (!scopeKey || typeof window === 'undefined') return;
    try {
        const payload = Object.fromEntries(Array.from(usageMap.entries()));
        window.localStorage.setItem(getUsageAmountStorageKey(scopeKey), JSON.stringify(payload));
    } catch {
        // ignore localStorage write errors (private mode / quota, etc.)
    }
};

const mergeUsageMaps = (primaryMap, secondaryMap) => {
    const merged = new Map(secondaryMap || []);
    for (const [key, value] of (primaryMap || new Map()).entries()) {
        merged.set(key, value);
    }
    return merged;
};

const loadUsageAmountForGroup = ({ recipeId, recipeTitle, groupKey }) => {
    if (!groupKey) return '';
    const idScope = getUsageScopeKey(recipeId, null);
    const titleScope = getUsageScopeKey(null, recipeTitle);
    const idMap = loadUsageAmountMap(idScope);
    const titleMap = loadUsageAmountMap(titleScope);
    const merged = mergeUsageMaps(idMap, titleMap);
    const value = merged.get(groupKey);
    return value == null ? '' : String(value);
};

const saveUsageAmountForGroup = ({ recipeId, recipeTitle, groupKey, value }) => {
    if (!groupKey) return;
    const nextValue = value == null ? '' : String(value);
    const idScope = getUsageScopeKey(recipeId, null);
    const titleScope = getUsageScopeKey(null, recipeTitle);

    if (idScope) {
        const idMap = loadUsageAmountMap(idScope);
        idMap.set(groupKey, nextValue);
        saveUsageAmountMap(idScope, idMap);
    }
    if (titleScope) {
        const titleMap = loadUsageAmountMap(titleScope);
        titleMap.set(groupKey, nextValue);
        saveUsageAmountMap(titleScope, titleMap);
    }
};

const parseFractionInput = (value) => {
    const raw = String(value ?? '').trim().replace(/／/g, '/');
    if (!raw) return null;

    const mixed = raw.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
        const whole = Number(mixed[1]);
        const numerator = Number(mixed[2]);
        const denominator = Number(mixed[3]);
        if (Number.isInteger(whole) && Number.isInteger(numerator) && Number.isInteger(denominator) && numerator >= 0 && denominator > 0) {
            const improper = whole >= 0
                ? (whole * denominator + numerator)
                : (whole * denominator - numerator);
            return { numerator: improper, denominator };
        }
    }

    const simple = raw.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (simple) {
        const numerator = Number(simple[1]);
        const denominator = Number(simple[2]);
        if (Number.isInteger(numerator) && Number.isInteger(denominator) && denominator > 0) {
            return { numerator, denominator };
        }
    }

    return null;
};

const gcd = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
        const t = x % y;
        x = y;
        y = t;
    }
    return x || 1;
};

const formatFraction = (numerator, denominator) => {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) return '';
    const sign = numerator < 0 ? '-' : '';
    const absNum = Math.abs(numerator);
    const whole = Math.floor(absNum / denominator);
    const remainder = absNum % denominator;
    if (remainder === 0) return `${sign}${whole}`;
    if (whole === 0) return `${sign}${remainder}/${denominator}`;
    return `${sign}${whole} ${remainder}/${denominator}`;
};

const parseQuantityValue = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return NaN;

    // Fraction first. parseFloat("1/8") === 1 になるのを防ぐ。
    const fraction = parseFractionInput(raw);
    if (fraction && Number.isFinite(fraction.numerator) && Number.isFinite(fraction.denominator) && fraction.denominator !== 0) {
        return fraction.numerator / fraction.denominator;
    }

    // Strict numeric parse (allow only full numeric literals).
    const normalized = raw.replace(/[，,]/g, '').replace(/−/g, '-');
    if (/^-?(?:\d+|\d*\.\d+)$/.test(normalized)) {
        const numeric = Number(normalized);
        if (Number.isFinite(numeric)) return numeric;
    }

    // Fallback: allow quantity strings that accidentally include trailing unit text (e.g. "120g", "30ml").
    const withUnitSuffix = normalized.match(/^(-?(?:\d+|\d*\.\d+))\s*[^\d].*$/);
    if (withUnitSuffix) {
        const parsedWithSuffix = Number(withUnitSuffix[1]);
        if (Number.isFinite(parsedWithSuffix)) return parsedWithSuffix;
    }

    return NaN;
};

const parseYieldRateInput = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return 1;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    // Allow both ratio input (0.6) and percentage input (60 => 0.6)
    if (n > 1) return n / 100;
    return n;
};

const scaleQuantityText = (qty, mult) => {
    if (qty === null || qty === undefined || qty === '') return '';

    const rawQty = String(qty).trim();
    const multNum = Number(mult);
    if (!Number.isFinite(multNum) || Math.abs(multNum - 1) < 0.0000001) {
        return rawQty;
    }

    const parsedFraction = parseFractionInput(rawQty);
    if (parsedFraction && Number.isInteger(multNum)) {
        const scaledNumerator = parsedFraction.numerator * multNum;
        const common = gcd(scaledNumerator, parsedFraction.denominator);
        return formatFraction(scaledNumerator / common, parsedFraction.denominator / common);
    }

    const num = Number(rawQty);
    if (!Number.isFinite(num)) return rawQty;
    return formatScaledQuantity(num * multNum);
};

const normalizeDiffText = (value) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDiffKey = (value) => normalizeDiffText(value).toLowerCase();

const formatDiffAmount = (quantity, unit) => {
    const safeQuantity = normalizeDiffText(quantity);
    const safeUnit = normalizeDiffText(unit);
    return [safeQuantity, safeUnit].filter(Boolean).join('');
};

const isSameMeasuredAmount = (left, right) => {
    const leftQuantity = parseQuantityValue(left?.quantity);
    const rightQuantity = parseQuantityValue(right?.quantity);
    const leftUnit = normalizeUnit(left?.unit);
    const rightUnit = normalizeUnit(right?.unit);

    if (Number.isFinite(leftQuantity) && Number.isFinite(rightQuantity) && leftUnit && rightUnit) {
        return leftUnit === rightUnit && Math.abs(leftQuantity - rightQuantity) < 0.0001;
    }

    return formatDiffAmount(left?.quantity, left?.unit) === formatDiffAmount(right?.quantity, right?.unit);
};

const buildAiProposalDiff = (originalRecipe, proposal) => {
    const originalIngredients = Array.isArray(originalRecipe?.ingredients) ? originalRecipe.ingredients : [];
    const proposalIngredients = Array.isArray(proposal?.ingredients) ? proposal.ingredients : [];
    const originalSteps = Array.isArray(originalRecipe?.steps) ? originalRecipe.steps : [];
    const proposalSteps = Array.isArray(proposal?.steps) ? proposal.steps : [];

    const originalIngredientBuckets = new Map();
    originalIngredients.forEach((item, index) => {
        const key = normalizeDiffKey(item?.name);
        if (!key) return;
        const list = originalIngredientBuckets.get(key) || [];
        list.push({ item, index });
        originalIngredientBuckets.set(key, list);
    });

    const usedOriginalIngredientIndexes = new Set();
    const ingredientRows = proposalIngredients.map((item, index) => {
        const key = normalizeDiffKey(item?.name);
        const sameNameCandidates = key ? (originalIngredientBuckets.get(key) || []) : [];
        let matched = sameNameCandidates.find((candidate) => !usedOriginalIngredientIndexes.has(candidate.index)) || null;

        if (!matched && originalIngredients[index] && !usedOriginalIngredientIndexes.has(index)) {
            matched = { item: originalIngredients[index], index };
        }

        if (matched) {
            usedOriginalIngredientIndexes.add(matched.index);
        }

        const previousItem = matched?.item || null;
        const amountChanged = previousItem ? !isSameMeasuredAmount(previousItem, item) : false;
        const noteChanged = previousItem
            ? normalizeDiffText(previousItem?.note) !== normalizeDiffText(item?.note)
            : false;
        const nameChanged = previousItem
            ? normalizeDiffKey(previousItem?.name) !== normalizeDiffKey(item?.name)
            : false;

        return {
            item,
            index,
            status: previousItem
                ? ((amountChanged || noteChanged || nameChanged) ? 'changed' : 'unchanged')
                : 'added',
            previousItem,
            amountChanged,
            noteChanged,
            nameChanged,
            previousAmountLabel: previousItem ? formatDiffAmount(previousItem?.quantity, previousItem?.unit) : '',
            nextAmountLabel: formatDiffAmount(item?.quantity, item?.unit),
        };
    });

    const removedIngredients = originalIngredients
        .map((item, index) => ({ item, index }))
        .filter(({ index }) => !usedOriginalIngredientIndexes.has(index));

    const stepChanges = [];
    const maxStepLength = Math.max(originalSteps.length, proposalSteps.length);
    for (let index = 0; index < maxStepLength; index += 1) {
        const originalStep = originalSteps[index];
        const proposalStep = proposalSteps[index];
        const previousText = normalizeDiffText(typeof originalStep === 'string' ? originalStep : originalStep?.text);
        const nextText = normalizeDiffText(typeof proposalStep === 'string' ? proposalStep : proposalStep?.text);
        const previousNote = normalizeDiffText(originalStep?.note);
        const nextNote = normalizeDiffText(proposalStep?.note);

        if (previousText && nextText) {
            if (previousText !== nextText || previousNote !== nextNote) {
                stepChanges.push({
                    type: 'changed',
                    index,
                    previousText,
                    nextText,
                    previousNote,
                    nextNote,
                });
            }
            continue;
        }

        if (!previousText && nextText) {
            stepChanges.push({
                type: 'added',
                index,
                nextText,
                nextNote,
            });
            continue;
        }

        if (previousText && !nextText) {
            stepChanges.push({
                type: 'removed',
                index,
                previousText,
                previousNote,
            });
        }
    }

    const previousTitle = normalizeDiffText(originalRecipe?.title);
    const nextTitle = normalizeDiffText(proposal?.title);
    const titleChanged = Boolean(previousTitle && nextTitle && previousTitle !== nextTitle);

    return {
        ingredientRows,
        ingredientChanges: ingredientRows.filter((row) => row.status === 'changed'),
        addedIngredients: ingredientRows.filter((row) => row.status === 'added'),
        removedIngredients,
        stepChanges,
        titleChanged,
        previousTitle,
        nextTitle,
        hasAnyChanges: ingredientRows.some((row) => row.status !== 'unchanged') || removedIngredients.length > 0 || stepChanges.length > 0 || titleChanged,
    };
};

const INLINE_DIFF_MAX_LENGTH = 400;

// 変更前後の文を文字単位LCSで比較し、削除/追加/共通のセグメント列を返す。
// 長文や全面的な書き換えで意味のある差分にならない場合は null（全文並記にフォールバック）
const buildInlineTextDiff = (previousText, nextText) => {
    const prev = Array.from(previousText || '');
    const next = Array.from(nextText || '');
    if (!prev.length || !next.length) return null;
    if (prev.length > INLINE_DIFF_MAX_LENGTH || next.length > INLINE_DIFF_MAX_LENGTH) return null;

    const cols = next.length + 1;
    const dp = new Uint16Array((prev.length + 1) * cols);
    for (let i = prev.length - 1; i >= 0; i -= 1) {
        for (let j = next.length - 1; j >= 0; j -= 1) {
            dp[i * cols + j] = prev[i] === next[j]
                ? dp[(i + 1) * cols + j + 1] + 1
                : Math.max(dp[(i + 1) * cols + j], dp[i * cols + j + 1]);
        }
    }

    const segments = [];
    const pushSegment = (type, text) => {
        if (!text) return;
        const last = segments[segments.length - 1];
        if (last && last.type === type) {
            last.text += text;
        } else {
            segments.push({ type, text });
        }
    };

    let i = 0;
    let j = 0;
    while (i < prev.length && j < next.length) {
        if (prev[i] === next[j]) {
            pushSegment('same', prev[i]);
            i += 1;
            j += 1;
        } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
            pushSegment('removed', prev[i]);
            i += 1;
        } else {
            pushSegment('added', next[j]);
            j += 1;
        }
    }
    pushSegment('removed', prev.slice(i).join(''));
    pushSegment('added', next.slice(j).join(''));

    // 変更部に挟まれた短い共通部分（助詞・句読点など）は前後の変更に取り込み、差分の細切れを防ぐ
    const folded = segments.map((segment, index) => {
        const before = segments[index - 1];
        const after = segments[index + 1];
        if (
            segment.type === 'same'
            && Array.from(segment.text).length <= 2
            && before && before.type !== 'same'
            && after && after.type !== 'same'
        ) {
            return [{ type: 'removed', text: segment.text }, { type: 'added', text: segment.text }];
        }
        return [segment];
    }).flat();

    // 連続する変更ブロック内は「削除→追加」の順に並べ直す
    const normalized = [];
    let pendingRemoved = '';
    let pendingAdded = '';
    const flushPending = () => {
        if (pendingRemoved) normalized.push({ type: 'removed', text: pendingRemoved });
        if (pendingAdded) normalized.push({ type: 'added', text: pendingAdded });
        pendingRemoved = '';
        pendingAdded = '';
    };
    folded.forEach((segment) => {
        if (segment.type === 'same') {
            flushPending();
            const last = normalized[normalized.length - 1];
            if (last && last.type === 'same') {
                last.text += segment.text;
            } else {
                normalized.push({ ...segment });
            }
        } else if (segment.type === 'removed') {
            pendingRemoved += segment.text;
        } else {
            pendingAdded += segment.text;
        }
    });
    flushPending();

    if (!normalized.some((segment) => segment.type !== 'same')) return null;

    // 共通部分が3割未満なら全文書き換えとみなしハイライトしない
    const sameLength = normalized
        .filter((segment) => segment.type === 'same')
        .reduce((total, segment) => total + Array.from(segment.text).length, 0);
    if (sameLength < Math.min(prev.length, next.length) * 0.3) return null;

    return normalized;
};

// 変更前・変更後を1行ずつに分けて表示する（削除部分は変更前の行で赤、追加部分は変更後の行で緑）
const DiffTextPair = ({ previousText, nextText }) => {
    const segments = React.useMemo(
        () => buildInlineTextDiff(previousText, nextText),
        [previousText, nextText]
    );
    // 全文書き換え（差分が取れない）場合は行全体をハイライトする
    const oldSegments = segments
        ? segments.filter((segment) => segment.type !== 'added')
        : [{ type: 'removed', text: previousText }];
    const newSegments = segments
        ? segments.filter((segment) => segment.type !== 'removed')
        : [{ type: 'added', text: nextText }];
    return (
        <span className="recipe-ai-diff-pair">
            <span className="recipe-ai-diff-pair__line">
                <span className="recipe-ai-diff-pair__label recipe-ai-diff-pair__label--old">変更前</span>
                <span className="recipe-ai-diff-pair__text">
                    {oldSegments.map((segment, index) => (
                        segment.type === 'removed'
                            ? <del key={`old-${index}`}>{segment.text}</del>
                            : <React.Fragment key={`old-${index}`}>{segment.text}</React.Fragment>
                    ))}
                </span>
            </span>
            <span className="recipe-ai-diff-pair__line">
                <span className="recipe-ai-diff-pair__label recipe-ai-diff-pair__label--new">変更後</span>
                <span className="recipe-ai-diff-pair__text">
                    {newSegments.map((segment, index) => (
                        segment.type === 'added'
                            ? <ins key={`new-${index}`}>{segment.text}</ins>
                            : <React.Fragment key={`new-${index}`}>{segment.text}</React.Fragment>
                    ))}
                </span>
            </span>
        </span>
    );
};

// 追加・削除された手順を1行で表示する
const DiffTextSingle = ({ type, text }) => (
    <span className="recipe-ai-diff-pair">
        <span className="recipe-ai-diff-pair__line">
            <span className={`recipe-ai-diff-pair__label recipe-ai-diff-pair__label--${type === 'added' ? 'new' : 'old'}`}>
                {type === 'added' ? '追加' : '削除'}
            </span>
            <span className="recipe-ai-diff-pair__text">
                {type === 'added' ? <ins>{text}</ins> : <del>{text}</del>}
            </span>
        </span>
    </span>
);

export const RecipeDetail = ({
    recipe,
    ownerLabel,
    onBack,
    onEdit,
    onDelete,
    onHardDelete,
    isDeleted,
    onView,
    onDuplicate,
    onOpenCompositeCost,
    backLabel,
    onList,
    forceEditEnabled = false,
    isFavorite = false,
    onToggleFavorite = null,
    onAiRecipeSaved = null,
}) => {
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
    const [isOverrideCostInputDirty, setIsOverrideCostInputDirty] = React.useState(false);
    const [isSavingCategoryOverride, setIsSavingCategoryOverride] = React.useState(false);
    const [groupUsageUnit, setGroupUsageUnit] = React.useState('g');
    const [groupTotalBatchAmount, setGroupTotalBatchAmount] = React.useState('');
    const [groupUsageAmount, setGroupUsageAmount] = React.useState('');
    const [groupUsageAmountByCategory, setGroupUsageAmountByCategory] = React.useState(new Map());
    const [conversionMap, setConversionMap] = React.useState(new Map());
    const [uiTextCache, setUiTextCache] = React.useState({});
    const [isAiModalOpen, setIsAiModalOpen] = React.useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = React.useState(false);
    const [aiProvider, setAiProvider] = React.useState('groq');
    const [sakanaUnlocked, setSakanaUnlocked] = React.useState(() => isSakanaUnlocked());

    const ensureSakanaUnlockedForProvider = (provider) => {
        if (!String(provider || '').startsWith('sakana') || sakanaUnlocked) return true;
        const input = window.prompt('Sakana AIはロックされています。解除パスワードを入力してください。');
        if (input === null) return false;
        if (!unlockSakana(input)) {
            toast.error('パスワードが違います。');
            return false;
        }
        setSakanaUnlocked(true);
        toast.success('Sakana AIのロックを解除しました。');
        return true;
    };

    const handleAiProviderChange = (value) => {
        if (!ensureSakanaUnlockedForProvider(value)) {
            return;
        }
        setAiProvider(value);
    };
    const [aiNotes, setAiNotes] = React.useState('');
    const [aiIntake, setAiIntake] = React.useState(null);
    const [aiProposal, setAiProposal] = React.useState(null);
    const [aiError, setAiError] = React.useState('');
    const [isAiGenerating, setIsAiGenerating] = React.useState(false);
    const [isAiPreparingQuestions, setIsAiPreparingQuestions] = React.useState(false);
    const [isSavingAiProposal, setIsSavingAiProposal] = React.useState(false);
    const [aiConversation, setAiConversation] = React.useState([]);
    const [aiConversationInput, setAiConversationInput] = React.useState('');
    const [isAiConversing, setIsAiConversing] = React.useState(false);
    const [aiProgressMode, setAiProgressMode] = React.useState(null);
    const [aiProgressStepIndex, setAiProgressStepIndex] = React.useState(0);
    const aiProgressConfig = React.useMemo(
        () => (aiProgressMode ? getRecipeAiProgressConfig(aiProgressMode) : null),
        [aiProgressMode]
    );
    const isAiProgressOpen = Boolean(aiProgressConfig) && (isAiGenerating || isAiConversing);
    const currentProgressStep = aiProgressConfig?.steps?.[aiProgressStepIndex];
    const isFinalIntegrating = isAiProgressOpen && Boolean(currentProgressStep?.provider?.includes('OpenAI'));

    // Scaling State
    const [baseItem, setBaseItem] = React.useState('total'); // 'total', 'flourTotal', 'flour-0', 'other-1', etc.
    const [targetTotal, setTargetTotal] = React.useState(''); // For Bread (actually represents targetBaseAmount now)
    const [multiplier, setMultiplier] = React.useState(1);    // For Normal
    const [normalBaseItem, setNormalBaseItem] = React.useState('multiplier'); // 'multiplier', 'ing-0', 'ing-groupId-0', etc.
    const [normalBaseTarget, setNormalBaseTarget] = React.useState(''); // For Normal base item target qty

    // Profit Calculator State
    const [salesPrice, setSalesPrice] = React.useState('');
    const [calcServings, setCalcServings] = React.useState('');
    const [calcUsageGrams, setCalcUsageGrams] = React.useState('');
    const [calcYieldRate, setCalcYieldRate] = React.useState('1');
    const [isSavingRecipeYieldRate, setIsSavingRecipeYieldRate] = React.useState(false);

    // Helper for Normal Recipe Scaling
    const getScaledQty = (qty, mult) => {
        return scaleQuantityText(qty, mult);
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
    const aiProposalDiff = React.useMemo(
        () => buildAiProposalDiff(sourceRecipe, aiProposal),
        [sourceRecipe, aiProposal]
    );
    const stepChangeTypeByIndex = React.useMemo(() => {
        const map = new Map();
        aiProposalDiff.stepChanges.forEach((change) => map.set(change.index, change.type));
        return map;
    }, [aiProposalDiff]);

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

    React.useEffect(() => {
        if (!isAiProgressOpen || !aiProgressConfig) return undefined;
        setAiProgressStepIndex(0);
        const intervalId = window.setInterval(() => {
            setAiProgressStepIndex((current) => Math.min(current + 1, aiProgressConfig.steps.length - 1));
        }, 2200);
        return () => window.clearInterval(intervalId);
    }, [isAiProgressOpen, aiProgressConfig]);

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
        const idScope = getUsageScopeKey(recipe.id, null);
        const titleScope = getUsageScopeKey(null, recipe?.title);
        setGroupUsageAmountByCategory(
            mergeUsageMaps(loadUsageAmountMap(idScope), loadUsageAmountMap(titleScope))
        );

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
        (recipe.tags && recipe.tags.includes(`owner:${user?.id}`)) ||
        (user?.displayId && recipe.tags && recipe.tags.includes(`owner:${user.displayId}`));
    // If no owner tag, assume public/legacy, but for safety treat as owner if no tag present? 
    // Actually, logic in service says "No owner tag -> Visible". So let's say "Can Edit" if (No Owner OR Owner is Me OR Admin).
    const hasOwnerTag = recipe.tags && recipe.tags.some(t => t.startsWith('owner:'));
    const canEdit = !hasOwnerTag || isOwner;
    const canOverwriteWithAi = canEdit || forceEditEnabled || user?.role === 'admin';

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

    const handleAiIntakeAnswerChange = (questionId, answer) => {
        setAiIntake((current) => {
            if (!current) return current;
            return {
                ...current,
                questions: (current.questions || []).map((question) => (
                    question.id === questionId
                        ? { ...question, answer }
                        : question
                )),
            };
        });
    };

    const handleFillIntakeWithOmasake = (questionId) => {
        setAiIntake((current) => {
            if (!current?.questions) return current;
            return {
                ...current,
                questions: current.questions.map((q) => {
                    if (q.id !== questionId) return q;
                    let answer = '';
                    if (q.options?.length > 0) {
                        const omasakeOpt = q.options.find(o => o.includes('おまかせ') || o.includes('推奨') || o.includes('AI'));
                        answer = omasakeOpt || q.options[0];
                    } else {
                        answer = 'AIにおまかせ';
                    }
                    return { ...q, answer };
                }),
            };
        });
    };

    const handleFillAllAiIntakeWithOmasake = () => {
        setAiIntake((current) => {
            if (!current?.questions) return current;
            return {
                ...current,
                questions: current.questions.map((q) => {
                    let answer = '';
                    if (q.options?.length > 0) {
                        const omasakeOpt = q.options.find(o => o.includes('おまかせ') || o.includes('推奨') || o.includes('AI'));
                        answer = omasakeOpt || q.options[0];
                    } else {
                        answer = 'AIにおまかせ';
                    }
                    return { ...q, answer };
                }),
            };
        });
    };

    const loadAiImprovementIntake = async () => {
        if (!ensureSakanaUnlockedForProvider(aiProvider)) {
            return null;
        }
        let recipeForAi = sourceRecipe || recipe;
        const hasLoadedContent = Array.isArray(recipeForAi?.steps) && Array.isArray(recipeForAi?.ingredients);
        if (!hasLoadedContent && recipe?.id) {
            recipeForAi = await recipeService.getRecipe(recipe.id);
            setFullRecipe(recipeForAi);
        }

        setIsAiPreparingQuestions(true);
        setAiError('');
        try {
            const intake = await generateRecipeAiIntake({
                mode: 'improvement',
                recipe: recipeForAi,
                notes: aiNotes,
                provider: aiProvider,
            });
            setAiIntake(intake);
            toast.success('方向性の確認項目を作成しました。回答後に改善を開始してください。');
            return { intake, recipeForAi };
        } catch (error) {
            console.error('[RecipeDetail] AI intake generation failed:', error);
            setAiError(error?.message || '確認項目の作成に失敗しました。');
            return null;
        } finally {
            setIsAiPreparingQuestions(false);
        }
    };

    const handleGenerateAiImprovement = async () => {
        if (!ensureSakanaUnlockedForProvider(aiProvider)) {
            return;
        }
        let recipeForAi = sourceRecipe || recipe;
        const hasLoadedContent = Array.isArray(recipeForAi?.steps) && Array.isArray(recipeForAi?.ingredients);
        if (!hasLoadedContent && recipe?.id) {
            recipeForAi = await recipeService.getRecipe(recipe.id);
            setFullRecipe(recipeForAi);
        }
        if (!aiIntake?.questions?.length) {
            await loadAiImprovementIntake();
            return;
        }
        if ((aiIntake.questions || []).some((questionItem) => questionItem?.required !== false && !String(questionItem?.answer || '').trim())) {
            setAiError('AIの確認項目に回答してから改善を開始してください。');
            return;
        }

        setAiProgressMode('improvement-generate');
        setAiProgressStepIndex(0);
        setIsAiGenerating(true);
        setAiError('');
        try {
            const proposal = await generateRecipeImprovement({
                recipe: recipeForAi,
                notes: aiNotes,
                provider: aiProvider,
                directionContext: serializeRecipeAiDirectionContext(aiIntake),
            });
            setAiProposal(proposal);
            setAiConversation([]);
            setAiConversationInput('');
            toast.success('AI改善案を作成しました。');
        } catch (error) {
            console.error('[RecipeDetail] AI improvement failed:', error);
            setAiError(error?.message || 'AI改善案の作成に失敗しました。');
        } finally {
            setIsAiGenerating(false);
            setAiProgressMode(null);
            setAiProgressStepIndex(0);
        }
    };

    const handleAskAiFollowUp = async () => {
        const question = aiConversationInput.trim();
        if (!question) {
            setAiError('質問内容を入力してください。');
            return;
        }
        if (!aiProposal) {
            setAiError('先にAI改善案を作成してください。');
            return;
        }
        if (!ensureSakanaUnlockedForProvider(aiProvider)) {
            return;
        }

        // Q&Aのみのチャットでは、進捗ダイアログ（Modal）は表示しない
        setIsAiConversing(true);
        setAiError('');
        const userMessage = { role: 'user', content: question };
        const nextConversation = [...aiConversation, userMessage];
        setAiConversation(nextConversation);
        setAiConversationInput('');

        try {
            let recipeForAi = sourceRecipe || recipe;
            const hasLoadedContent = Array.isArray(recipeForAi?.steps) && Array.isArray(recipeForAi?.ingredients);
            if (!hasLoadedContent && recipe?.id) {
                recipeForAi = await recipeService.getRecipe(recipe.id);
                setFullRecipe(recipeForAi);
            }

            const answer = await askRecipeAiQuestion({
                recipe: recipeForAi,
                proposal: aiProposal,
                conversation: nextConversation,
                question,
                provider: aiProvider,
                mode: 'improvement',
            });

            setAiConversation([
                ...nextConversation,
                { role: 'assistant', content: answer },
            ]);
            toast.success('AIが質問に回答しました。');
        } catch (error) {
            console.error('[RecipeDetail] AI Q&A failed:', error);
            setAiError(error?.message || 'AI回答の生成に失敗しました。');
            setAiConversation(nextConversation);
        } finally {
            setIsAiConversing(false);
        }
    };

    const handleApplyConversationToProposal = async () => {
        if (!aiProposal) return;
        if (aiConversation.length === 0) {
            setAiError('先にAIと会話で相談を行ってください。');
            return;
        }

        // 改善案再作成の時は、進捗ダイアログ（Modal）を表示する
        setAiProgressMode('improvement-conversation');
        setAiProgressStepIndex(0);
        setIsAiGenerating(true);
        setAiError('');

        try {
            let recipeForAi = sourceRecipe || recipe;
            const hasLoadedContent = Array.isArray(recipeForAi?.steps) && Array.isArray(recipeForAi?.ingredients);
            if (!hasLoadedContent && recipe?.id) {
                recipeForAi = await recipeService.getRecipe(recipe.id);
                setFullRecipe(recipeForAi);
            }

            const lastUserQuestion = [...aiConversation].reverse().find(m => m.role === 'user')?.content || 'これまでの会話内容を踏まえて改善案を再作成してください。';

            const response = await continueRecipeAiConversation({
                recipe: recipeForAi,
                proposal: aiProposal,
                conversation: aiConversation,
                question: lastUserQuestion,
                provider: aiProvider,
                mode: 'improvement',
                directionContext: serializeRecipeAiDirectionContext(aiIntake),
            });

            setAiProposal(response.proposal);
            setAiConversation([
                ...aiConversation,
                { role: 'assistant', content: 'これまでの相談内容を反映して、新しい改善案のレシピを作成しました！' },
            ]);
            toast.success('新しい改善案レシピを作成しました。');
        } catch (error) {
            console.error('[RecipeDetail] Apply conversation failed:', error);
            setAiError(error?.message || '改善案の更新に失敗しました。');
        } finally {
            setIsAiGenerating(false);
            setAiProgressMode(null);
            setAiProgressStepIndex(0);
        }
    };

    const saveAiProposal = async ({ asNew }) => {
        if (!aiProposal) return;
        if (!asNew && !canOverwriteWithAi) {
            toast.warning('このレシピは上書きできません。別レシピとして保存してください。');
            return;
        }

        setIsSavingAiProposal(true);
        setAiError('');
        try {
            const originalRecipe = sourceRecipe || recipe;
            const shouldReplaceViaTrash = !asNew;
            const payload = buildRecipePayloadFromAiProposal(originalRecipe, aiProposal, { asNew: true });
            const savedRecipe = await recipeService.createRecipe(payload, user);
            let replacedOriginal = false;
            let trashMoveError = null;
            if (shouldReplaceViaTrash) {
                try {
                    await recipeService.deleteRecipe(originalRecipe.id);
                    replacedOriginal = true;
                } catch (error) {
                    trashMoveError = error;
                    console.error('[RecipeDetail] Original recipe trash move failed after AI replacement save:', error);
                }
            }
            setFullRecipe(savedRecipe);
            await recordRecipeAiAdoption({
                modeFamily: 'improvement',
                proposal: aiProposal,
                finalRecipe: savedRecipe,
                baseRecipe: originalRecipe,
                sourceRunId: aiProposal?.learningMeta?.runId || null,
                adoptionType: asNew ? 'accepted_proposal' : (replacedOriginal ? 'replaced_original_via_trash' : 'accepted_proposal'),
                feedbackNote: asNew
                    ? 'AI改善案を別レシピとして保存'
                    : (replacedOriginal
                        ? 'AI改善案で既存レシピを置き換え。元レシピはゴミ箱へ移動'
                        : 'AI改善案を新規保存。元レシピのゴミ箱移動は失敗したため元レシピも残存'),
                question: [...aiConversation].reverse().find((item) => item?.role === 'user')?.content || '',
                answer: [...aiConversation].reverse().find((item) => item?.role === 'assistant')?.content || '',
                metadata: {
                    asNew,
                    replacedOriginal,
                    originalRecipeId: originalRecipe?.id || null,
                    trashMoveFailed: Boolean(trashMoveError),
                    conversation: aiConversation.slice(-12),
                },
            });
            onAiRecipeSaved?.(savedRecipe, {
                asNew: asNew || !replacedOriginal,
                replacedOriginal,
                originalRecipeId: originalRecipe?.id || null,
            });
            if (asNew) {
                toast.success('AI改善案を別レシピとして保存しました。');
            } else if (replacedOriginal) {
                toast.success('AI改善案で新規登録し、元レシピはゴミ箱へ移動しました。');
            } else {
                toast.warning('AI改善案は新規保存しましたが、元レシピのゴミ箱移動に失敗したため元レシピも残っています。');
                setAiError('AI改善案は保存済みです。元レシピのゴミ箱移動だけ失敗したため、必要なら元レシピを通常の削除でゴミ箱へ移してください。');
            }
        } catch (error) {
            console.error('[RecipeDetail] AI proposal save failed:', error);
            setAiError(error?.message || 'AI改善案の保存に失敗しました。');
        } finally {
            setIsSavingAiProposal(false);
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
        setCalcUsageGrams('');
        const recipeYieldRate = Number(sourceRecipe?.yieldRate ?? recipe?.yieldRate);
        setCalcYieldRate(
            Number.isFinite(recipeYieldRate) && recipeYieldRate > 0
                ? String(recipeYieldRate)
                : '1'
        );
    }, [recipe, sourceRecipe?.yieldRate]);

    const handleSaveRecipeYieldRate = React.useCallback(async () => {
        if (!recipe?.id) return;
        const yieldRate = parseYieldRateInput(calcYieldRate);
        if (!Number.isFinite(yieldRate) || yieldRate <= 0) {
            toast.warning('歩留まりは 0 より大きい数値で入力してください。');
            return;
        }
        try {
            setIsSavingRecipeYieldRate(true);
            const nextRecipe = { ...(sourceRecipe || recipe), yieldRate };
            await recipeService.updateRecipe(nextRecipe);
            setFullRecipe((prev) => prev ? { ...prev, yieldRate } : prev);
            toast.success('歩留まりを保存しました。');
        } catch (e) {
            toast.error(`歩留まりの保存に失敗しました: ${e?.message || 'unknown error'}`);
        } finally {
            setIsSavingRecipeYieldRate(false);
        }
    }, [recipe, sourceRecipe, calcYieldRate, toast]);

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
    const renderProfitCalculator = (totalCostTaxIncluded, totalWeightGramsForUsage = null) => {
        // totalCostTaxIncluded is already tax included
        const costNum = Math.round(parseFloat(totalCostTaxIncluded));
        const priceNum = parseFloat(salesPrice);
        const servingsNum = parseFloat(calcServings);
        const usageGramsNum = parseFloat(calcUsageGrams);
        const totalWeightNum = parseFloat(totalWeightGramsForUsage);
        const yieldRate = parseYieldRateInput(calcYieldRate);
        const adjustedBatchWeight = Number.isFinite(totalWeightNum) && Number.isFinite(yieldRate)
            ? totalWeightNum * yieldRate
            : NaN;

        let costRate = null;
        let totalSales = null;
        let unitCost = null;
        let costPerGram = null;
        let usageCost = null;
        let usageCostRate = null;

        if (!isNaN(costNum) && !isNaN(servingsNum) && servingsNum > 0) {
            unitCost = costNum / servingsNum;
        }

        if (!isNaN(costNum) && !isNaN(priceNum) && !isNaN(servingsNum) && priceNum > 0 && servingsNum > 0) {
            totalSales = priceNum * servingsNum;
            costRate = (costNum / totalSales) * 100;
        }

        if (!isNaN(costNum) && Number.isFinite(adjustedBatchWeight) && adjustedBatchWeight > 0) {
            costPerGram = costNum / adjustedBatchWeight;
        }
        if (costPerGram !== null && !isNaN(usageGramsNum) && usageGramsNum >= 0) {
            usageCost = costPerGram * usageGramsNum;
            if (!isNaN(priceNum) && priceNum > 0) {
                usageCostRate = (usageCost / priceNum) * 100;
            }
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>使用量 (g)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={calcUsageGrams}
                            onChange={(e) => setCalcUsageGrams(e.target.value)}
                            placeholder="例: 30"
                            style={{
                                padding: '6px',
                                width: '90px',
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
                            padding: '10px 14px',
                            background: usageCostRate !== null
                                ? (usageCostRate > 40 ? '#ffebee' : '#e8f5e9')
                                : (costRate !== null ? (costRate > 40 ? '#ffebee' : '#e8f5e9') : '#eef3ff'),
                            borderRadius: '8px',
                            border: `1px solid ${usageCostRate !== null
                                ? (usageCostRate > 40 ? '#ffcdd2' : '#c8e6c9')
                                : (costRate !== null ? (costRate > 40 ? '#ffcdd2' : '#c8e6c9') : '#d6e3ff')}`,
                            textAlign: 'right'
                        }}>
                            {usageCostRate !== null && (
                                <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px dashed rgba(0,0,0,0.15)' }}>
                                    <div style={{ fontSize: '0.82rem', color: '#555' }}>
                                        最重要: 使用量ベース原価率
                                    </div>
                                    <div style={{ fontSize: '1.55rem', fontWeight: 800, lineHeight: 1.1, color: usageCostRate > 40 ? '#c62828' : '#1b5e20' }}>
                                        {usageCostRate.toFixed(1)}%
                                    </div>
                                    {usageCost !== null && (
                                        <div style={{ fontSize: '0.88rem', color: '#475569', marginTop: '6px' }}>
                                            {calcUsageGrams || '入力'}g 使用時の原価(税込): <strong>¥{usageCost.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: costRate !== null ? '6px' : '0' }}>
                                1個あたり原価(税込): <strong>¥{unitCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                            </div>
                            {Number.isFinite(adjustedBatchWeight) && adjustedBatchWeight > 0 && (
                                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>
                                    出来上がり量(歩留まり反映): {formatCompactNumber(adjustedBatchWeight, { maximumFractionDigits: 1 })} g
                                </div>
                            )}
                            {costRate !== null && (
                                <>
                                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>
                                        予想売上: ¥{totalSales.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>
                                        粗利益: ¥{(totalSales - costNum).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: costRate > 40 ? '#d32f2f' : '#2e7d32' }}>
                                        全体原価率: {costRate.toFixed(1)}%
                                    </div>
                                </>
                            )}
                            {usageCost !== null && usageCostRate === null && (
                                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '6px' }}>
                                    {calcUsageGrams || '入力'}g 使用時の原価(税込): <strong>¥{usageCost.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {!(Number.isFinite(totalWeightNum) && totalWeightNum > 0) && (
                    <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#64748b' }}>
                        使用量シミュレーションは重量(g)が集計できる材料がある場合に有効です。
                    </div>
                )}
                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#64748b' }}>
                    歩留まりは 0.6（60%）または 60（%）で入力できます。例: 100g × 0.6 = 60g
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
            return scaleQuantityText(qty, target ? scaleFactor : 1);
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

    const normalOverrideUsageTotal = React.useMemo(() => {
        if (displayRecipe.type === 'bread') return null;
        if (costReferenceMode !== 'override') return null;

        const rawGroups = Array.isArray(displayRecipe.ingredientGroups) ? displayRecipe.ingredientGroups : [];
        const skipNames = ['作り方', 'Steps', 'Method', '手順'].map((name) => String(name || '').trim().toLowerCase());
        const skipGroupIds = new Set(
            rawGroups
                .filter((group) => skipNames.includes(String(group?.name || '').trim().toLowerCase()))
                .map((group) => group.id)
        );
        const groups = rawGroups
            .filter((group) => !skipGroupIds.has(group.id))
            .map((group) => ({
                id: group.id,
                items: ingredients.filter((ing) => ing?.groupId === group.id),
            }))
            .filter((section) => section.items.length > 0);
        const effectiveGroups = groups.length > 0
            ? groups
            : [{ id: 'all', items: ingredients.filter((ing) => !skipGroupIds.has(ing?.groupId)) }];

        let sum = 0;
        let includedCount = 0;
        effectiveGroups.forEach((group) => {
            const groupId = String(group?.id ?? 'all');
            const groupKey = groupId === 'all' ? 'group:all' : `group:${groupId}`;
            const groupItems = Array.isArray(group?.items) ? group.items : [];
            const overrideBase = toFiniteNumber(categoryCostOverrides.get(groupKey));
            if (!Number.isFinite(overrideBase)) return;

            const groupSetCost = overrideBase * normalEffectiveMultiplier;
            const groupSummary = summarizeIngredientGroup(groupItems, {
                multiplier: normalEffectiveMultiplier,
                totalRecipeCostTaxIncluded: normalPrintTotal,
            });
            const groupSetAmountLikeGrams = groupSummary.totalWeightGrams + groupSummary.totalVolumeMl;
            if (!Number.isFinite(groupSetAmountLikeGrams) || groupSetAmountLikeGrams <= 0) return;

            const savedUsageAmountRaw =
                groupUsageAmountByCategory.get(groupKey)
                ?? loadUsageAmountForGroup({
                    recipeId: recipe?.id,
                    recipeTitle: recipe?.title,
                    groupKey,
                });
            const savedUsageAmount = toFiniteNumber(savedUsageAmountRaw);
            if (!Number.isFinite(savedUsageAmount) || savedUsageAmount < 0) return;

            const usageCost = (groupSetCost / groupSetAmountLikeGrams) * savedUsageAmount;
            if (!Number.isFinite(usageCost)) return;

            sum += usageCost;
            includedCount += 1;
        });
        return includedCount > 0 ? sum : null;
    }, [
        displayRecipe.type,
        costReferenceMode,
        displayRecipe.ingredientGroups,
        ingredients,
        categoryCostOverrides,
        normalEffectiveMultiplier,
        normalPrintTotal,
        groupUsageAmountByCategory,
        recipe?.id,
        recipe?.title,
    ]);

    const normalCostTotalForDisplay = React.useMemo(() => {
        if (Number.isFinite(toFiniteNumber(normalOverrideUsageTotal))) {
            return normalOverrideUsageTotal;
        }
        return normalPrintTotal;
    }, [normalOverrideUsageTotal, normalPrintTotal]);

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

    const categoryUsageMultiplierMap = React.useMemo(() => {
        if (costReferenceMode !== 'override') return new Map();
        if (displayRecipe.type === 'bread') return new Map();

        const rawGroups = Array.isArray(displayRecipe.ingredientGroups) ? displayRecipe.ingredientGroups : [];
        const skipNames = ['作り方', 'Steps', 'Method', '手順'].map((name) => String(name || '').trim().toLowerCase());
        const skipGroupIds = new Set(
            rawGroups
                .filter((group) => skipNames.includes(String(group?.name || '').trim().toLowerCase()))
                .map((group) => group.id)
        );

        const groups = rawGroups
            .filter((group) => !skipGroupIds.has(group.id))
            .map((group) => ({
                key: `group:${String(group.id)}`,
                items: ingredients.filter((ing) => ing?.groupId === group.id),
            }))
            .filter((section) => section.items.length > 0);

        const effectiveGroups = groups.length > 0
            ? groups
            : [{ key: 'group:all', items: ingredients.filter((ing) => !skipGroupIds.has(ing?.groupId)) }];

        const map = new Map();
        effectiveGroups.forEach(({ key, items }) => {
            const hasOverride = Number.isFinite(toFiniteNumber(categoryCostOverrides.get(key)));
            if (!hasOverride) {
                map.set(key, 1);
                return;
            }
            const summary = summarizeIngredientGroup(items, {
                multiplier: normalEffectiveMultiplier,
                totalRecipeCostTaxIncluded: 0,
            });
            const setAmountLikeGrams = summary.totalWeightGrams + summary.totalVolumeMl;
            if (!Number.isFinite(setAmountLikeGrams) || setAmountLikeGrams <= 0) {
                map.set(key, 1);
                return;
            }
            const savedUsageAmountRaw =
                groupUsageAmountByCategory.get(key)
                ?? loadUsageAmountForGroup({
                    recipeId: recipe?.id,
                    recipeTitle: recipe?.title,
                    groupKey: key,
                });
            const savedUsageAmount = toFiniteNumber(savedUsageAmountRaw);
            if (!Number.isFinite(savedUsageAmount) || savedUsageAmount < 0) {
                map.set(key, 1);
                return;
            }
            map.set(key, savedUsageAmount / setAmountLikeGrams);
        });

        return map;
    }, [
        costReferenceMode,
        displayRecipe.type,
        displayRecipe.ingredientGroups,
        ingredients,
        categoryCostOverrides,
        normalEffectiveMultiplier,
        groupUsageAmountByCategory,
        recipe?.id,
        recipe?.title,
    ]);

    const getCategoryUsageMultiplier = React.useCallback((categoryKey) => {
        if (costReferenceMode !== 'override') return 1;
        const v = toFiniteNumber(categoryUsageMultiplierMap.get(categoryKey));
        if (!Number.isFinite(v) || v <= 0) return 1;
        return v;
    }, [costReferenceMode, categoryUsageMultiplierMap]);

    const normalQuantitySummary = React.useMemo(() => {
        if (displayRecipe.type === 'bread') return null;
        if (costReferenceMode === 'override') {
            const rawGroups = Array.isArray(displayRecipe.ingredientGroups) ? displayRecipe.ingredientGroups : [];
            const skipNames = ['作り方', 'Steps', 'Method', '手順'].map((name) => String(name || '').trim().toLowerCase());
            const skipGroupIds = new Set(
                rawGroups
                    .filter((group) => skipNames.includes(String(group?.name || '').trim().toLowerCase()))
                    .map((group) => group.id)
            );
            const grouped = rawGroups
                .filter((group) => !skipGroupIds.has(group.id))
                .map((group) => ({
                    key: `group:${String(group.id)}`,
                    items: ingredients.filter((ing) => ing?.groupId === group.id),
                }))
                .filter((section) => section.items.length > 0);
            const sections = grouped.length > 0
                ? grouped
                : [{ key: 'group:all', items: ingredients.filter((ing) => !skipGroupIds.has(ing?.groupId)) }];

            let totalWeightGrams = 0;
            let totalVolumeMl = 0;
            sections.forEach(({ key, items }) => {
                const sectionSummary = summarizeIngredientGroup(items, {
                    multiplier: normalEffectiveMultiplier * getCategoryUsageMultiplier(key),
                    totalRecipeCostTaxIncluded: 0,
                });
                totalWeightGrams += sectionSummary.totalWeightGrams;
                totalVolumeMl += sectionSummary.totalVolumeMl;
            });
            return {
                totalWeightGrams,
                totalVolumeMl,
                hasWeightBasis: totalWeightGrams > 0,
                hasVolumeBasis: totalVolumeMl > 0,
            };
        }
        return summarizeIngredientGroup(ingredients, {
            multiplier: normalEffectiveMultiplier,
            totalRecipeCostTaxIncluded: 0,
        });
    }, [displayRecipe.type, costReferenceMode, displayRecipe.ingredientGroups, ingredients, normalEffectiveMultiplier, getCategoryUsageMultiplier]);

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
            savedUsageAmount: loadUsageAmountForGroup({
                recipeId: recipe?.id,
                recipeTitle: recipe?.title,
                groupKey,
            }),
            ...summary,
            baseOriginalCostTaxIncluded: originalBase,
            overrideBaseCostTaxIncluded: Number.isFinite(overriddenBase) ? overriddenBase : null,
            costTaxIncluded: effectiveCostTaxIncluded,
        });
    }, [normalEffectiveMultiplier, normalPrintTotal, categoryCostOverrides, costReferenceMode, recipe?.id]);

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
            ? (
                groupUsageAmountByCategory.get(selectedIngredientGroupStats.groupKey)
                ?? selectedIngredientGroupStats.savedUsageAmount
            )
            : null;
        setGroupUsageAmount(savedUsageAmount ?? '');
        setOverrideCostInput(
            Number.isFinite(toFiniteNumber(selectedIngredientGroupStats.overrideBaseCostTaxIncluded))
                ? String(selectedIngredientGroupStats.overrideBaseCostTaxIncluded)
                : (
                    Number.isFinite(toFiniteNumber(selectedIngredientGroupStats.baseOriginalCostTaxIncluded))
                        ? String(Math.round(selectedIngredientGroupStats.baseOriginalCostTaxIncluded * 100) / 100)
                        : ''
                )
        );
        setIsOverrideCostInputDirty(false);
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
            if (recipe?.id && selectedIngredientGroupStats?.groupKey) {
                // Keep the last entered "今回使う量" on explicit save as well.
                setGroupUsageAmountByCategory((prev) => {
                    const next = new Map(prev);
                    next.set(selectedIngredientGroupStats.groupKey, groupUsageAmount ?? '');
                    const idScope = getUsageScopeKey(recipe.id, null);
                    const titleScope = getUsageScopeKey(null, recipe?.title);
                    if (idScope) saveUsageAmountMap(idScope, next);
                    if (titleScope) saveUsageAmountMap(titleScope, next);
                    return next;
                });
            }
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
            setIsOverrideCostInputDirty(false);
            toast.success('カテゴリ原価を再設定しました。');
        } catch (error) {
            toast.error(`カテゴリ原価の保存に失敗しました: ${error?.message || 'unknown error'}`);
        } finally {
            setIsSavingCategoryOverride(false);
        }
    }, [selectedIngredientGroupStats, overrideCostInput, toast, recipe?.id, recipe?.title, normalEffectiveMultiplier, groupUsageAmount]);

    const handleClearCategoryOverride = React.useCallback(async (groupKey, groupName = 'カテゴリ') => {
        if (!groupKey || !recipe?.id) return;
        const hasSavedOverride = Number.isFinite(
            toFiniteNumber(categoryCostOverrides.get(groupKey))
        );

        if (!hasSavedOverride) {
            const baseOriginal = toFiniteNumber(selectedIngredientGroupStats?.baseOriginalCostTaxIncluded);
            setOverrideCostInput(Number.isFinite(baseOriginal) ? String(Math.round(baseOriginal * 100) / 100) : '');
            setIsOverrideCostInputDirty(false);
            toast.success('自動計算に戻しました。');
            return;
        }

        try {
            setIsSavingCategoryOverride(true);
            await categoryCostOverrideService.removeForRecipeCategory({
                recipeId: recipe.id,
                categoryKey: groupKey,
            });
            setCategoryCostOverrides((prev) => {
                const next = new Map(prev);
                next.delete(groupKey);
                return next;
            });
            setSelectedIngredientGroupStats((prev) => {
                if (!prev || prev.groupKey !== groupKey) return prev;
                const multiplierBase = Number.isFinite(normalEffectiveMultiplier) && normalEffectiveMultiplier > 0
                    ? normalEffectiveMultiplier
                    : 1;
                const fallbackCost = Number.isFinite(toFiniteNumber(prev.baseOriginalCostTaxIncluded))
                    ? prev.baseOriginalCostTaxIncluded * multiplierBase
                    : prev.costTaxIncluded;
                return {
                    ...prev,
                    overrideBaseCostTaxIncluded: null,
                    costTaxIncluded: fallbackCost,
                };
            });
            const baseOriginal = toFiniteNumber(selectedIngredientGroupStats?.baseOriginalCostTaxIncluded);
            setOverrideCostInput(Number.isFinite(baseOriginal) ? String(Math.round(baseOriginal * 100) / 100) : '');
            setIsOverrideCostInputDirty(false);
            toast.success(`${groupName}のセット原価をクリアしました。`);
        } catch (error) {
            toast.error(`セット原価のクリアに失敗しました: ${error?.message || 'unknown error'}`);
        } finally {
            setIsSavingCategoryOverride(false);
        }
    }, [recipe?.id, normalEffectiveMultiplier, toast, categoryCostOverrides, selectedIngredientGroupStats?.baseOriginalCostTaxIncluded]);


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
                                                    const groupKey = selectedIngredientGroupStats?.groupKey;
                                                    if (!groupKey) return;
                                                    setGroupUsageAmountByCategory((prev) => {
                                                        const next = new Map(prev);
                                                        next.set(groupKey, nextValue);
                                                        return next;
                                                    });
                                                    saveUsageAmountForGroup({
                                                        recipeId: recipe?.id,
                                                        recipeTitle: recipe?.title,
                                                        groupKey,
                                                        value: nextValue,
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
                                            onChange={(e) => {
                                                setOverrideCostInput(e.target.value);
                                                setIsOverrideCostInputDirty(true);
                                            }}
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
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleClearCategoryOverride(
                                                selectedIngredientGroupStats?.groupKey,
                                                selectedIngredientGroupStats?.groupName
                                            )}
                                            disabled={
                                                isSavingCategoryOverride
                                                || (
                                                    !Number.isFinite(
                                                        toFiniteNumber(selectedIngredientGroupStats?.overrideBaseCostTaxIncluded)
                                                    )
                                                    && !isOverrideCostInputDirty
                                                )
                                            }
                                        >
                                            セット原価をクリア
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
                        <button
                            type="button"
                            className="recipe-detail__menu-toggle no-print"
                            onClick={() => setIsActionMenuOpen(true)}
                            aria-label="操作メニューを開く"
                        >
                            ☰ メニュー
                        </button>
                    )}
                    {!isDeleted && isActionMenuOpen && (
                        <div
                            className="recipe-detail__menu-backdrop no-print"
                            onClick={() => setIsActionMenuOpen(false)}
                        />
                    )}
                    {!isDeleted && (
                        <div
                            className={`recipe-detail__actions recipe-detail__actions--menu${isActionMenuOpen ? ' is-open' : ''}`}
                            onClick={(e) => {
                                // ドロワー内のボタン操作後は自動で閉じる（select・チェックボックスは開いたまま）
                                if (e.target.closest('button')) setIsActionMenuOpen(false);
                            }}
                        >
                            <button
                                type="button"
                                className="recipe-detail__menu-close"
                                onClick={() => setIsActionMenuOpen(false)}
                            >
                                ✕ 閉じる
                            </button>

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
                            {onToggleFavorite && (
                                <FavoriteStarButton
                                    size="lg"
                                    isFavorite={isFavorite}
                                    onToggle={() => onToggleFavorite(recipe.id)}
                                />
                            )}
                            <Button
                                variant="secondary"
                                size="sm"
                                isLoading={isAiGenerating}
                                onClick={() => setIsAiModalOpen(true)}
                            >
                                🤖 AI改善{aiProposal ? '（作成済み）' : ''}
                            </Button>
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
                        {displayRecipe.country && (
                            <div className="meta-item">
                                <span className="meta-label">{tUi('country')}</span>
                                <span className="meta-value">{renderText(displayRecipe.country, sourceRecipe.country)}</span>
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

                {!isDeleted && (
                    <Modal
                        isOpen={isAiModalOpen}
                        onClose={() => setIsAiModalOpen(false)}
                        title="AI改善提案"
                        size="large"
                    >
                        <div className="recipe-ai-modal">
                        <p className="recipe-ai-modal__description">
                            各AIエージェントが料理文化・技術・配合・食品科学・品質を個別に調査し、統括シェフが改善案に統合します。
                            生成中にこのポップアップを閉じても処理は続行されます。
                        </p>
                        <div className="recipe-ai-form recipe-ai-form--detail">
                            <div className="recipe-ai-form__controls">
                                <label className="recipe-ai-form__label">
                                    AIプロバイダー
                                    <select
                                        className="recipe-ai-form__select"
                                        value={aiProvider}
                                        onChange={(e) => handleAiProviderChange(e.target.value)}
                                        disabled={isAiGenerating || isSavingAiProposal}
                                    >
                                        <option value="groq">マルチエージェント（推奨・自動振分）</option>
                                        <option value="sakana-subscription">{sakanaUnlocked ? 'Sakana AI（サブスク）' : '🔒 Sakana AI（サブスク）'}</option>
                                        <option value="sakana-payg">{sakanaUnlocked ? 'Sakana AI（従量課金）' : '🔒 Sakana AI（従量課金）'}</option>
                                    </select>
                                </label>
                                <p className="recipe-ai-form__hint">
                                    通常は、研究系は内容に応じて Perplexity、最終監査・統合・反証は OpenAI、それ以外は主に Groq を自動使用します。
                                </p>
                            </div>
                            <label className="recipe-ai-form__label">
                                改善指示
                                <textarea
                                    className="recipe-ai-form__textarea"
                                    value={aiNotes}
                                    onChange={(e) => setAiNotes(e.target.value)}
                                    placeholder="例: 提供時間を短くしたい、仕込みで品質を安定させたい、原価は上げずに香りを強くしたい。"
                                    disabled={isAiGenerating || isSavingAiProposal}
                                />
                            </label>
                            <div className="recipe-ai-form__actions">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    isLoading={isAiPreparingQuestions}
                                    disabled={isAiGenerating || isAiConversing || isSavingAiProposal}
                                    onClick={loadAiImprovementIntake}
                                >
                                    方向性の確認項目を出す
                                </Button>
                            </div>
                            {aiIntake?.questions?.length > 0 && (
                                <div className="recipe-ai-intake">
                                    <div className="recipe-ai-intake__header">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                            <strong>改善前の確認項目</strong>
                                            <button
                                                type="button"
                                                className="recipe-ai-intake__all-omasake-btn"
                                                onClick={handleFillAllAiIntakeWithOmasake}
                                                disabled={isAiGenerating || isAiConversing}
                                                style={{
                                                    background: 'linear-gradient(135deg, #ff8c00 0%, #ff5e00 100%)',
                                                    border: 'none',
                                                    color: '#fff',
                                                    borderRadius: '4px',
                                                    padding: '4px 10px',
                                                    fontSize: '12px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                                    transition: 'opacity 0.2s',
                                                }}
                                            >
                                                🪄 全ておまかせで埋める
                                            </button>
                                        </div>
                                        {aiIntake.summary && <p>{formatAiDisplayText(aiIntake.summary)}</p>}
                                    </div>
                                    <div className="recipe-ai-intake__list">
                                        {aiIntake.questions.map((question, index) => (
                                            <div className="recipe-ai-intake__item" key={question.id || index}>
                                                <div className="recipe-ai-intake__title-row">
                                                    <strong>{question.label || `確認項目 ${index + 1}`}</strong>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <button
                                                            type="button"
                                                            className="recipe-ai-intake__omasake-btn"
                                                            onClick={() => handleFillIntakeWithOmasake(question.id)}
                                                            disabled={isAiGenerating || isAiConversing}
                                                            style={{
                                                                background: 'rgba(255, 255, 255, 0.08)',
                                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                                color: 'hsl(var(--color-text-main))',
                                                                borderRadius: '4px',
                                                                padding: '2px 8px',
                                                                fontSize: '11px',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            🪄 おまかせ
                                                        </button>
                                                        {question.required !== false && <span>必須</span>}
                                                    </div>
                                                </div>
                                                <p className="recipe-ai-intake__question">{question.question}</p>
                                                {question.rationale && (
                                                    <p className="recipe-ai-intake__rationale">{question.rationale}</p>
                                                )}
                                                {question.options?.length > 0 && (
                                                    <div className="recipe-ai-intake__options">
                                                        {question.options.map((option) => (
                                                            <button
                                                                key={option}
                                                                type="button"
                                                                className={`recipe-ai-intake__option${String(question.answer || '').trim() === option ? ' is-active' : ''}`}
                                                                onClick={() => handleAiIntakeAnswerChange(question.id, option)}
                                                            >
                                                                {option}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <textarea
                                                    className="recipe-ai-form__textarea recipe-ai-intake__answer"
                                                    value={question.answer || ''}
                                                    onChange={(e) => handleAiIntakeAnswerChange(question.id, e.target.value)}
                                                    placeholder={question.placeholder || '回答を入力'}
                                                    disabled={isAiGenerating || isAiConversing || isSavingAiProposal}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                isLoading={isAiGenerating}
                                disabled={isAiGenerating || isSavingAiProposal}
                                onClick={handleGenerateAiImprovement}
                            >
                                {aiIntake?.questions?.length ? '回答内容でエージェント改善を開始' : 'まず方向性を確認する'}
                            </Button>
                            {aiError && <div className="recipe-ai-form__error">{aiError}</div>}
                        </div>

                        {aiProposal && (
                            <div className="recipe-ai-result">
                                <div className="recipe-ai-result__summary">
                                    <span>改善案プレビュー</span>
                                    <h3>{aiProposal.title || 'AI改善レシピ'}</h3>
                                    {(aiProposal.improvementSummary || aiProposal.description) && (
                                        <p>{formatAiDisplayText(aiProposal.improvementSummary || aiProposal.description)}</p>
                                    )}
                                </div>

                                {aiProposal.agentMessages?.length > 0 && (
                                    <div className="recipe-ai-result__block recipe-ai-result__agents">
                                        <h4>エージェント所見</h4>
                                        {aiProposal.agentMessages.map((message, index) => (
                                            <div className="recipe-ai-agent-line" key={`${message.agentId}-${index}`}>
                                                <span>{message.avatar}</span>
                                                <div>
                                                    <b>{message.agentName}</b>
                                                    <p>{formatAiDisplayText(message.content)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {aiProposal.keyChanges?.length > 0 && (
                                    <div className="recipe-ai-result__block">
                                        <h4>主な変更点</h4>
                                        <ul>
                                            {aiProposal.keyChanges.map((item, index) => (
                                                <li key={`${item}-${index}`}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {aiProposalDiff.hasAnyChanges ? (
                                    <div className="recipe-ai-result__block recipe-ai-result__diff">
                                        <h4>元レシピとの差分</h4>
                                        <p className="recipe-ai-result__diff-hint">
                                            変更前の行の<del className="recipe-ai-diff-inline__legend-removed">赤い部分</del>が削られ、
                                            変更後の行の<ins className="recipe-ai-diff-inline__legend-added">緑の部分</ins>に置き換わります。
                                        </p>

                                        {aiProposalDiff.titleChanged && (
                                            <div className="recipe-ai-result__diff-section">
                                                <h5>タイトルの変更</h5>
                                                <p className="recipe-ai-result__diff-text">
                                                    <DiffTextPair previousText={aiProposalDiff.previousTitle} nextText={aiProposalDiff.nextTitle} />
                                                </p>
                                            </div>
                                        )}

                                        {aiProposalDiff.ingredientChanges.length > 0 && (
                                            <div className="recipe-ai-result__diff-section">
                                                <h5>材料の変更</h5>
                                                <ul>
                                                    {aiProposalDiff.ingredientChanges.map((row) => (
                                                        <li key={`ingredient-change-${row.index}-${row.item.name}`}>
                                                            <strong>{row.item.name}</strong>
                                                            {row.amountChanged && (
                                                                <span>{row.previousAmountLabel || '未設定'} → {row.nextAmountLabel || '未設定'}</span>
                                                            )}
                                                            {row.noteChanged && (
                                                                <em>
                                                                    注記: {normalizeDiffText(row.previousItem?.note) || 'なし'} → {normalizeDiffText(row.item?.note) || 'なし'}
                                                                </em>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {aiProposalDiff.addedIngredients.length > 0 && (
                                            <div className="recipe-ai-result__diff-section">
                                                <h5>追加された材料</h5>
                                                <ul>
                                                    {aiProposalDiff.addedIngredients.map((row) => (
                                                        <li key={`ingredient-added-${row.index}-${row.item.name}`}>
                                                            <strong>{row.item.name}</strong>
                                                            <span>{row.nextAmountLabel || '未設定'}</span>
                                                            {row.item.note && <em>{row.item.note}</em>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {aiProposalDiff.removedIngredients.length > 0 && (
                                            <div className="recipe-ai-result__diff-section">
                                                <h5>削除された材料</h5>
                                                <ul>
                                                    {aiProposalDiff.removedIngredients.map(({ item, index }) => (
                                                        <li key={`ingredient-removed-${index}-${item?.name || 'unknown'}`}>
                                                            <strong>{item?.name || '名称未設定'}</strong>
                                                            <span>{formatDiffAmount(item?.quantity, item?.unit) || '未設定'}</span>
                                                            {item?.note && <em>{item.note}</em>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {aiProposalDiff.stepChanges.length > 0 && (
                                            <div className="recipe-ai-result__diff-section">
                                                <h5>手順の変更</h5>
                                                <ul>
                                                    {aiProposalDiff.stepChanges.map((change) => (
                                                        <li key={`step-change-${change.type}-${change.index}`}>
                                                            <strong>手順 {change.index + 1}</strong>
                                                            {change.type === 'changed' && (
                                                                <>
                                                                    {change.previousText !== change.nextText && (
                                                                        <DiffTextPair previousText={change.previousText} nextText={change.nextText} />
                                                                    )}
                                                                    {change.previousNote !== change.nextNote && (
                                                                        <em>注記: {change.previousNote || 'なし'} → {change.nextNote || 'なし'}</em>
                                                                    )}
                                                                </>
                                                            )}
                                                            {change.type === 'added' && (
                                                                <DiffTextSingle type="added" text={change.nextText} />
                                                            )}
                                                            {change.type === 'removed' && (
                                                                <DiffTextSingle type="removed" text={change.previousText} />
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="recipe-ai-result__block recipe-ai-result__diff">
                                        <h4>元レシピとの差分</h4>
                                        <p className="recipe-ai-result__diff-empty">材料・手順に変更はありません。</p>
                                    </div>
                                )}

                                {aiProposal.warnings?.length > 0 && (
                                    <div className="recipe-ai-result__block recipe-ai-result__block--warning">
                                        <h4>注意点</h4>
                                        <ul>
                                            {aiProposal.warnings.map((item, index) => (
                                                <li key={`${item}-${index}`}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="recipe-ai-result__preview-grid">
                                    <div className="recipe-ai-result__block">
                                        <h4>材料案</h4>
                                        <ol>
                                            {aiProposalDiff.ingredientRows.map((row, index) => (
                                                <li key={`${row.item.name}-${index}`}>
                                                    <strong>{row.item.name}</strong>
                                                    <span>{[row.item.quantity, row.item.unit].filter(Boolean).join('')}</span>
                                                    {row.status === 'changed' && row.amountChanged && (
                                                        <small className="recipe-ai-result__delta">変更: {row.previousAmountLabel || '未設定'} → {row.nextAmountLabel || '未設定'}</small>
                                                    )}
                                                    {row.status === 'added' && (
                                                        <small className="recipe-ai-result__delta recipe-ai-result__delta--added">新規追加</small>
                                                    )}
                                                    {row.item.note && <em>{row.item.note}</em>}
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                    <div className="recipe-ai-result__block">
                                        <h4>手順案</h4>
                                        <ol>
                                            {aiProposal.steps.map((item, index) => {
                                                const changeType = stepChangeTypeByIndex.get(index);
                                                return (
                                                    <li key={`${item.text}-${index}`}>
                                                        {item.text}
                                                        {changeType === 'changed' && (
                                                            <small className="recipe-ai-result__delta">変更あり</small>
                                                        )}
                                                        {changeType === 'added' && (
                                                            <small className="recipe-ai-result__delta recipe-ai-result__delta--added">新規追加</small>
                                                        )}
                                                        {item.note && <em>{item.note}</em>}
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    </div>
                                </div>

                                {aiProposal.sources?.length > 0 && (
                                    <div className="recipe-ai-result__block recipe-ai-result__sources">
                                        <h4>参照ソース</h4>
                                        <div>
                                            {aiProposal.sources.slice(0, 8).map((source) => (
                                                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                                                    {source.id ? `[${source.id}] ` : ''}{source.title || source.url}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="recipe-ai-result__block recipe-ai-conversation">
                                    <h4>続けて相談・再改善</h4>
                                    <p className="recipe-ai-conversation__hint">
                                        元レシピ、改善案、これまでの会話を踏まえてチャットで相談します。合意できた段階で改善案を再作成してください。
                                    </p>
                                    {aiConversation.length > 0 && (
                                        <div className="recipe-ai-conversation__messages">
                                            {aiConversation.map((message, index) => (
                                                <div
                                                    className={`recipe-ai-conversation__message recipe-ai-conversation__message--${message.role === 'assistant' ? 'assistant' : 'user'}`}
                                                    key={`${message.role}-${index}-${message.content.slice(0, 16)}`}
                                                >
                                                    <span>{message.role === 'assistant' ? 'AI' : '質問'}</span>
                                                    <p>{formatAiDisplayText(message.content)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <textarea
                                        className="recipe-ai-conversation__input"
                                        value={aiConversationInput}
                                        onChange={(e) => setAiConversationInput(e.target.value)}
                                        placeholder="例: もっと原価を下げたい。鶏肉を使わずに同じ満足感にできますか？ / この改善案の弱点は？"
                                        disabled={isAiConversing || isAiGenerating || isSavingAiProposal}
                                    />
                                    {aiConversation.length > 0 && (
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            isLoading={isAiGenerating}
                                            disabled={isAiConversing || isAiGenerating || isSavingAiProposal}
                                            onClick={handleApplyConversationToProposal}
                                            style={{ marginBottom: '1rem', width: '100%' }}
                                        >
                                            ✨ この合意内容で改善案を再作成（AI解析）
                                        </Button>
                                    )}
                                    <div className="recipe-ai-conversation__actions">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            isLoading={isAiConversing}
                                            disabled={isAiConversing || isAiGenerating || isSavingAiProposal || !aiConversationInput.trim()}
                                            onClick={handleAskAiFollowUp}
                                        >
                                            相談・Q&Aを送信
                                        </Button>
                                    </div>
                                </div>

                                <div className="recipe-ai-result__actions">
                                    {!canOverwriteWithAi && (
                                        <span className="recipe-ai-result__readonly-note">
                                            このレシピは閲覧専用のため、上書き保存はできません。
                                        </span>
                                    )}
                                    {canOverwriteWithAi && (
                                        <span className="recipe-ai-result__readonly-note">
                                            上書き保存を選んでも、元レシピはゴミ箱へ移動し、改善案を新規登録します。
                                        </span>
                                    )}
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        isLoading={isSavingAiProposal}
                                        disabled={isSavingAiProposal || isAiGenerating}
                                        onClick={() => saveAiProposal({ asNew: true })}
                                    >
                                        別レシピとして保存
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        isLoading={isSavingAiProposal}
                                        disabled={isSavingAiProposal || isAiGenerating || !canOverwriteWithAi}
                                        onClick={() => saveAiProposal({ asNew: false })}
                                    >
                                        このレシピに上書き
                                    </Button>
                                </div>
                            </div>
                        )}
                        </div>
                    </Modal>
                )}

                {!isDeleted && (
                    <Modal
                        isOpen={isAiProgressOpen && !isFinalIntegrating}
                        onClose={() => {}}
                        title={aiProgressConfig?.title || 'AIエージェント進行中'}
                        size="small"
                        showCloseButton={false}
                        maxWidth="520px"
                    >
                        <div className="recipe-ai-progress">
                            {(() => {
                                const currentStep = aiProgressConfig?.steps?.[aiProgressStepIndex];
                                const activeProvider = currentStep?.provider || '';
                                const isPerplexityActive = activeProvider.includes('Perplexity');
                                const isGroqActive = activeProvider.includes('Groq');
                                const isOpenAiActive = activeProvider.includes('OpenAI') || activeProvider.includes('gpt-') || activeProvider.includes('o4-');

                                return (
                                    <div className="recipe-ai-progress__providers-status">
                                        <div className={`provider-status-badge provider-status-badge--perplexity ${isPerplexityActive ? 'is-active' : ''}`}>
                                            <span className="provider-status-badge__dot" />
                                            <span className="provider-status-badge__name">Perplexity (Web調査)</span>
                                        </div>
                                        <div className={`provider-status-badge provider-status-badge--groq ${isGroqActive ? 'is-active' : ''}`}>
                                            <span className="provider-status-badge__dot" />
                                            <span className="provider-status-badge__name">Groq (高速論理)</span>
                                        </div>
                                        <div className={`provider-status-badge provider-status-badge--openai ${isOpenAiActive ? 'is-active' : ''}`}>
                                            <span className="provider-status-badge__dot" />
                                            <span className="provider-status-badge__name">OpenAI (監査・統合)</span>
                                        </div>
                                    </div>
                                );
                            })()}
                            <p className="recipe-ai-progress__description">
                                {aiProgressConfig?.description}
                            </p>
                            <div className="recipe-ai-progress__status">
                                <span className="recipe-ai-progress__pulse" />
                                <div>
                                    <strong>現在の工程</strong>
                                    {aiProgressConfig?.steps?.[aiProgressStepIndex] ? (
                                        <p>
                                            {aiProgressConfig.steps[aiProgressStepIndex].label}
                                            <span className="recipe-ai-progress__status-provider">{aiProgressConfig.steps[aiProgressStepIndex].provider}</span>
                                        </p>
                                    ) : <p>進行状況を確認中</p>}
                                </div>
                            </div>
                            <div className="recipe-ai-progress__bar" aria-hidden="true">
                                <span
                                    className="recipe-ai-progress__bar-fill"
                                    style={{
                                        width: `${(((aiProgressStepIndex + 1) / Math.max(aiProgressConfig?.steps?.length || 1, 1)) * 100).toFixed(0)}%`,
                                    }}
                                />
                            </div>
                            <div className="recipe-ai-progress__steps">
                                {(aiProgressConfig?.steps || []).map((step, index) => (
                                    <div
                                        key={`${step.label}-${index}`}
                                        className={`recipe-ai-progress__step${index < aiProgressStepIndex ? ' is-complete' : ''}${index === aiProgressStepIndex ? ' is-active' : ''}`}
                                    >
                                        <span className="recipe-ai-progress__step-index">{index + 1}</span>
                                        <div className="recipe-ai-progress__step-content">
                                            <span className="recipe-ai-progress__step-label">{step.label}</span>
                                            <span className="recipe-ai-progress__step-provider">{step.provider}</span>
                                            <span className="recipe-ai-progress__step-detail">{step.description}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Modal>
                )}

                {!isDeleted && isFinalIntegrating && (
                    <Modal
                        isOpen={true}
                        onClose={() => {}}
                        title="👨‍🍳 最終統合・クオリティ監査を実行中"
                        size="small"
                        showCloseButton={false}
                        maxWidth="500px"
                    >
                        <div className="final-integration-popup">
                            <div className="final-integration-popup__animation">
                                <div className="chef-hat-glow">
                                    <span className="chef-emoji" role="img" aria-label="chef">👨‍🍳</span>
                                </div>
                                <div className="integration-ring ring-1"></div>
                                <div className="integration-ring ring-2"></div>
                                <div className="integration-ring ring-3"></div>
                                <div className="integration-particles">
                                    <span></span><span></span><span></span><span></span>
                                    <span></span><span></span><span></span><span></span>
                                </div>
                            </div>
                            <h3 className="final-integration-popup__title">
                                レシピの最終統合と監査を行っています
                            </h3>
                            <p className="final-integration-popup__description">
                                複数の専門家AI（食品科学、安全性、本場比較）の所見をすり合わせ、矛盾のない黄金比率のレシピ構成へ統合・レビューを行っています。
                            </p>
                            <div className="final-integration-popup__status-label">
                                現在のプロセス: <span className="highlight-step">{currentProgressStep?.label}</span> ({currentProgressStep?.provider})
                            </div>
                            <div className="final-integration-popup__warning">
                                <span className="spin-loader"></span>
                                <span>これには30秒〜60秒ほどかかります。画面を閉じずにお待ちください。</span>
                            </div>
                        </div>
                    </Modal>
                )}

                <div className="recipe-detail__content">
                    <div className="recipe-detail__main">
                        <section className="detail-section">
                            <h2>{tUi('ingredients')}</h2>
                            <Card className="ingredients-card">
                                <div className="screen-only no-print" style={{
                                    margin: '0 0 0.9rem 0',
                                    padding: '0.55rem 0.7rem',
                                    border: '1px solid #dee2e6',
                                    borderRadius: '8px',
                                    background: '#f8fafc',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap'
                                }}>
                                    <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 700 }}>このレシピの歩留まり:</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={calcYieldRate}
                                        onChange={(e) => setCalcYieldRate(e.target.value)}
                                        onBlur={handleSaveRecipeYieldRate}
                                        placeholder="例: 0.6"
                                        style={{
                                            padding: '4px 8px',
                                            width: '90px',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '0.95rem',
                                            textAlign: 'center',
                                            background: '#fff'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                        0.6（60%）または 60（%）で入力
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleSaveRecipeYieldRate}
                                        disabled={isSavingRecipeYieldRate}
                                    >
                                        {isSavingRecipeYieldRate ? '保存中...' : '保存'}
                                    </Button>
                                </div>
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
                                                return scaleQuantityText(q, target ? scaleFactor : 1);
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
                                                            const calcTotalWeightLikeGrams = (items) => {
                                                                return items.reduce((sum, item) => {
                                                                    const qty = parseQuantityValue(item?.quantity);
                                                                    if (!Number.isFinite(qty)) return sum;
                                                                    const u = normalizeUnit(item?.unit);
                                                                    if (u === 'kg') return sum + (qty * 1000 * scaleFactor);
                                                                    if (u === 'g' || !u) return sum + (qty * scaleFactor);
                                                                    if (u === 'ml' || u === 'cc') return sum + (qty * scaleFactor);
                                                                    if (u === 'l') return sum + (qty * 1000 * scaleFactor);
                                                                    if (u === 'cl') return sum + (qty * 10 * scaleFactor);
                                                                    return sum;
                                                                }, 0);
                                                            };
                                                            const total = calcTaxedCost(flours) + calcTaxedCost(others);
                                                            const totalWeight = calcTotalWeightLikeGrams(flours) + calcTotalWeightLikeGrams(others);
                                                            return renderProfitCalculator(total, totalWeight);
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
                                            <span style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 700 }}>原価参照モード:</span>
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
                                            <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                                                ※ 合成原価では再設定を優先。未設定カテゴリは元データを参照します。
                                            </span>
                                        </div>
                                        {normalQuantitySummary && (
                                            <div className="screen-only no-print" style={{ margin: '0 0 0.9rem 0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 700 }}>総量:</span>
                                                {normalQuantitySummary.hasWeightBasis && (
                                                    <span style={{ fontSize: '0.82rem', color: '#0f172a', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                        {formatCompactNumber(normalQuantitySummary.totalWeightGrams, { maximumFractionDigits: 1 })} g
                                                    </span>
                                                )}
                                                {normalQuantitySummary.hasVolumeBasis && (
                                                    <span style={{ fontSize: '0.82rem', color: '#0f172a', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                        {formatCompactNumber(normalQuantitySummary.totalVolumeMl, { maximumFractionDigits: 1 })} ml
                                                    </span>
                                                )}
                                                {(normalQuantitySummary.hasWeightBasis || normalQuantitySummary.hasVolumeBasis) && (
                                                    <span style={{ fontSize: '0.82rem', color: '#0f172a', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '999px', padding: '2px 10px', fontWeight: 800 }}>
                                                        合計 {formatCompactNumber(
                                                            (toFiniteNumber(normalQuantitySummary.totalWeightGrams) || 0)
                                                            + (toFiniteNumber(normalQuantitySummary.totalVolumeMl) || 0),
                                                            { maximumFractionDigits: 1 }
                                                        )} g
                                                    </span>
                                                )}
                                                {!normalQuantitySummary.hasWeightBasis && !normalQuantitySummary.hasVolumeBasis && (
                                                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                                                        重量/液量の自動集計対象がありません（個・本は分量集計をご確認ください）
                                                    </span>
                                                )}
                                                {(normalQuantitySummary.hasWeightBasis || normalQuantitySummary.hasVolumeBasis) && (
                                                    <span style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                                                        ※ 総量合計は 1ml=1g として換算しています。
                                                    </span>
                                                )}
                                            </div>
                                        )}

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
                                                    const groupKey = `group:${String(group.id)}`;
                                                    const categoryMultiplier = getCategoryDisplayMultiplier(`group:${String(group.id)}`);
                                                    const usageMultiplier = getCategoryUsageMultiplier(groupKey);
                                                    const overrideBase = toFiniteNumber(categoryCostOverrides.get(`group:${String(group.id)}`));
                                                    const hasSetCost = Number.isFinite(overrideBase);
                                                    const groupSetCost = hasSetCost
                                                        ? (overrideBase * normalEffectiveMultiplier)
                                                        : null;
                                                    const groupSummary = summarizeIngredientGroup(groupIngredients, {
                                                        multiplier: normalEffectiveMultiplier,
                                                        totalRecipeCostTaxIncluded: normalPrintTotal,
                                                    });
                                                    const groupSetAmountLikeGrams = groupSummary.totalWeightGrams + groupSummary.totalVolumeMl;
                                                    const savedUsageAmountRaw =
                                                        groupUsageAmountByCategory.get(`group:${String(group.id)}`)
                                                        ?? loadUsageAmountForGroup({
                                                            recipeId: recipe?.id,
                                                            recipeTitle: recipe?.title,
                                                            groupKey: `group:${String(group.id)}`,
                                                        });
                                                    const savedUsageAmount = toFiniteNumber(savedUsageAmountRaw);
                                                    const usageCostFromSavedAmount =
                                                        Number.isFinite(savedUsageAmount) && savedUsageAmount >= 0 &&
                                                        Number.isFinite(groupSetCost) && groupSetCost >= 0 &&
                                                        Number.isFinite(groupSetAmountLikeGrams) && groupSetAmountLikeGrams > 0
                                                            ? (groupSetCost / groupSetAmountLikeGrams) * savedUsageAmount
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
                                                                        <span className="ingredient-group-heading__title">{group.name}</span>
                                                                        <span className="ingredient-group-heading__meta">
                                                                            {hasSetCost && (
                                                                                <span className="ingredient-group-heading__set-cost screen-only">
                                                                                    セット原価: {formatYen(groupSetCost, { maximumFractionDigits: 2 }) ?? '—'}
                                                                                    {Number.isFinite(groupSetAmountLikeGrams) && groupSetAmountLikeGrams > 0
                                                                                        ? ` / ${formatCompactNumber(groupSetAmountLikeGrams, { maximumFractionDigits: 1 })}g`
                                                                                        : ''}
                                                                                    <button
                                                                                        type="button"
                                                                                        className="ingredient-group-heading__clear-btn"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleClearCategoryOverride(`group:${String(group.id)}`, group.name);
                                                                                        }}
                                                                                        disabled={isSavingCategoryOverride}
                                                                                    >
                                                                                        クリア
                                                                                    </button>
                                                                                </span>
                                                                            )}
                                                                            {usageCostFromSavedAmount != null && (
                                                                                <span className="ingredient-group-heading__usage-cost screen-only">
                                                                                    {formatCompactNumber(savedUsageAmount, { maximumFractionDigits: 1 })}g使用: {formatYen(usageCostFromSavedAmount, { maximumFractionDigits: 2 }) ?? '—'}
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

                                                                        const quantityMultiplier = normalEffectiveMultiplier * usageMultiplier;
                                                                        const costMultiplier = normalEffectiveMultiplier * categoryMultiplier * usageMultiplier;
                                                                        const scaledQty = getScaledQty(ing.quantity, quantityMultiplier);
                                                                        const scaledCost = getScaledCost(ing.cost, costMultiplier);
                                                                        const isScaled = quantityMultiplier !== 1 || costMultiplier !== 1;
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

                                                                const usageMultiplier = getCategoryUsageMultiplier('group:all');
                                                                const quantityMultiplier = normalEffectiveMultiplier * usageMultiplier;
                                                                const costMultiplier = normalEffectiveMultiplier * categoryMultiplier * usageMultiplier;
                                                                const scaledQty = getScaledQty(ing.quantity, quantityMultiplier);
                                                                const scaledCost = getScaledCost(ing.cost, costMultiplier);
                                                                const isScaled = quantityMultiplier !== 1 || costMultiplier !== 1;
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
                                                            ¥{Math.round(normalCostTotalForDisplay).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </>
                                            );
                                        })()}

                                        <div className="screen-only no-print">
                                            <div className="cost-summary">
                                                <span className="cost-summary__label">{tUi('totalCost')}:</span>
                                                <span className="cost-summary__value">
                                                    ¥{Math.round(normalCostTotalForDisplay).toLocaleString()}
                                                </span>
                                                <span className="cost-summary__note">(税込)</span>
                                            </div>
                                        </div>
                                        <p className="recipe-detail__subtle recipe-detail__tax-footnote">※原価は材料ごとに税率(8% or 10%)を適用</p>

                                        {(() => {
                                            const totalWeightLikeGrams = normalQuantitySummary
                                                ? (normalQuantitySummary.totalWeightGrams + normalQuantitySummary.totalVolumeMl)
                                                : null;
                                            return renderProfitCalculator(normalCostTotalForDisplay, totalWeightLikeGrams);
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
                            {displayRecipe.country && <div><strong>国:</strong> {displayRecipe.country}</div>}
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
                                                                    const usageMultiplier = getCategoryUsageMultiplier(`group:${String(group.id)}`);
                                                                    const qty = typeof ing === 'object'
                                                                        ? getScaledQty(ing.quantity, normalEffectiveMultiplier * usageMultiplier)
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
                                                            const usageMultiplier = getCategoryUsageMultiplier('group:all');
                                                            const qty = typeof ing === 'object'
                                                                ? getScaledQty(ing.quantity, normalEffectiveMultiplier * usageMultiplier)
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
                    {displayRecipe.country && (
                        <div className="meta-item">
                            <span className="meta-label">{tUi('country')}</span>
                            <span className="meta-value">{renderPrintText(displayRecipe.country, sourceRecipe.country)}</span>
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
                                const printEffectiveMultiplier = normalEffectiveMultiplier * getCategoryUsageMultiplier(sectionCategoryKey);
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
