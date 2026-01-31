import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import './RecipeForm.css'; // Reuse basic styles
import './RecipeFormBread.css'; // Add specialized styles

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
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

export const RecipeFormBread = ({ formData, setFormData }) => {
    // Local state for calculation convenience, synced with parent formData
    // We expect formData to have 'flours' and 'breadIngredients' arrays
    // If not, we initialize them or map from existing ingredients

    // Price list cache
    const [priceList, setPriceList] = useState(new Map());
    const allIngredientNames = useMemo(() => Array.from(priceList.keys()), [priceList]);

    // Suggestions State
    const [activeSuggestion, setActiveSuggestion] = useState(null); // { type: 'flour'|'ingredient', index: number }
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);

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

    const handleFlourChange = (index, field, value) => {
        const newFlours = [...(formData.flours || [])];
        newFlours[index] = { ...newFlours[index], [field]: value };

        // Auto-lookup cost if name changes
        if (field === 'name') {
            // Suggestion logic
            if (value.trim()) {
                const matchVal = value.toLowerCase();
                const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                setFilteredSuggestions(matches.slice(0, 10));
                setActiveSuggestion({ type: 'flour', index });
            } else {
                setFilteredSuggestions([]);
                setActiveSuggestion(null);
            }

            const refData = priceList.get(value);
            if (refData) {
                const price = typeof refData === 'object' ? refData.price : refData;
                const vendor = typeof refData === 'object' ? refData.vendor : null;

                newFlours[index].purchaseCostRef = price;
                newFlours[index].vendorRef = vendor;

                // Check for saved conversion
                const conv = conversionMap.get(value);
                if (conv && conv.packetSize) {
                    // Normalize cost: Price / PacketSize (if unit is compatible)
                    // If conv has lastPrice, maybe use that? Or prefer current CSV price?
                    // Let's use CSV price as base because it's latest market rate,
                    // but apply the stored packet size conversation.
                    // If unit is 'g'/'ml', app expects cost per 1000 units.
                    // If packetUnit match 'g'/'ml', then (Price / Size) * 1000.
                    let normalized = 0;
                    if (['g', 'ml', 'cc', 'ｇ'].includes(conv.packetUnit)) {
                        normalized = (price / conv.packetSize) * 1000;
                    } else {
                        // per unit (e.g. per kg, per bottle)
                        // If app unit is 'g' but stored is 'kg'.
                        // Wait, RecipeFormBread assumes 'cost' is either per 1kg (if g) or per 1 unit.
                        // If stored unit is 'kg', 25kg bag.
                        // Price is for 25kg. Normalized should be per 1kg?
                        // Yes because 1kg = 1000g.
                        // If stored is 'kg', then Price / Size = cost per kg.
                        // Which matches cost per 1000g.
                        // So (Price / Size) is correct for 'kg' -> 'g'.
                        normalized = price / conv.packetSize;
                    }

                    newFlours[index].purchaseCost = Math.round(normalized * 100) / 100;
                    newFlours[index].unit = 'g'; // Default to g for flour
                } else if (!newFlours[index].purchaseCost) {
                    // No conversion, just raw price (maybe it's already per kg?)
                    newFlours[index].purchaseCost = price;
                }
            } else {
                newFlours[index].purchaseCostRef = null;
                newFlours[index].vendorRef = null;
            }
        }

        // Auto-Calc Cost logic (Cost = Qty * PurchaseCost)
        // Assumption: If unit is 'g' or 'ｇ', Purchase Cost is per 1kg (1000g).
        // Otherwise, simply Qty * PurchaseCost.
        if (['quantity', 'purchaseCost', 'name', 'isAlcohol'].includes(field) || field === 'name') {
            // Re-evaluate cost for this row
            // Note: 'value' is the NEW value for 'field'. But we already set it in newFlours[index].
            const item = newFlours[index];
            const qty = parseFloat(item.quantity);
            const pCost = parseFloat(item.purchaseCost);

            if (!isNaN(qty) && !isNaN(pCost)) {
                let calculated = 0;
                // Bread flours usually 'g'.
                if (item.unit === 'g' || item.unit === 'ｇ' || !item.unit) {
                    calculated = (qty / 1000) * pCost;
                } else {
                    calculated = qty * pCost;
                }
                // Round to 2 decimals
                const rounded = Math.round(calculated * 100) / 100;
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
            if (value.trim()) {
                const matchVal = value.toLowerCase();
                const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                setFilteredSuggestions(matches.slice(0, 10));
                setActiveSuggestion({ type: 'ingredient', index });
            } else {
                setFilteredSuggestions([]);
                setActiveSuggestion(null);
            }

            const refData = priceList.get(value);
            if (refData) {
                const price = typeof refData === 'object' ? refData.price : refData;
                const vendor = typeof refData === 'object' ? refData.vendor : null;

                newIngs[index].purchaseCostRef = price;
                newIngs[index].vendorRef = vendor;

                // Check for saved conversion
                const conv = conversionMap.get(value);
                if (conv && conv.packetSize) {
                    let normalized = 0;
                    // Logic:
                    // If PacketUnit is 'g'/'ml', Price is for X g. Normalized (per 1000g) = (Price/Size)*1000.
                    // If PacketUnit is 'kg'/'L', Price is for X kg. Normalized (per 1kg) = Price/Size.
                    // If PacketUnit is 'pcs'/'bag', Price is for X pcs. Normalized (per 1pc) = Price/Size.

                    if (['g', 'ml', 'cc', 'ｇ'].includes(conv.packetUnit)) {
                        normalized = (price / conv.packetSize) * 1000;
                        newIngs[index].unit = 'g';
                    } else if (['kg', 'l', 'ｋｇ'].includes(conv.packetUnit.toLowerCase())) {
                        normalized = price / conv.packetSize;
                        newIngs[index].unit = 'g'; // Assume kg -> g usage
                    } else {
                        // other units (pcs, packs)
                        normalized = price / conv.packetSize;
                        newIngs[index].unit = conv.packetUnit; // Use the unit (e.g. '個')
                    }

                    newIngs[index].purchaseCost = Math.round(normalized * 100) / 100;
                } else if (!newIngs[index].purchaseCost) {
                    newIngs[index].purchaseCost = price;
                }
            } else {
                newIngs[index].purchaseCostRef = null;
                newIngs[index].vendorRef = null;
            }
        }

        // Auto-Calc Cost logic
        if (['quantity', 'purchaseCost', 'name', 'isAlcohol'].includes(field) || field === 'name') {
            const item = newIngs[index];
            const qty = parseFloat(item.quantity);
            const pCost = parseFloat(item.purchaseCost);

            if (!isNaN(qty) && !isNaN(pCost)) {
                let calculated = 0;
                // Check unit
                const u = item.unit ? item.unit.trim().toLowerCase() : 'g'; // default to g for bread ings if empty?
                if (u === 'g' || u === 'ｇ') {
                    calculated = (qty / 1000) * pCost;
                } else {
                    calculated = qty * pCost;
                }
                // Round to 2 decimals
                const rounded = Math.round(calculated * 100) / 100;
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
            flours: [...(prev.flours || []), { id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '', isAlcohol: false }]
        }));
    };

    const addIngredient = () => {
        setFormData(prev => ({
            ...prev,
            breadIngredients: [...(prev.breadIngredients || []), { id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '', isAlcohol: false }]
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

    const handleSuggestionSelect = (type, index, name) => {
        if (type === 'flour') {
            handleFlourChange(index, 'name', name);
        } else {
            handleIngredientChange(index, 'name', name);
        }
        setActiveSuggestion(null);
        setFilteredSuggestions([]);
    };

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
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
            setFormData(prev => ({ ...prev, flours: [{ id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '' }] }));
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
            setFormData(prev => ({ ...prev, breadIngredients: [{ id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '' }] }));
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
                    item.cost = Math.round(calculated * 100) / 100;
                }
                newFlours[index] = item;
                // Reload conversions to update cache
                unitConversionService.getAllConversions().then(map => setConversionMap(map));
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
                    item.cost = Math.round(calculated * 100) / 100;
                }
                newIngs[index] = item;
                // Reload conversions
                unitConversionService.getAllConversions().then(map => setConversionMap(map));
                return { ...prev, breadIngredients: newIngs };
            }
            return prev;
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

                <div className="bread-scroll-wrapper">
                    <div className="bread-grid-header">
                        <span></span> {/* Handle */}
                        <span>粉の種類</span>
                        <span>重量 (g)</span>
                        <span className="text-center">%</span>
                        <span style={{ textAlign: 'center' }}>仕入れ</span>
                        <span style={{ textAlign: 'center' }}>原価</span>
                        <span style={{ textAlign: 'center' }}>酒</span>
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
                                {(formData.flours || []).map((item, i) => (
                                    <FlourItem
                                        key={item.id}
                                        id={item.id}
                                        index={i}
                                        item={item}
                                        onChange={handleFlourChange}
                                        onRemove={removeFlour}
                                        onSuggestionSelect={handleSuggestionSelect}
                                        activeSuggestion={activeSuggestion}
                                        filteredSuggestions={filteredSuggestions}
                                        setActiveSuggestion={setActiveSuggestion}
                                        setFilteredSuggestions={setFilteredSuggestions}
                                        handleSuggestionSelect={handleSuggestionSelect}
                                        allIngredientNames={allIngredientNames}
                                        calculatePercentage={calculatePercentage}
                                        floursLength={(formData.flours || []).length}
                                        onOpenConversion={() => setConversionModal({ isOpen: true, type: 'flour', index: i })}
                                    />
                                ))}
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

                <div className="bread-scroll-wrapper">


                    <div className="bread-grid-header">
                        <span></span> {/* Handle */}
                        <span>材料名</span>
                        <span>重量 (g)</span>
                        <span className="text-center">%</span>

                        <span style={{ textAlign: 'center' }}>仕入れ</span>
                        <span style={{ textAlign: 'center' }}>原価</span>
                        <span style={{ textAlign: 'center' }}>酒</span>
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
                                {(formData.breadIngredients || []).map((item, i) => (
                                    <BreadIngredientItem
                                        key={item.id}
                                        id={item.id}
                                        index={i}
                                        item={item}
                                        onChange={handleIngredientChange}
                                        onRemove={removeIngredient}
                                        onSuggestionSelect={handleSuggestionSelect}
                                        activeSuggestion={activeSuggestion}
                                        filteredSuggestions={filteredSuggestions}
                                        setActiveSuggestion={setActiveSuggestion}
                                        setFilteredSuggestions={setFilteredSuggestions}
                                        handleSuggestionSelect={handleSuggestionSelect}
                                        allIngredientNames={allIngredientNames}
                                        calculatePercentage={calculatePercentage}
                                        onOpenConversion={() => setConversionModal({ isOpen: true, type: 'ingredient', index: i })}
                                    />
                                ))}
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
const FlourItem = ({ id, index, item, onChange, onRemove, onSuggestionSelect, activeSuggestion, filteredSuggestions, setActiveSuggestion, setFilteredSuggestions, handleSuggestionSelect, allIngredientNames, calculatePercentage, floursLength, onOpenConversion }) => {
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
        zIndex: isDragging ? 999 : 'auto',
        backgroundColor: 'white'
    };

    return (
        <div ref={setNodeRef} style={style} className="bread-row">
            <div
                {...attributes}
                {...listeners}
                className="bread-drag-handle"
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
            <div style={{ position: 'relative', zIndex: activeSuggestion?.type === 'flour' && activeSuggestion?.index === index ? 10000 : 'auto' }}>
                <Input
                    value={item.name}
                    onChange={(e) => {
                        onChange(index, 'name', e.target.value);
                        // Trigger suggestions
                        if (e.target.value.trim()) {
                            const matchVal = e.target.value.toLowerCase();
                            const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                            setFilteredSuggestions(matches.slice(0, 10));
                            setActiveSuggestion({ type: 'flour', index: index });
                        } else {
                            setFilteredSuggestions([]);
                            setActiveSuggestion(null);
                        }
                    }}
                    onFocus={() => {
                        if (item.name.trim()) {
                            const matchVal = item.name.toLowerCase();
                            const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                            setFilteredSuggestions(matches.slice(0, 10));
                            setActiveSuggestion({ type: 'flour', index: index });
                        }
                    }}
                    onBlur={() => setTimeout(() => setActiveSuggestion(null), 200)}
                    placeholder="例: 強力粉"
                    className="bread-input name"
                    autoComplete="off"
                />
                {activeSuggestion && activeSuggestion.type === 'flour' && activeSuggestion.index === index && filteredSuggestions.length > 0 && (
                    <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '0 0 4px 4px',
                        maxHeight: '150px',
                        overflowY: 'auto',
                        zIndex: 10001,
                        padding: 0,
                        margin: 0,
                        listStyle: 'none',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                        {filteredSuggestions.map((suggestion, idx) => (
                            <li
                                key={idx}
                                onMouseDown={() => handleSuggestionSelect('flour', index, suggestion)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderBottom: idx < filteredSuggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    fontSize: '14px',
                                    color: '#333'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                {suggestion}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <Input
                type="number"
                step="any"
                value={item.quantity}
                onChange={(e) => onChange(index, 'quantity', e.target.value)}
                placeholder="0"
                className="bread-input qty"
            />
            <div className="bread-percent">
                {calculatePercentage(item.quantity)}%
            </div>
            <div style={{ position: 'relative' }}>
                <Input
                    type="number"
                    step="any"
                    value={item.purchaseCost || ''}
                    onChange={(e) => onChange(index, 'purchaseCost', e.target.value)}
                    placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                    className="bread-input cost"
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '', paddingRight: '20px' }}
                    min="0"
                    title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
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

            <Input
                type="number"
                step="any"
                value={item.cost || ''}
                onChange={(e) => onChange(index, 'cost', e.target.value)}
                placeholder="原価"
                className="bread-input cost"
                style={{ width: '100%' }}
                min="0"
            />
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={item.isAlcohol || false}
                    onChange={(e) => onChange(index, 'isAlcohol', e.target.checked)}
                    title="酒類 (10%税)"
                />
            </div>
            {
                floursLength > 1 && (
                    <button type="button" className="bread-remove" onClick={() => onRemove(index)}>×</button>
                )
            }
        </div >
    );
};

// Wrapper for Sortable Hook (Bread Ingredients)
const BreadIngredientItem = ({ id, index, item, onChange, onRemove, onSuggestionSelect, activeSuggestion, filteredSuggestions, setActiveSuggestion, setFilteredSuggestions, handleSuggestionSelect, allIngredientNames, calculatePercentage, onOpenConversion }) => {
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
        zIndex: isDragging ? 999 : 'auto',
        backgroundColor: 'white'
    };

    return (
        <div ref={setNodeRef} style={style} className="bread-row">
            <div
                {...attributes}
                {...listeners}
                className="bread-drag-handle"
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
            <div style={{ position: 'relative', zIndex: activeSuggestion?.type === 'ingredient' && activeSuggestion?.index === index ? 10000 : 'auto' }}>
                <Input
                    value={item.name}
                    onChange={(e) => {
                        onChange(index, 'name', e.target.value);
                        // Trigger suggestions
                        if (e.target.value.trim()) {
                            const matchVal = e.target.value.toLowerCase();
                            const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                            setFilteredSuggestions(matches.slice(0, 10));
                            setActiveSuggestion({ type: 'ingredient', index: index });
                        } else {
                            setFilteredSuggestions([]);
                            setActiveSuggestion(null);
                        }
                    }}
                    onFocus={() => {
                        if (item.name.trim()) {
                            const matchVal = item.name.toLowerCase();
                            const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                            setFilteredSuggestions(matches.slice(0, 10));
                            setActiveSuggestion({ type: 'ingredient', index: index });
                        }
                    }}
                    onBlur={() => setTimeout(() => setActiveSuggestion(null), 200)}
                    placeholder="例: 塩"
                    className="bread-input name"
                    autoComplete="off"
                />
                {activeSuggestion && activeSuggestion.type === 'ingredient' && activeSuggestion.index === index && filteredSuggestions.length > 0 && (
                    <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '0 0 4px 4px',
                        maxHeight: '150px',
                        overflowY: 'auto',
                        zIndex: 10001,
                        padding: 0,
                        margin: 0,
                        listStyle: 'none',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                        {filteredSuggestions.map((suggestion, idx) => (
                            <li
                                key={idx}
                                onMouseDown={() => handleSuggestionSelect('ingredient', index, suggestion)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderBottom: idx < filteredSuggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    fontSize: '14px',
                                    color: '#333'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                {suggestion}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <Input
                type="number"
                step="any"
                value={item.quantity}
                onChange={(e) => onChange(index, 'quantity', e.target.value)}
                placeholder="0"
                className="bread-input qty"
            />
            <div className="bread-percent">
                {calculatePercentage(item.quantity)}%
            </div>
            <div style={{ position: 'relative' }}>
                <Input
                    type="number"
                    step="any"
                    value={item.purchaseCost || ''}
                    onChange={(e) => onChange(index, 'purchaseCost', e.target.value)}
                    placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                    className="bread-input cost"
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '', paddingRight: '20px' }}
                    min="0"
                    title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
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

            <Input
                type="number"
                step="any"
                value={item.cost || ''}
                onChange={(e) => onChange(index, 'cost', e.target.value)}
                placeholder="原価"
                className="bread-input cost"
                style={{ width: '100%' }}
                min="0"
            />
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={item.isAlcohol || false}
                    onChange={(e) => onChange(index, 'isAlcohol', e.target.checked)}
                    title="酒類 (10%税)"
                />
            </div>
            <button type="button" className="bread-remove" onClick={() => onRemove(index)}>×</button>
        </div >
    );
};
