import React, { useState, useEffect } from 'react';
import {
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    useDroppable,
    DragOverlay,
    defaultDropAnimationSideEffects,
    pointerWithin
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import UnitConversionModal from './UnitConversionModal';
import { unitConversionService } from '../services/unitConversionService';
import { ingredientSearchService } from '../services/ingredientSearchService';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';

import { AutocompleteInput } from './AutocompleteInput';

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
    return safeBase / safePacketSize;
};

const calculateCostByUnit = (quantity, purchaseCost, unit, yieldRate = 1) => {
    const qty = toFiniteNumber(quantity);
    const pCost = toFiniteNumber(purchaseCost);
    if (!Number.isFinite(qty) || !Number.isFinite(pCost)) return NaN;

    const normalizedUnit = String(unit || '').trim().toLowerCase();
    let base = 0;
    if (['g', 'ｇ', 'ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(normalizedUnit)) {
        base = (qty / 1000) * pCost;
    } else {
        base = qty * pCost;
    }
    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
    return base / safeYieldRate;
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

// --- Sortable Item Component ---
const SortableIngredientItem = React.memo(({
    id,
    index,
    item,
    groupId,
    yieldPercentApplied,
    onChange,
    onRemove,
    handleSuggestionSelect,
    onOpenConversion,
}) => {
    const itemCategory = normalizeItemCategory(item.itemCategory ?? item.item_category);
    const hasCategoryTaxRule = Boolean(itemCategory);
    const categoryLabel = ITEM_CATEGORY_LABELS[itemCategory] || 'カテゴリ';
    const taxLabel = hasCategoryTaxRule ? `${categoryLabel}（${isTax10Category(itemCategory) ? '10%' : '8%'}）` : '';
    const checkedTax10 = hasCategoryTaxRule ? isTax10Category(itemCategory) : Boolean(item.isAlcohol);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id, data: { groupId, index } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} className="form-ingredient-row">
            <div
                {...attributes}
                {...listeners}
                className="ingredient-drag-handle"
                style={{ cursor: 'grab', padding: '0 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', touchAction: 'none' }}
            >
                ⋮⋮
            </div>

            <div className="ingredient-name">
                <AutocompleteInput
                    value={item.name}
                    onChange={(e) => onChange(groupId, index, 'name', e.target.value)}
                    onSelect={(selectedItem) => handleSuggestionSelect(groupId, index, selectedItem)}
                    placeholder="材料名"
                />
            </div>

            <div className="ingredient-qty">
                <Input
                    value={item.quantity}
                    onChange={(e) => onChange(groupId, index, 'quantity', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%' }}
                    wrapperClassName="input-group--no-margin"
                />
            </div>
            <div className="ingredient-unit">
                <Input
                    value={item.unit}
                    onChange={(e) => onChange(groupId, index, 'unit', e.target.value)}
                    placeholder="単位"
                    style={{ width: '100%' }}
                    wrapperClassName="input-group--no-margin"
                />
            </div>
            <div className="ingredient-cost" style={{ position: 'relative' }}>
                <Input
                    type="number"
                    value={item.purchaseCost}
                    onChange={(e) => onChange(groupId, index, 'purchaseCost', e.target.value)}
                    step="0.01"
                    placeholder={item.purchaseCostRef ? "Ref" : ""}
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '', paddingRight: '20px' }}
                    title={item.purchaseCostRef ? `参考: ¥${item.purchaseCostRef}${item.vendorRef ? ` (${item.vendorRef})` : ''}` : "No data"}
                    wrapperClassName="input-group--no-margin"
                />
                <button
                    type="button"
                    className="ingredient-cost-conversion-btn"
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
                    <div className="ingredient-cost-ref" style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all', textAlign: 'center' }}>
                        ¥{item.purchaseCostRef}
                    </div>
                )}
            </div>
            <div className="ingredient-cost">
                <Input
                    type="number"
                    step="0.01"
                    value={item.cost}
                    onChange={(e) => onChange(groupId, index, 'cost', e.target.value)}
                    placeholder=""
                    style={{ width: '100%' }}
                    wrapperClassName="input-group--no-margin"
                />
                {Number.isFinite(toFiniteNumber(yieldPercentApplied)) && toFiniteNumber(yieldPercentApplied) < 99.999 && (
                    <div
                        className="ingredient-yield-indicator"
                        style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', textAlign: 'center' }}
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
                    checked={checkedTax10}
                    onChange={(e) => onChange(groupId, index, 'isAlcohol', e.target.checked)}
                    disabled={hasCategoryTaxRule}
                    style={{ cursor: hasCategoryTaxRule ? 'not-allowed' : 'pointer' }}
                    title={hasCategoryTaxRule ? `${taxLabel}で自動判定` : '税率10%のときにチェック'}
                />
            </div>
            <div className="remove-button-cell">
                <button type="button" className="icon-btn-delete" onClick={() => onRemove(groupId, index)}>✕</button>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function for performance
    // Only re-render if item props changed deeply or index/groupId changed
    // Simple deep comparison for 'item' object is expensive, so check keys
    return (
        prevProps.id === nextProps.id &&
        prevProps.index === nextProps.index &&
        prevProps.groupId === nextProps.groupId &&
        prevProps.yieldPercentApplied === nextProps.yieldPercentApplied &&
        JSON.stringify(prevProps.item) === JSON.stringify(nextProps.item)
    );
});

// --- Sortable Section Component ---
const SortableSection = ({ section, sections, onSectionChange, onRemoveSection, children }) => {
    const { setNodeRef } = useDroppable({ id: section.id });

    return (
        <Card className="ingredient-section mb-md" style={{ border: '1px solid #e0e0e0', boxShadow: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid #f0f0f0', paddingBottom: '0.5rem' }}>
                <Input
                    value={section.name}
                    onChange={(e) => onSectionChange(section.id, e.target.value)}
                    placeholder="グループ名 (例: ソース)"
                    className="section-header-input"
                    style={{ fontWeight: 'bold', border: 'none', background: 'transparent', fontSize: '1.05rem', padding: '4px', width: '70%' }}
                />

                <div style={{ display: 'flex', gap: '8px' }}>
                    {sections.length > 1 && (
                        <button type="button" onClick={() => onRemoveSection(section.id)} className="group-delete-btn">
                            グループ削除
                        </button>
                    )}
                </div>
            </div>

            <div className="recipe-list-header" style={{ marginBottom: '0.5rem' }}>
                <span></span>
                <span>材料名</span>
                <span>分量</span>
                <span>単位</span>
                <span style={{ textAlign: 'center' }}>仕入れ</span>
                <span style={{ textAlign: 'center' }}>原価</span>
                <span style={{ textAlign: 'center' }} title="税率10%">10%</span>
                <span></span>
            </div>

            <div ref={setNodeRef} className="section-ingredients-list" style={{ minHeight: '50px', transition: 'min-height 0.2s', paddingBottom: '10px' }}>
                {children}
                {section.items.length === 0 && (
                    <div className="recipe-form-drop-placeholder" style={{ padding: '10px', textAlign: 'center', color: '#aaa', fontSize: '0.85rem', border: '1px dashed #ddd', borderRadius: '4px' }}>
                        ここに材料をドロップ
                    </div>
                )}
            </div>
        </Card>
    );
};


export const RecipeFormIngredients = ({ formData, setFormData, priceList }) => {
    // Unit Conversion Cache
    const [conversionMap, setConversionMap] = useState(new Map());

    useEffect(() => {
        unitConversionService.getAllConversions().then(map => setConversionMap(map));
    }, []);

    // Helper Modal State
    const [conversionModal, setConversionModal] = useState({
        isOpen: false,
        groupId: null,
        index: null
    });

    // Initialize sections from formData
    // We expect formData to have ingredientSections OR we build it from ingredients/ingredientGroups
    useEffect(() => {
        if (!formData.ingredientSections) {
            // Build initial sections
            const groups = formData.ingredientGroups || [{ id: 'default', name: '材料' }];
            const items = formData.ingredients || [];

            const initialSections = groups.map(g => ({
                id: g.id,
                name: g.name,
                items: items.filter(i => {
                    if (g.id === 'default' && !i.groupId) return true;
                    return i.groupId === g.id;
                })
            }));

            // Handle orphaned items if any (legacy safety)
            const accountedIds = new Set(initialSections.flatMap(s => s.items.map(i => i.id)));
            const orphans = items.filter(i => !accountedIds.has(i.id));
            if (orphans.length > 0) {
                if (initialSections.length > 0) {
                    initialSections[0].items.push(...orphans);
                } else {
                    initialSections.push({ id: 'default', name: '材料', items: orphans });
                }
            }

            // If completely empty
            if (initialSections.length === 0) {
                initialSections.push({ id: crypto.randomUUID(), name: '材料', items: [] });
            }

            setFormData(prev => ({ ...prev, ingredientSections: initialSections }));
        }
    }, [formData.ingredients, formData.ingredientGroups, formData.ingredientSections, setFormData]);

    const sections = formData.ingredientSections || [];

    useEffect(() => {
        if (!formData.ingredientSections || formData.ingredientSections.length === 0 || conversionMap.size === 0) {
            return;
        }

        let hasChanges = false;
        const nextSections = formData.ingredientSections.map((section) => {
            const nextItems = section.items.map((item) => {
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
                        const recalculatedCost = calculateCostByUnit(item.quantity, roundedPurchaseCost, item.unit, yieldRate);
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

                // Apply yield (歩留まり) to auto-calculated costs when we can safely infer the item
                // was previously calculated without it (e.g. conversionMap just loaded).
                const yieldRate = getYieldRate(item, conv);
                if (Number.isFinite(yieldRate) && yieldRate > 0 && Math.abs(yieldRate - 1) > 0.0001) {
                    const expectedWithYield = calculateCostByUnit(item.quantity, nextItem.purchaseCost, item.unit, yieldRate);
                    const expectedWithoutYield = calculateCostByUnit(item.quantity, nextItem.purchaseCost, item.unit, 1);
                    const currentCost = toFiniteNumber(nextItem.cost);

                    const shouldUpdateCost =
                        Number.isFinite(expectedWithYield) && (
                            !Number.isFinite(currentCost) ||
                            (Number.isFinite(expectedWithoutYield) && Math.abs(currentCost - expectedWithoutYield) <= 0.01)
                        );

                    if (shouldUpdateCost) {
                        const rounded = Math.round(expectedWithYield * 100) / 100;
                        const existing = toFiniteNumber(nextItem.cost);
                        if (!Number.isFinite(existing) || Math.abs(existing - rounded) > 0.01) {
                            nextItem = { ...nextItem, cost: rounded };
                        }
                    }
                }

                if (nextItem !== item) {
                    hasChanges = true;
                }
                return nextItem;
            });

            return nextItems !== section.items ? { ...section, items: nextItems } : section;
        });

        if (!hasChanges) return;
        setFormData((prev) => ({ ...prev, ingredientSections: nextSections }));
    }, [conversionMap, formData.ingredientSections, setFormData]);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragOver = ({ active, over }) => {
        if (!over) return;
        const activeId = active.id;
        const overId = over.id;

        // Find which section the items belong to
        const activeSection = sections.find(s => s.items.some(i => i.id === activeId));
        const overSection = sections.find(s => s.items.some(i => i.id === overId)) || sections.find(s => s.id === overId); // over could be container or item

        if (!activeSection || !overSection || activeSection === overSection) {
            return;
        }

        // Moving between containers
        setFormData(prev => {
            const activeItems = activeSection.items;
            const overItems = overSection.items;
            const activeIndex = activeItems.findIndex(i => i.id === activeId);
            const overIndex = overItems.findIndex(i => i.id === overId);

            let newIndex;
            if (overId === overSection.id) {
                // Dropped on container
                newIndex = overItems.length + 1;
            } else {
                const isBelowOverItem =
                    over &&
                    active.rect.current.translated &&
                    active.rect.current.translated.top > over.rect.top + over.rect.height;
                const modifier = isBelowOverItem ? 1 : 0;
                newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
            }

            return {
                ...prev,
                ingredientSections: prev.ingredientSections.map(s => {
                    if (s.id === activeSection.id) {
                        return { ...s, items: activeItems.filter(i => i.id !== activeId) };
                    }
                    if (s.id === overSection.id) {
                        return {
                            ...s,
                            items: [
                                ...overItems.slice(0, newIndex),
                                activeItems[activeIndex],
                                ...overItems.slice(newIndex, overItems.length)
                            ]
                        };
                    }
                    return s;
                })
            };
        });
    };

    const handleDragEnd = ({ active, over }) => {
        if (!over) return;
        const activeId = active.id;
        const overId = over.id;

        const activeSection = sections.find(s => s.items.some(i => i.id === activeId));
        const overSection = sections.find(s => s.items.some(i => i.id === overId)) || sections.find(s => s.id === overId);

        if (activeSection && overSection && activeSection === overSection) {
            const activeIndex = activeSection.items.findIndex(i => i.id === activeId);
            const overIndex = overSection.items.findIndex(i => i.id === overId);
            if (activeIndex !== overIndex) {
                setFormData(prev => ({
                    ...prev,
                    ingredientSections: prev.ingredientSections.map(s => {
                        if (s.id === activeSection.id) {
                            return { ...s, items: arrayMove(s.items, activeIndex, overIndex) };
                        }
                        return s;
                    })
                }));
            }
        }
    };

    const handleConversionApply = (normalizedCost, normalizedUnit, packetPrice, packetSize) => {
        const { groupId, index } = conversionModal;
        if (groupId !== null && index !== null) {
            setFormData(prev => {
                const newSections = prev.ingredientSections.map(s => {
                    if (s.id !== groupId) return s;

                    const newItems = [...s.items];
                    const newItem = {
                        ...newItems[index],
                        purchaseCost: normalizedCost,
                        unit: normalizedUnit,
                        purchase_cost: packetPrice, // Store raw
                        content_amount: packetSize  // Store raw
                    };

                    // Recalculate cost
                    const qty = parseFloat(newItem.quantity);
                    const pCost = parseFloat(normalizedCost);

                    if (!isNaN(qty) && !isNaN(pCost)) {
                        const conv = findConversionByName(conversionMap, newItem.name);
                        const yieldRate = getYieldRate(newItem, conv);
                        const u = normalizedUnit ? normalizedUnit.trim().toLowerCase() : '';
                        let baseCost = 0;
                        if (u === 'g' || u === 'ｇ' || u === 'ml' || u === 'ｍｌ' || u === 'cc' || u === 'ｃｃ') {
                            baseCost = (qty / 1000) * pCost;
                        } else {
                            baseCost = qty * pCost;
                        }
                        const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                        newItem.cost = Math.round((baseCost / safeYieldRate) * 100) / 100;
                    }

                    newItems[index] = newItem;
                    return { ...s, items: newItems };
                });

                // Reload conversions and invalidate search cache
                unitConversionService.getAllConversions().then(map => setConversionMap(map));
                ingredientSearchService.invalidateCache(); // Clear cache for fresh search

                return { ...prev, ingredientSections: newSections };
            });
        }
    };

    const activeItem = conversionModal.isOpen && conversionModal.groupId !== null && conversionModal.index !== null
        ? sections.find(s => s.id === conversionModal.groupId)?.items[conversionModal.index]
        : null;

    const handleItemChange = React.useCallback((groupId, index, field, value) => {
        setFormData(prev => {
            const newSections = prev.ingredientSections.map(s => {
                if (s.id !== groupId) return s;

                const newItems = [...s.items];
                const newItem = { ...newItems[index], [field]: value };
                newItems[index] = newItem;

                // Calculation Logic
                if (['quantity', 'purchaseCost', 'unit', 'name', 'isAlcohol'].includes(field)) {
                    // Cost Calc
                    const qty = parseFloat(newItem.quantity);
                    const pCost = parseFloat(newItem.purchaseCost);
                    const convForYield = findConversionByName(conversionMap, newItem.name);
                    const yieldRate = getYieldRate(newItem, convForYield);
                    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;

                    if (!isNaN(qty) && !isNaN(pCost)) {
                        let cost = 0;
                        const u = newItem.unit ? newItem.unit.trim().toLowerCase() : '';
                        // For weight/volume, purchaseCost is treated as per kg/L and qty is g/ml/cc.
                        if (u === 'g' || u === 'ｇ' || u === 'ml' || u === 'ｍｌ' || u === 'cc' || u === 'ｃｃ') {
                            // Keep decimals, round to 2 places for storage if preferred, or keep raw
                            // User asked for 2 decimal places input. Calculation should arguably follow suit or standard yen rounding?
                            // Usually yen is integer, but for internal calc... let's keep precision then round?
                            // Plan said: "Change cost display from Integer to 2 decimal places"
                            // Let's store as float.
                            cost = ((qty / 1000) * pCost);
                        } else {
                            cost = (qty * pCost);
                        }

                        // Rounding strategy: formatted string or number?
                        // Let's round to 2 decimals for the field value to avoid long floats
                        const roundedCost = Math.round(((cost / safeYieldRate) * 100)) / 100;

                        if (roundedCost !== newItem.cost) {
                            newItem.cost = roundedCost;
                            newItems[index] = newItem;
                        }
                    }
                }

                // Name Lookup Logic
                if (field === 'name') {
                    const refData = priceList.get(normalizeIngredientKey(value));
                    const conv = findConversionByName(conversionMap, value);

                    // Apply category-driven tax immediately even if this name is not in CSV price list.
                    const matchedCategory = normalizeItemCategory(conv?.itemCategory);
                    if (matchedCategory) {
                        const updatedItem = applyCategoryTax(newItem, matchedCategory);
                        Object.assign(newItem, updatedItem);
                    } else if (!refData) {
                        newItem.itemCategory = null;
                    }

                    if (refData) {
                        const price = typeof refData === 'object' ? refData.price : refData;
                        const vendor = typeof refData === 'object' ? refData.vendor : null;
                        const unit = typeof refData === 'object' ? refData.unit : null;
                        const size = typeof refData === 'object' ? refData.size : null;

                        newItem.purchaseCostRef = price;
                        newItem.vendorRef = vendor;

                        // Check for saved conversion
                        if (conv && conv.packetSize) {
                            // Prefer master lastPrice when available (CSV price may be pack total too)
                            const basePrice = (conv.lastPrice !== null && conv.lastPrice !== undefined && conv.lastPrice !== '')
                                ? conv.lastPrice
                                : price;
                            let normalized = 0;
                            const pu = (conv.packetUnit || '').trim().toLowerCase();
                            if (['g', 'ｇ'].includes(pu)) {
                                // price per kg, qty in g
                                normalized = (basePrice / conv.packetSize) * 1000;
                                newItem.unit = 'g';
                            } else if (['kg', 'ｋｇ'].includes(pu)) {
                                normalized = basePrice / conv.packetSize; // per kg
                                newItem.unit = 'g';
                            } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(pu)) {
                                // price per L, qty in ml/cc
                                normalized = (basePrice / conv.packetSize) * 1000;
                                newItem.unit = 'ml';
                            } else if (['l', 'ｌ'].includes(pu)) {
                                normalized = basePrice / conv.packetSize; // per L
                                newItem.unit = 'ml';
                            } else {
                                // For '個', '本' etc. -> per unit
                                normalized = basePrice / conv.packetSize;
                                newItem.unit = conv.packetUnit;
                            }
                            newItem.purchaseCost = Math.round(normalized * 100) / 100;
                        } else {
                            // No conversion map, but check master size for auto-calculation
                            let calculatedPrice = price;
                            let calculatedUnit = unit;

                            // If we have size and it's not a weight unit (which handled above ideally, but let's cover basic master data case)
                            // or if conversion map didn't catch it
                            if (size && size > 1) {
                                // If unit implies standard weights, normalize to kg price?
                                // Usually if unit is 'g', price is for 'size' grams.
                                // Logic for g/ml is: (price / size) * 1000 = Price per kg/L
                                if (['g', 'ｇ'].includes((unit || '').toLowerCase())) {
                                    calculatedPrice = (price / size) * 1000;
                                    calculatedUnit = 'g';
                                } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes((unit || '').toLowerCase())) {
                                    calculatedPrice = (price / size) * 1000;
                                    calculatedUnit = 'ml';
                                } else if (['kg', 'ｋｇ'].includes(unit ? unit.toLowerCase() : '')) {
                                    calculatedPrice = price / size;
                                    calculatedUnit = 'g';
                                } else if (['l', 'ｌ'].includes(unit ? unit.toLowerCase() : '')) {
                                    calculatedPrice = price / size;
                                    calculatedUnit = 'ml';
                                } else {
                                    // For '個', '枚' etc. -> Calculate Unit Price
                                    calculatedPrice = price / size;
                                }
                            }

                            if (!newItem.purchaseCost) newItem.purchaseCost = Math.round(calculatedPrice * 100) / 100;
                            if (!newItem.unit && calculatedUnit) newItem.unit = calculatedUnit;
                        }

                        // Re-calc cost after autofill
                        const qty = parseFloat(newItem.quantity);
                        const pCost = parseFloat(newItem.purchaseCost);
                        if (!isNaN(qty) && !isNaN(pCost)) {
                            const convForYield = findConversionByName(conversionMap, newItem.name);
                            const yieldRate = getYieldRate(newItem, convForYield);
                            const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                            const u = newItem.unit ? newItem.unit.trim().toLowerCase() : '';
                            let cost = 0;
                            if (u === 'g' || u === 'ｇ' || u === 'ml' || u === 'ｍｌ' || u === 'cc' || u === 'ｃｃ') {
                                cost = (qty / 1000) * pCost;
                            } else {
                                cost = qty * pCost;
                            }
                            newItem.cost = Math.round(((cost / safeYieldRate) * 100)) / 100;
                        }
                    } else {
                        newItem.purchaseCostRef = null;
                        newItem.vendorRef = null;
                    }
                    newItems[index] = newItem;
                }

                return { ...s, items: newItems };
            });
            return { ...prev, ingredientSections: newSections };
        });
    }, [conversionMap, priceList, setFormData]);

    const handleSuggestionSelect = React.useCallback((groupId, index, item) => {
        // Apply selected item details
        setFormData(prev => {
            const newSections = prev.ingredientSections.map(s => {
                if (s.id !== groupId) return s;

                const newItems = [...s.items];
                const newItem = { ...newItems[index] };

                // Set Name
                newItem.name = item.name;
                newItem.itemCategory = null;

                // Set Price & Unit
                // Logic adapted from handleItemChange but using the selected item directly
                if (item.price) {
                    newItem.purchaseCostRef = item.price;
                    newItem.vendorRef = item.source === 'csv' ? 'CSV' : 'Master';

                    if (item.source === 'manual') {
                        // Calculate normalized cost if size is available
                        if (item.size && item.size > 0) {
                            const u = (item.unit || '').trim().toLowerCase();
                            if (['g', 'ｇ'].includes(u)) {
                                const normalized = (item.price / item.size) * 1000; // per kg
                                newItem.purchaseCost = Math.round(normalized * 100) / 100;
                                newItem.unit = 'g';
                            } else if (['kg', 'ｋｇ'].includes(u)) {
                                const normalized = item.price / item.size; // per kg
                                newItem.purchaseCost = Math.round(normalized * 100) / 100;
                                newItem.unit = 'g';
                            } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(u)) {
                                const normalized = (item.price / item.size) * 1000; // per L
                                newItem.purchaseCost = Math.round(normalized * 100) / 100;
                                newItem.unit = 'ml';
                            } else if (['l', 'ｌ'].includes(u)) {
                                const normalized = item.price / item.size; // per L
                                newItem.purchaseCost = Math.round(normalized * 100) / 100;
                                newItem.unit = 'ml';
                            } else {
                                // For '個', '枚' etc. -> Calculate Unit Price
                                const unitPrice = item.price / item.size;
                                newItem.purchaseCost = Math.round(unitPrice * 100) / 100;
                                newItem.unit = item.unit;
                            }
                        } else {
                            newItem.purchaseCost = item.price;
                            newItem.unit = item.unit;
                        }

                    } else {
                        // For CSV Items, we need dynamic conversion access
                        // Since conversionMap in useCallback dependency might be stale or cause excessive re-creation,
                        // we can access the CURRENT conversionMap via a ref or just rely on the one in scope and list it as dependency.
                        // Ideally, we should fetch fresh conversion if needed, but the map is stable enough.
                        // Assuming conversionMap is in dependency (handled by React.useCallback deps)

                        const conv = findConversionByName(conversionMap, item.name);
                        if (conv && conv.packetSize) {
                            const basePrice = (conv.lastPrice !== null && conv.lastPrice !== undefined && conv.lastPrice !== '')
                                ? conv.lastPrice
                                : item.price;
                            let normalized = 0;
                            const pu = (conv.packetUnit || '').trim().toLowerCase();
                            if (['g', 'ｇ'].includes(pu)) {
                                normalized = (basePrice / conv.packetSize) * 1000; // per kg
                                newItem.unit = 'g';
                            } else if (['kg', 'ｋｇ'].includes(pu)) {
                                normalized = basePrice / conv.packetSize; // per kg
                                newItem.unit = 'g';
                            } else if (['ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(pu)) {
                                normalized = (basePrice / conv.packetSize) * 1000; // per L
                                newItem.unit = 'ml';
                            } else if (['l', 'ｌ'].includes(pu)) {
                                normalized = basePrice / conv.packetSize; // per L
                                newItem.unit = 'ml';
                            } else {
                                normalized = basePrice / conv.packetSize;
                                newItem.unit = conv.packetUnit;
                            }
                            newItem.purchaseCost = Math.round(normalized * 100) / 100;
                        } else {
                            // If csv item has basic size info we might want to use it too, typically CSV is per pack
                            newItem.purchaseCost = item.price;
                            newItem.unit = item.unit;
                        }
                    }
                }

                const mappedCategory = normalizeItemCategory(
                    item.itemCategory ?? item.item_category ?? findConversionByName(conversionMap, item.name)?.itemCategory
                );
                if (mappedCategory) {
                    const updatedItem = applyCategoryTax(newItem, mappedCategory);
                    Object.assign(newItem, updatedItem);
                }

                // Recalculate Cost
                const qty = parseFloat(newItem.quantity);
                const pCost = parseFloat(newItem.purchaseCost);
                if (!isNaN(qty) && !isNaN(pCost)) {
                    const convForYield = findConversionByName(conversionMap, newItem.name);
                    const yieldRate = getYieldRate(newItem, convForYield);
                    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;
                    const u = newItem.unit ? newItem.unit.trim().toLowerCase() : '';
                    let cost = 0;
                    if (u === 'g' || u === 'ｇ' || u === 'ml' || u === 'ｍｌ' || u === 'cc' || u === 'ｃｃ') {
                        cost = (qty / 1000) * pCost;
                    } else {
                        cost = qty * pCost;
                    }
                    newItem.cost = Math.round(((cost / safeYieldRate) * 100)) / 100;
                }

                newItems[index] = newItem;
                return { ...s, items: newItems };
            });
            return { ...prev, ingredientSections: newSections };
        });
    }, [conversionMap, setFormData]);

    const handleRemoveItem = React.useCallback((groupId, index) => {
        setFormData(prev => ({
            ...prev,
            ingredientSections: prev.ingredientSections.map(s => {
                if (s.id === groupId) {
                    return { ...s, items: s.items.filter((_, i) => i !== index) };
                }
                return s;
            })
        }));
    }, [setFormData]);

    const handleAddItem = (groupId) => {
        const newItem = { id: crypto.randomUUID(), name: '', quantity: '', unit: '', cost: '', purchaseCost: '', isAlcohol: false, itemCategory: null };
        setFormData(prev => ({
            ...prev,
            ingredientSections: prev.ingredientSections.map(s => {
                if (s.id === groupId) {
                    return { ...s, items: [...s.items, newItem] };
                }
                return s;
            })
        }));
    };

    const handleAddSection = () => {
        setFormData(prev => ({
            ...prev,
            ingredientSections: [...prev.ingredientSections, { id: crypto.randomUUID(), name: '新しいグループ', items: [] }]
        }));
    };

    const handleRemoveSection = (sectionId) => {
        setFormData(prev => ({
            ...prev,
            ingredientSections: prev.ingredientSections.filter(s => s.id !== sectionId)
        }));
    };

    const handleSectionNameChange = (sectionId, name) => {
        setFormData(prev => ({
            ...prev,
            ingredientSections: prev.ingredientSections.map(s => s.id === sectionId ? { ...s, name } : s)
        }));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="recipe-form-ingredients">
                {sections.map(section => (
                    <SortableContext key={section.id} id={section.id} items={section.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <SortableSection
                            section={section}
                            sections={sections}
                            onSectionChange={handleSectionNameChange}
                            onRemoveSection={handleRemoveSection}
                        >
                            {section.items.map((item, index) => (
                                (() => {
                                    const convForYield = findConversionByName(conversionMap, item?.name);
                                    const yieldPercentApplied = normalizeYieldPercent(
                                        convForYield?.yieldPercent ?? convForYield?.yield_percent ?? item?.yieldPercent ?? item?.yield_percent
                                    );

                                    return (
                                <SortableIngredientItem
                                    key={item.id}
                                    id={item.id}
                                    index={index}
                                    item={item}
                                    groupId={section.id}
                                    yieldPercentApplied={yieldPercentApplied}
                                    onChange={handleItemChange}
                                    onRemove={handleRemoveItem}
                                    handleSuggestionSelect={handleSuggestionSelect}
                                    onOpenConversion={() => setConversionModal({ isOpen: true, groupId: section.id, index: index })}
                                />
                                    );
                                })()
                            ))}
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => handleAddItem(section.id)}
                                style={{ width: '100%', marginTop: '0.5rem', borderStyle: 'dashed' }}
                            >
                                + 材料を追加
                            </Button>
                        </SortableSection>
                    </SortableContext>
                ))}

                <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddSection}
                    style={{ width: '100%', marginTop: '1rem', padding: '1rem' }}
                >
                    + 新しいグループを追加
                </Button>
            </div>

            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }) }}>
                {null /* Minimal overlay, or render item preview */}
            </DragOverlay>

            {/* Conversion Modal */}
            <UnitConversionModal
                isOpen={conversionModal.isOpen}
                onClose={() => setConversionModal({ isOpen: false, groupId: null, index: null })}
                onApply={handleConversionApply}
                ingredientName={activeItem?.name || ''}
                currentCost={activeItem?.purchaseCost}
                currentQuantity={activeItem?.quantity}
                unit={activeItem?.unit || 'g'}
                initialPurchaseCost={activeItem?.purchase_cost}
                initialContentAmount={activeItem?.content_amount}
            />
        </DndContext>
    );
};
