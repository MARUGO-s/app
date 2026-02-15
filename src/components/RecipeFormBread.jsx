import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import { AutocompleteInput } from './AutocompleteInput';
import { ingredientSearchService } from '../services/ingredientSearchService';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import './RecipeForm.css'; // Reuse basic styles
import './RecipeFormBread.css'; // Add specialized styles

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import UnitConversionModal from './UnitConversionModal';

const ALLOWED_ITEM_CATEGORIES = new Set(['food', 'alcohol', 'soft_drink', 'supplies']);
const TAX10_ITEM_CATEGORIES = new Set(['alcohol', 'supplies']);
const ITEM_CATEGORY_LABELS = {
    food: '食材',
    alcohol: 'アルコール',
    soft_drink: 'ソフトドリンク',
    supplies: '備品',
};

const normalizeItemCategory = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'food_alcohol') return 'food';
    if (ALLOWED_ITEM_CATEGORIES.has(normalized)) return normalized;
    return '';
};

const isTax10Category = (category) => TAX10_ITEM_CATEGORIES.has(category);

const applyCategoryTax = (item, categoryValue) => {
    const category = normalizeItemCategory(categoryValue);
    if (!category) {
        return { ...item, itemCategory: null };
    }

    return {
        ...item,
        itemCategory: category,
        isAlcohol: isTax10Category(category),
    };
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

const calculateCostByUnit = (quantity, purchaseCost, unit, forceWeightBased = false, yieldRate = 1) => {
    const qty = toFiniteNumber(quantity);
    const pCost = toFiniteNumber(purchaseCost);
    if (!Number.isFinite(qty) || !Number.isFinite(pCost)) return NaN;

    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;

    if (forceWeightBased) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    const normalizedUnit = String(unit || '').trim().toLowerCase();
    if (['g', 'ｇ', 'ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(normalizedUnit) || !normalizedUnit) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    if (['cl', 'ｃｌ'].includes(normalizedUnit)) {
        return ((qty * 10 / 1000) * pCost) / safeYieldRate;
    }
    return (qty * pCost) / safeYieldRate;
};

const isLikelyLegacyPackPrice = (item, normalizedCost) => {
    const stored = toFiniteNumber(item?.purchaseCost);
    const ref = toFiniteNumber(item?.purchaseCostRef ?? item?.purchase_cost);
    if (!Number.isFinite(normalizedCost)) return false;
    if (!Number.isFinite(stored)) return true;

    if (Number.isFinite(ref) && Math.abs(stored - ref) < 0.0001 && Math.abs(stored - normalizedCost) > 0.01) {
        return true;
    }
    return false;
};

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

export const RecipeFormBread = ({ formData, setFormData }) => {
    // Local state for calculation convenience, synced with parent formData
    // We expect formData to have 'flours' and 'breadIngredients' arrays
    // If not, we initialize them or map from existing ingredients

    // Price list cache
    const [priceList, setPriceList] = useState(new Map());

    // Helper Modal State
    const [conversionModal, setConversionModal] = useState({
        isOpen: false,
        type: null, // 'flour' | 'ingredient'
        index: null
    });

    // Unit Conversion Cache
    const [conversionMap, setConversionMap] = useState(new Map());

    useEffect(() => {
        const loadData = async () => {
            const [prices, conversions] = await Promise.all([
                purchasePriceService.fetchPriceList(),
                unitConversionService.getAllConversions()
            ]);
            setPriceList(prices);
            setConversionMap(conversions);
        };
        loadData();
    }, []);

    // Helper to calculate total flour weight
    const calculateTotalFlour = (flours) => {
        return flours.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    };

    const totalFlour = calculateTotalFlour(formData.flours || []);

    const calculatePercentage = (weight) => {
        if (!totalFlour || totalFlour === 0) return 0;
        const w = parseFloat(weight) || 0;
        return ((w / totalFlour) * 100).toFixed(1);
    };

    useEffect(() => {
        if (conversionMap.size === 0) return;

        const adjustItems = (items = []) => {
            let changed = false;
            const adjusted = items.map((item) => {
                if (!item || typeof item !== 'object') return item;

                const conv = findConversionByName(conversionMap, item.name);
                let nextItem = item;

                const resolvedCategory = normalizeItemCategory(
                    item.itemCategory ?? item.item_category ?? conv?.itemCategory
                );
                if (resolvedCategory) {
                    const nextIsAlcohol = isTax10Category(resolvedCategory);
                    const currentCategory = normalizeItemCategory(item.itemCategory ?? item.item_category);
                    if (currentCategory !== resolvedCategory || Boolean(item.isAlcohol) !== nextIsAlcohol) {
                        nextItem = {
                            ...nextItem,
                            itemCategory: resolvedCategory,
                            isAlcohol: nextIsAlcohol,
                        };
                    }
                }

                const yieldRate = getYieldRate(item, conv);
                const expectedCostRaw = calculateCostByUnit(item.quantity, nextItem.purchaseCost, item.unit, true, yieldRate);
                const expectedCost = Number.isFinite(expectedCostRaw)
                    ? Math.round(expectedCostRaw * 100) / 100
                    : NaN;
                const currentCost = toFiniteNumber(nextItem.cost);
                if (Number.isFinite(expectedCost) && (!Number.isFinite(currentCost) || Math.abs(currentCost - expectedCost) > 0.01)) {
                    nextItem = {
                        ...nextItem,
                        cost: expectedCost,
                    };
                }

                if (conv && conv.packetSize) {
                    const basePriceCandidates = [
                        conv.lastPrice,
                        item.purchaseCostRef,
                        item.purchase_cost,
                        item.purchaseCost,
                    ];
                    const basePrice = basePriceCandidates.find((value) => Number.isFinite(toFiniteNumber(value)));
                    const normalizedCost = normalizePurchaseCostByConversion(basePrice, conv.packetSize, conv.packetUnit);

                    if (Number.isFinite(normalizedCost) && isLikelyLegacyPackPrice(item, normalizedCost)) {
                        const yieldRate = getYieldRate(item, conv);
                        const roundedPurchaseCost = Math.round(normalizedCost * 100) / 100;
                        const recalculatedCost = calculateCostByUnit(item.quantity, roundedPurchaseCost, item.unit, true, yieldRate);
                        const roundedCost = Number.isFinite(recalculatedCost)
                            ? Math.round(recalculatedCost * 100) / 100
                            : nextItem.cost;

                        const currentPurchase = toFiniteNumber(nextItem.purchaseCost);
                        const currentCost = toFiniteNumber(nextItem.cost);
                        const purchaseChanged = !Number.isFinite(currentPurchase) || Math.abs(currentPurchase - roundedPurchaseCost) > 0.01;
                        const costChanged =
                            Number.isFinite(toFiniteNumber(roundedCost)) &&
                            (!Number.isFinite(currentCost) || Math.abs(currentCost - roundedCost) > 0.01);

                        if (purchaseChanged || costChanged) {
                            nextItem = {
                                ...nextItem,
                                purchaseCost: roundedPurchaseCost,
                                cost: roundedCost,
                            };
                        }
                    }
                }

                if (nextItem !== item) {
                    changed = true;
                }
                return nextItem;
            });
            return { adjusted, changed };
        };

        const flourResult = adjustItems(formData.flours || []);
        const ingredientResult = adjustItems(formData.breadIngredients || []);
        if (!flourResult.changed && !ingredientResult.changed) return;

        setFormData((prev) => ({
            ...prev,
            flours: flourResult.adjusted,
            breadIngredients: ingredientResult.adjusted,
        }));
    }, [conversionMap, formData.breadIngredients, formData.flours, setFormData]);

    const handleFlourChange = (index, field, value) => {
        const newFlours = [...(formData.flours || [])];
        newFlours[index] = { ...newFlours[index], [field]: value };

        // Auto-lookup cost if name changes
        if (field === 'name') {
            // Suggestion logic
            const refData = priceList.get(normalizeIngredientKey(value));
            if (refData) {
                const price = typeof refData === 'object' ? refData.price : refData;
                const vendor = typeof refData === 'object' ? refData.vendor : null;
                const unit = typeof refData === 'object' ? refData.unit : null;

                newFlours[index].purchaseCostRef = price;
                newFlours[index].vendorRef = vendor;

                // Check for saved conversion
                const conv = findConversionByName(conversionMap, value);
                if (conv && conv.packetSize) {
                    // Normalize cost: Price / PacketSize (if unit is compatible)
                    // If conv has lastPrice, maybe use that? Or prefer current CSV price?
                    // Let's use CSV price as base because it's latest market rate,
                    // but apply the stored packet size conversation.
                    // If unit is 'g'/'ml', app expects cost per 1000 units.
                    // If packetUnit match 'g'/'ml', then (Price / Size) * 1000.
                    let normalized = 0;
                    const basePrice = (conv.lastPrice !== null && conv.lastPrice !== undefined && conv.lastPrice !== '')
                        ? conv.lastPrice
                        : price;
                    const pu = (conv.packetUnit || '').trim().toLowerCase();
                    if (['g', 'ｇ'].includes(pu)) {
                        normalized = (basePrice / conv.packetSize) * 1000;
                    } else if (['kg', 'ｋｇ'].includes(pu)) {
                        normalized = basePrice / conv.packetSize;
                    } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(pu)) {
                        normalized = (basePrice / conv.packetSize) * 1000;
                    } else if (['l', 'ｌ'].includes(pu)) {
                        normalized = basePrice / conv.packetSize;
                    } else if (['cl', 'ｃｌ'].includes(pu)) {
                        normalized = (basePrice / conv.packetSize) * 100;
                    } else {
                        normalized = basePrice / conv.packetSize;
                    }

                    newFlours[index].purchaseCost = Math.round(normalized * 100) / 100;
                    newFlours[index].unit = 'g'; // Default to g for flour
                } else if (!newFlours[index].purchaseCost) {
                    // No conversion, just raw price (maybe it's already per kg?)
                    newFlours[index].purchaseCost = price;
                    if (!newFlours[index].unit && unit) newFlours[index].unit = unit;
                }

                const matchedCategory = normalizeItemCategory(conv?.itemCategory);
                if (matchedCategory) {
                    newFlours[index] = applyCategoryTax(newFlours[index], matchedCategory);
                } else {
                    newFlours[index].itemCategory = null;
                }
            } else {
                newFlours[index].purchaseCostRef = null;
                newFlours[index].vendorRef = null;
                newFlours[index].itemCategory = null;
            }
        }

        // Auto-Calc Cost logic (Cost = Qty * PurchaseCost)
        // Assumption: If unit is 'g' or 'ｇ', Purchase Cost is per 1kg (1000g).
        // Otherwise, simply Qty * PurchaseCost.
        if (['quantity', 'purchaseCost', 'name', 'isAlcohol', 'unit'].includes(field) || field === 'name') {
            // Re-evaluate cost for this row
            // Note: 'value' is the NEW value for 'field'. But we already set it in newFlours[index].
            const item = newFlours[index];
            const qty = parseFloat(item.quantity);
            const pCost = parseFloat(item.purchaseCost);

            if (!isNaN(qty) && !isNaN(pCost)) {
                let calculated = 0;
                // Bread flours usually 'g'.
                const unit = (item.unit || '').trim().toLowerCase();
                if (unit === 'g' || unit === 'ｇ' || unit === 'ml' || unit === 'ｍｌ' || unit === 'cc' || unit === 'ｃｃ' || !unit) {
                    calculated = (qty / 1000) * pCost;
                } else if (unit === 'cl' || unit === 'ｃｌ') {
                    calculated = (qty * 10 / 1000) * pCost;
                } else {
                    calculated = qty * pCost;
                }
                // Round to 2 decimals
                const convForYield = findConversionByName(conversionMap, item.name);
                const yieldRate = getYieldRate(item, convForYield);
                const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                const rounded = Math.round(((calculated / safeYieldRate) * 100)) / 100;
                if (rounded !== item.cost) {
                    newFlours[index].cost = rounded;
                }
            }
        }

        // If updating quantity, allow decimal input but store as string. Calculation handles parsing.
        setFormData(prev => ({ ...prev, flours: newFlours }));
    };

    const handleIngredientChange = (index, field, value) => {
        const newIngs = [...(formData.breadIngredients || [])];
        newIngs[index] = { ...newIngs[index], [field]: value };

        if (field === 'name') {
            // Suggestion logic
            const refData = priceList.get(normalizeIngredientKey(value));
            if (refData) {
                const price = typeof refData === 'object' ? refData.price : refData;
                const vendor = typeof refData === 'object' ? refData.vendor : null;
                const unit = typeof refData === 'object' ? refData.unit : null;

                newIngs[index].purchaseCostRef = price;
                newIngs[index].vendorRef = vendor;

                // Check for saved conversion
                const conv = findConversionByName(conversionMap, value);
                if (conv && conv.packetSize) {
                    let normalized = 0;
                    // Logic:
                    // If PacketUnit is 'g'/'ml', Price is for X g. Normalized (per 1000g) = (Price/Size)*1000.
                    // If PacketUnit is 'kg'/'L', Price is for X kg. Normalized (per 1kg) = Price/Size.
                    // If PacketUnit is 'pcs'/'bag', Price is for X pcs. Normalized (per 1pc) = Price/Size.

                    const basePrice = (conv.lastPrice !== null && conv.lastPrice !== undefined && conv.lastPrice !== '')
                        ? conv.lastPrice
                        : price;
                    const pu = (conv.packetUnit || '').trim().toLowerCase();
                    if (['g', 'ｇ'].includes(pu)) {
                        normalized = (basePrice / conv.packetSize) * 1000;
                        newIngs[index].unit = 'g';
                    } else if (['kg', 'ｋｇ'].includes(pu)) {
                        normalized = basePrice / conv.packetSize;
                        newIngs[index].unit = 'g'; // Assume kg -> g usage
                    } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(pu)) {
                        normalized = (basePrice / conv.packetSize) * 1000;
                        newIngs[index].unit = 'ml';
                    } else if (['l', 'ｌ'].includes(pu)) {
                        normalized = basePrice / conv.packetSize;
                        newIngs[index].unit = 'ml';
                    } else {
                        // other units (pcs, packs)
                        normalized = basePrice / conv.packetSize;
                        newIngs[index].unit = conv.packetUnit; // Use the unit (e.g. '個')
                    }

                    newIngs[index].purchaseCost = Math.round(normalized * 100) / 100;
                } else if (!newIngs[index].purchaseCost) {
                    newIngs[index].purchaseCost = price;
                    if (!newIngs[index].unit && unit) newIngs[index].unit = unit;
                }

                const matchedCategory = normalizeItemCategory(conv?.itemCategory);
                if (matchedCategory) {
                    newIngs[index] = applyCategoryTax(newIngs[index], matchedCategory);
                } else {
                    newIngs[index].itemCategory = null;
                }
            } else {
                newIngs[index].purchaseCostRef = null;
                newIngs[index].vendorRef = null;
                newIngs[index].itemCategory = null;
            }
        }

        // Auto-Calc Cost logic
        if (['quantity', 'purchaseCost', 'name', 'isAlcohol', 'unit'].includes(field) || field === 'name') {
            const item = newIngs[index];
            const qty = parseFloat(item.quantity);
            const pCost = parseFloat(item.purchaseCost);

            if (!isNaN(qty) && !isNaN(pCost)) {
                let calculated = 0;
                // Check unit
                const u = item.unit ? item.unit.trim().toLowerCase() : 'g'; // default to g for bread ings if empty?
                if (u === 'g' || u === 'ｇ' || u === 'ml' || u === 'ｍｌ' || u === 'cc' || u === 'ｃｃ') {
                    calculated = (qty / 1000) * pCost;
                } else {
                    calculated = qty * pCost;
                }
                // Round to 2 decimals
                const convForYield = findConversionByName(conversionMap, item.name);
                const yieldRate = getYieldRate(item, convForYield);
                const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                const rounded = Math.round(((calculated / safeYieldRate) * 100)) / 100;
                if (rounded !== item.cost) {
                    newIngs[index].cost = rounded;
                }
            }
        }

        setFormData(prev => ({ ...prev, breadIngredients: newIngs }));
    };

    const addFlour = () => {
        setFormData(prev => ({
            ...prev,
            flours: [...(prev.flours || []), { id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '', isAlcohol: false, itemCategory: null }]
        }));
    };

    const addIngredient = () => {
        setFormData(prev => ({
            ...prev,
            breadIngredients: [...(prev.breadIngredients || []), { id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '', isAlcohol: false, itemCategory: null }]
        }));
    };

    const removeFlour = (index) => {
        setFormData(prev => ({
            ...prev,
            flours: prev.flours.filter((_, i) => i !== index)
        }));
    };

    const removeIngredient = (index) => {
        setFormData(prev => ({
            ...prev,
            breadIngredients: prev.breadIngredients.filter((_, i) => i !== index)
        }));
    };

    // DnD Sensors
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setFormData((prev) => {
                const isFlour = prev.flours.some((item) => item.id === active.id);
                const field = isFlour ? 'flours' : 'breadIngredients';

                const oldIndex = prev[field].findIndex((item) => item.id === active.id);
                const newIndex = prev[field].findIndex((item) => item.id === over.id);

                if (oldIndex !== -1 && newIndex !== -1) {
                    return {
                        ...prev,
                        [field]: arrayMove(prev[field], oldIndex, newIndex),
                    };
                }
                return prev;
            });
        }
    };

    // Provide initial structure if empty and ensure all items have IDs
    useEffect(() => {
        if (!formData.flours) {
            setFormData(prev => ({ ...prev, flours: [{ id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '', isAlcohol: false, itemCategory: null }] }));
        } else {
            // Ensure all flours have IDs
            const floursWithIds = formData.flours.map(flour =>
                flour.id ? flour : { ...flour, id: crypto.randomUUID() }
            );
            if (JSON.stringify(floursWithIds) !== JSON.stringify(formData.flours)) {
                setFormData(prev => ({ ...prev, flours: floursWithIds }));
            }
        }

        if (!formData.breadIngredients) {
            setFormData(prev => ({ ...prev, breadIngredients: [{ id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '', isAlcohol: false, itemCategory: null }] }));
        } else {
            // Ensure all breadIngredients have IDs
            const ingredientsWithIds = formData.breadIngredients.map(ing =>
                ing.id ? ing : { ...ing, id: crypto.randomUUID() }
            );
            if (JSON.stringify(ingredientsWithIds) !== JSON.stringify(formData.breadIngredients)) {
                setFormData(prev => ({ ...prev, breadIngredients: ingredientsWithIds }));
            }
        }
    }, []);

    const handleConversionApply = (normalizedCost, normalizedUnit, packetPrice, packetSize) => {
        const { type, index } = conversionModal;

        setFormData(prev => {
            if (type === 'flour') {
                const newFlours = [...prev.flours];
                const item = {
                    ...newFlours[index],
                    purchaseCost: normalizedCost,
                    unit: normalizedUnit,
                    purchase_cost: packetPrice, // Store raw input
                    content_amount: packetSize  // Store raw input
                };

                // Re-calculate cost immediately
                const qty = parseFloat(item.quantity);
                const pCost = parseFloat(normalizedCost);
                if (!isNaN(qty) && !isNaN(pCost)) {
                    let calculated = 0;
                    if (normalizedUnit === 'g' || normalizedUnit === 'ｇ') {
                        calculated = (qty / 1000) * pCost;
                    } else {
                        calculated = qty * pCost;
                    }
                    const convForYield = findConversionByName(conversionMap, item.name);
                    const yieldRate = getYieldRate(item, convForYield);
                    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                    item.cost = Math.round(((calculated / safeYieldRate) * 100)) / 100;
                }
                newFlours[index] = item;
                // Reload conversions to update cache
                unitConversionService.getAllConversions().then(map => setConversionMap(map));
                ingredientSearchService.invalidateCache();
                return { ...prev, flours: newFlours };
            } else if (type === 'ingredient') {
                const newIngs = [...prev.breadIngredients];
                const item = {
                    ...newIngs[index],
                    purchaseCost: normalizedCost,
                    unit: normalizedUnit,
                    purchase_cost: packetPrice, // Store raw input
                    content_amount: packetSize  // Store raw input
                };

                // Re-calculate cost immediately
                const qty = parseFloat(item.quantity);
                const pCost = parseFloat(normalizedCost);
                if (!isNaN(qty) && !isNaN(pCost)) {
                    let calculated = 0;
                    if (normalizedUnit === 'g' || normalizedUnit === 'ｇ') {
                        calculated = (qty / 1000) * pCost;
                    } else {
                        calculated = qty * pCost;
                    }
                    const convForYield = findConversionByName(conversionMap, item.name);
                    const yieldRate = getYieldRate(item, convForYield);
                    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                    item.cost = Math.round(((calculated / safeYieldRate) * 100)) / 100;
                }
                newIngs[index] = item;
                // Reload conversions
                unitConversionService.getAllConversions().then(map => setConversionMap(map));
                ingredientSearchService.invalidateCache();
                return { ...prev, breadIngredients: newIngs };
            }
            return prev;
        });
    };

    const handleAutocompleteSelect = (type, index, selectedItem) => {
        if (!selectedItem) return;

        setFormData(prev => {
            const field = type === 'flour' ? 'flours' : 'breadIngredients';
            const items = [...(prev[field] || [])];
            const newItem = { ...items[index] };

            newItem.name = selectedItem.name;
            newItem.itemCategory = null;

            if (selectedItem.price !== undefined && selectedItem.price !== null && selectedItem.price !== '') {
                newItem.purchaseCostRef = selectedItem.price;
                newItem.vendorRef = selectedItem.source === 'csv' ? 'CSV' : 'Master';

                let normalized = selectedItem.price;
                let normalizedUnit = selectedItem.unit;

                if (selectedItem.source === 'manual') {
                    if (selectedItem.size && selectedItem.size > 0) {
                        const u = (selectedItem.unit || '').trim().toLowerCase();
                        if (['g', 'ｇ'].includes(u)) {
                            normalized = (selectedItem.price / selectedItem.size) * 1000;
                            normalizedUnit = 'g';
                        } else if (['kg', 'ｋｇ'].includes(u)) {
                            normalized = selectedItem.price / selectedItem.size;
                            normalizedUnit = 'g';
                        } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(u)) {
                            normalized = (selectedItem.price / selectedItem.size) * 1000;
                            normalizedUnit = 'ml';
                        } else if (['l', 'ｌ'].includes(u)) {
                            normalized = selectedItem.price / selectedItem.size;
                            normalizedUnit = 'ml';
                        } else if (['cl', 'ｃｌ'].includes(u)) {
                            normalized = (selectedItem.price / selectedItem.size) * 100;
                            normalizedUnit = 'ml';
                        } else {
                            normalized = selectedItem.price / selectedItem.size;
                            normalizedUnit = selectedItem.unit;
                        }
                    } else {
                        normalized = selectedItem.price;
                        normalizedUnit = selectedItem.unit;
                    }
                } else {
                    const conv = findConversionByName(conversionMap, selectedItem.name);
                    if (conv && conv.packetSize) {
                        const basePrice = (conv.lastPrice !== null && conv.lastPrice !== undefined && conv.lastPrice !== '')
                            ? conv.lastPrice
                            : selectedItem.price;
                        const pu = (conv.packetUnit || '').trim().toLowerCase();
                        if (['g', 'ｇ'].includes(pu)) {
                            normalized = (basePrice / conv.packetSize) * 1000;
                            normalizedUnit = 'g';
                        } else if (['kg', 'ｋｇ'].includes(pu)) {
                            normalized = basePrice / conv.packetSize;
                            normalizedUnit = 'g';
                        } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(pu)) {
                            normalized = (basePrice / conv.packetSize) * 1000;
                            normalizedUnit = 'ml';
                        } else if (['l', 'ｌ'].includes(pu)) {
                            normalized = basePrice / conv.packetSize;
                            normalizedUnit = 'ml';
                        } else if (['cl', 'ｃｌ'].includes(pu)) {
                            normalized = (basePrice / conv.packetSize) * 100;
                            normalizedUnit = 'ml';
                        } else {
                            normalized = basePrice / conv.packetSize;
                            normalizedUnit = conv.packetUnit;
                        }
                    } else {
                        normalized = selectedItem.price;
                        normalizedUnit = selectedItem.unit;
                    }
                }

                newItem.purchaseCost = Math.round(normalized * 100) / 100;
                if (type === 'flour') {
                    newItem.unit = 'g';
                } else if (normalizedUnit) {
                    newItem.unit = normalizedUnit;
                }
            }

            const mappedCategory = normalizeItemCategory(
                selectedItem.itemCategory ?? selectedItem.item_category ?? findConversionByName(conversionMap, selectedItem.name)?.itemCategory
            );
            if (mappedCategory) {
                const updatedItem = applyCategoryTax(newItem, mappedCategory);
                Object.assign(newItem, updatedItem);
            }

            const qty = parseFloat(newItem.quantity);
            const pCost = parseFloat(newItem.purchaseCost);
            if (!isNaN(qty) && !isNaN(pCost)) {
                const convForYield = findConversionByName(conversionMap, newItem.name);
                const yieldRate = getYieldRate(newItem, convForYield);
                const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                const u = (newItem.unit || '').trim().toLowerCase();
                let cost = 0;
                if (u === 'g' || u === 'ｇ' || u === 'ml' || u === 'ｍｌ' || u === 'cc' || u === 'ｃｃ') {
                    cost = (qty / 1000) * pCost;
                } else if (u === 'cl' || u === 'ｃｌ') {
                    cost = (qty * 10 / 1000) * pCost;
                } else {
                    cost = qty * pCost;
                }
                newItem.cost = Math.round(((cost / safeYieldRate) * 100)) / 100;
            }

            items[index] = newItem;
            return { ...prev, [field]: items };
        });
    };

    const activeItem = conversionModal.isOpen && conversionModal.index !== null
        ? (conversionModal.type === 'flour'
            ? formData.flours[conversionModal.index]
            : formData.breadIngredients[conversionModal.index])
        : null;

    return (
        <div className="bread-form">
            <Card className="mb-md bread-card" style={{ position: 'relative', zIndex: 10 }}>
                <div className="bread-header">
                    <h3>粉グループ (Total: {totalFlour}g)</h3>
                    <span className="bread-badge">Base (100%)</span>
                </div>

                <div className="recipe-scroll-wrapper">
                    <div className="recipe-list-header recipe-list-header--bread">
                        <span></span> {/* Handle */}
                        <span>粉の種類</span>
                        <span>数量</span>
                        <span>単位</span>
                        <span className="text-center">%</span>
                        <span style={{ textAlign: 'center' }}>仕入れ</span>
                        <span style={{ textAlign: 'center' }}>原価</span>
                        <span style={{ textAlign: 'center' }} title="税率10%">10%</span>
                        <span></span>
                    </div>

                    <div className="bread-grid-body">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                            id="flours-dnd"
                        >
                            <SortableContext
                                items={formData.flours || []}
                                strategy={verticalListSortingStrategy}
                            >
                                {(formData.flours || []).map((item, i) => {
                                    const convForYield = findConversionByName(conversionMap, item?.name);
                                    const yieldPercentApplied = normalizeYieldPercent(
                                        convForYield?.yieldPercent ?? convForYield?.yield_percent ?? item?.yieldPercent ?? item?.yield_percent
                                    );

                                    return (
                                        <FlourItem
                                            key={item.id}
                                            id={item.id}
                                            index={i}
                                            item={item}
                                            yieldPercentApplied={yieldPercentApplied}
                                            onChange={handleFlourChange}
                                            onRemove={removeFlour}
                                            onSelect={handleAutocompleteSelect}
                                            calculatePercentage={calculatePercentage}
                                            floursLength={(formData.flours || []).length}
                                            onOpenConversion={() => setConversionModal({ isOpen: true, type: 'flour', index: i })}
                                        />
                                    );
                                })}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addFlour} block style={{ marginTop: '0.5rem' }}>+ 粉を追加</Button>
            </Card >

            <Card className="mb-md bread-card" style={{ position: 'relative', zIndex: 5 }}>
                <div className="bread-header">
                    <h3>その他材料</h3>
                    <span className="bread-subtitle">Water, Salt, Yeast, etc.</span>
                </div>

                <div className="recipe-scroll-wrapper">
                    <div className="recipe-list-header recipe-list-header--bread">
                        <span></span> {/* Handle */}
                        <span>材料名</span>
                        <span>数量</span>
                        <span>単位</span>
                        <span className="text-center">%</span>
                        <span style={{ textAlign: 'center' }}>仕入れ</span>
                        <span style={{ textAlign: 'center' }}>原価</span>
                        <span style={{ textAlign: 'center' }} title="税率10%">10%</span>
                        <span></span>
                    </div>

                    <div className="bread-grid-body">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                            id="breadIngredients-dnd"
                        >
                            <SortableContext
                                items={formData.breadIngredients || []}
                                strategy={verticalListSortingStrategy}
                            >
                                {(formData.breadIngredients || []).map((item, i) => {
                                    const convForYield = findConversionByName(conversionMap, item?.name);
                                    const yieldPercentApplied = normalizeYieldPercent(
                                        convForYield?.yieldPercent ?? convForYield?.yield_percent ?? item?.yieldPercent ?? item?.yield_percent
                                    );

                                    return (
                                        <BreadIngredientItem
                                            key={item.id}
                                            id={item.id}
                                            index={i}
                                            item={item}
                                            yieldPercentApplied={yieldPercentApplied}
                                            onChange={handleIngredientChange}
                                            onRemove={removeIngredient}
                                            onSelect={handleAutocompleteSelect}
                                            calculatePercentage={calculatePercentage}
                                            onOpenConversion={() => setConversionModal({ isOpen: true, type: 'ingredient', index: i })}
                                        />
                                    );
                                })}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addIngredient} block style={{ marginTop: '0.5rem' }}>+ 材料を追加</Button>
            </Card >
            <div style={{ textAlign: 'center', marginTop: '1rem', marginBottom: '2rem' }}>
                <Button variant="secondary" onClick={() => window.history.back()} style={{ width: '120px' }}>閉じる</Button>
            </div>

            {/* Conversion Modal */}
            <UnitConversionModal
                isOpen={conversionModal.isOpen}
                onClose={() => setConversionModal({ isOpen: false, type: null, index: null })}
                onApply={handleConversionApply}
                ingredientName={activeItem?.name || ''}
                currentCost={activeItem?.purchaseCost}
                currentQuantity={activeItem?.quantity}
                unit={activeItem?.unit || 'g'}
                initialPurchaseCost={activeItem?.purchase_cost}
                initialContentAmount={activeItem?.content_amount}
            />
        </div>
    );
};

// Wrapper for Sortable Hook (Flour Items)
const FlourItem = ({ id, index, item, yieldPercentApplied, onChange, onRemove, onSelect, calculatePercentage, floursLength, onOpenConversion }) => {
    const itemCategory = normalizeItemCategory(item.itemCategory ?? item.item_category);
    const hasCategoryTaxRule = Boolean(itemCategory);
    const categoryLabel = ITEM_CATEGORY_LABELS[itemCategory] || 'カテゴリ';
    const taxLabel = hasCategoryTaxRule ? `${categoryLabel}（${isTax10Category(itemCategory) ? '10%' : '8%'}）` : '';

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto'
    };

    return (
        <div ref={setNodeRef} style={style} className="form-ingredient-row--bread">
            <div
                {...attributes}
                {...listeners}
                className="ingredient-drag-handle"
                style={{
                    cursor: 'grab',
                    padding: '0 0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ccc',
                    height: '100%',
                    touchAction: 'none'
                }}
            >
                ⋮⋮
            </div>
            <div className="ingredient-name">
                <AutocompleteInput
                    value={item.name}
                    onChange={(e) => onChange(index, 'name', e.target.value)}
                    onSelect={(selectedItem) => onSelect('flour', index, selectedItem)}
                    placeholder="例: 強力粉"
                />
            </div>
            <div className="ingredient-qty">
                <Input
                    type="number"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => onChange(index, 'quantity', e.target.value)}
                    placeholder="0"
                    wrapperClassName="input-group--no-margin"
                />
            </div>
            <div className="ingredient-unit">
                <Input
                    value={item.unit}
                    onChange={(e) => onChange(index, 'unit', e.target.value)}
                    placeholder="単位"
                    style={{ width: '100%', textAlign: 'center' }}
                    wrapperClassName="input-group--no-margin"
                />
            </div>
            <div className="bread-percent">
                {calculatePercentage(item.quantity)}%
            </div>
            <div className="ingredient-cost" style={{ position: 'relative' }}>
                <Input
                    type="number"
                    step="any"
                    value={item.purchaseCost || ''}
                    onChange={(e) => onChange(index, 'purchaseCost', e.target.value)}
                    placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '', paddingRight: '20px' }}
                    min="0"
                    title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
                    wrapperClassName="input-group--no-margin"
                />
                <button
                    type="button"
                    onClick={onOpenConversion}
                    style={{
                        position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: '1rem', padding: '0 4px', lineHeight: 1
                    }}
                    title="原価計算アシスト"
                >
                    🧮
                </button>
                {item.purchaseCostRef && (
                    <div style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all' }}>
                        ¥{item.purchaseCostRef} {item.vendorRef && `(${item.vendorRef})`}
                    </div>
                )}
            </div>

            <div className="ingredient-cost">
                <Input
                    type="number"
                    step="any"
                    value={item.cost || ''}
                    onChange={(e) => onChange(index, 'cost', e.target.value)}
                    placeholder="原価"
                    style={{ width: '100%' }}
                    min="0"
                    wrapperClassName="input-group--no-margin"
                />
                {Number.isFinite(toFiniteNumber(yieldPercentApplied)) && toFiniteNumber(yieldPercentApplied) < 99.999 && (
                    <div
                        style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all', textAlign: 'center' }}
                        title="歩留まり（可食率）を適用中"
                    >
                        歩留まり: {(() => {
                            const raw = toFiniteNumber(yieldPercentApplied);
                            const rounded = Math.round(raw * 10) / 10;
                            return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}%`;
                        })()}
                    </div>
                )}
            </div>
            <div className="ingredient-alcohol" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={item.isAlcohol || false}
                    onChange={(e) => onChange(index, 'isAlcohol', e.target.checked)}
                    disabled={hasCategoryTaxRule}
                    style={{ cursor: hasCategoryTaxRule ? 'not-allowed' : 'pointer' }}
                    title={hasCategoryTaxRule ? `${taxLabel}で自動判定` : '税率10%のときにチェック'}
                />
            </div>
            <div className="remove-button-cell">
                {floursLength > 1 && (
                    <button type="button" className="icon-btn-delete" onClick={() => onRemove(index)}>✕</button>
                )}
            </div>
        </div >
    );
};

// Wrapper for Sortable Hook (Bread Ingredients)
const BreadIngredientItem = ({ id, index, item, yieldPercentApplied, onChange, onRemove, onSelect, calculatePercentage, onOpenConversion }) => {
    const itemCategory = normalizeItemCategory(item.itemCategory ?? item.item_category);
    const hasCategoryTaxRule = Boolean(itemCategory);
    const categoryLabel = ITEM_CATEGORY_LABELS[itemCategory] || 'カテゴリ';
    const taxLabel = hasCategoryTaxRule ? `${categoryLabel}（${isTax10Category(itemCategory) ? '10%' : '8%'}）` : '';

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto'
    };

    return (
        <div ref={setNodeRef} style={style} className="form-ingredient-row--bread">
            <div
                {...attributes}
                {...listeners}
                className="ingredient-drag-handle"
                style={{
                    cursor: 'grab',
                    padding: '0 0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ccc',
                    height: '100%',
                    touchAction: 'none'
                }}
            >
                ⋮⋮
            </div>
            <div className="ingredient-name">
                <AutocompleteInput
                    value={item.name}
                    onChange={(e) => onChange(index, 'name', e.target.value)}
                    onSelect={(selectedItem) => onSelect('ingredient', index, selectedItem)}
                    placeholder="例: 塩"
                />
            </div>
            <div className="ingredient-qty">
                <Input
                    type="number"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => onChange(index, 'quantity', e.target.value)}
                    placeholder="0"
                    wrapperClassName="input-group--no-margin"
                />
            </div>
            <div className="ingredient-unit">
                <Input
                    value={item.unit}
                    onChange={(e) => onChange(index, 'unit', e.target.value)}
                    placeholder="単位"
                    style={{ width: '100%', textAlign: 'center' }}
                    wrapperClassName="input-group--no-margin"
                />
            </div>
            <div className="bread-percent">
                {calculatePercentage(item.quantity)}%
            </div>
            <div className="ingredient-cost" style={{ position: 'relative' }}>
                <Input
                    type="number"
                    step="any"
                    value={item.purchaseCost || ''}
                    onChange={(e) => onChange(index, 'purchaseCost', e.target.value)}
                    placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '', paddingRight: '20px' }}
                    min="0"
                    title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
                    wrapperClassName="input-group--no-margin"
                />
                <button
                    type="button"
                    onClick={onOpenConversion}
                    style={{
                        position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: '1rem', padding: '0 4px', lineHeight: 1
                    }}
                    title="原価計算アシスト"
                >
                    🧮
                </button>
                {item.purchaseCostRef && (
                    <div style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all' }}>
                        ¥{item.purchaseCostRef} {item.vendorRef && `(${item.vendorRef})`}
                    </div>
                )}
            </div>

            <div className="ingredient-cost">
                <Input
                    type="number"
                    step="any"
                    value={item.cost || ''}
                    onChange={(e) => onChange(index, 'cost', e.target.value)}
                    placeholder="原価"
                    style={{ width: '100%' }}
                    min="0"
                    wrapperClassName="input-group--no-margin"
                />
                {Number.isFinite(toFiniteNumber(yieldPercentApplied)) && toFiniteNumber(yieldPercentApplied) < 99.999 && (
                    <div
                        style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all', textAlign: 'center' }}
                        title="歩留まり（可食率）を適用中"
                    >
                        歩留まり: {(() => {
                            const raw = toFiniteNumber(yieldPercentApplied);
                            const rounded = Math.round(raw * 10) / 10;
                            return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}%`;
                        })()}
                    </div>
                )}
            </div>
            <div className="ingredient-alcohol" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={item.isAlcohol || false}
                    onChange={(e) => onChange(index, 'isAlcohol', e.target.checked)}
                    disabled={hasCategoryTaxRule}
                    style={{ cursor: hasCategoryTaxRule ? 'not-allowed' : 'pointer' }}
                    title={hasCategoryTaxRule ? `${taxLabel}で自動判定` : '税率10%のときにチェック'}
                />
            </div>
            <div className="remove-button-cell">
                <button type="button" className="icon-btn-delete" onClick={() => onRemove(index)}>✕</button>
            </div>
        </div >
    );
};
