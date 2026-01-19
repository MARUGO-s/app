import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { purchasePriceService } from '../services/purchasePriceService';
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

    useEffect(() => {
        const loadPrices = async () => {
            const prices = await purchasePriceService.fetchPriceList();
            setPriceList(prices);
        };
        loadPrices();
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
            } else {
                newFlours[index].purchaseCostRef = null;
                newFlours[index].vendorRef = null;
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
            } else {
                newIngs[index].purchaseCostRef = null;
                newIngs[index].vendorRef = null;
            }
        }
        setFormData(prev => ({ ...prev, breadIngredients: newIngs }));
    };

    const addFlour = () => {
        setFormData(prev => ({
            ...prev,
            flours: [...(prev.flours || []), { id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '' }]
        }));
    };

    const addIngredient = () => {
        setFormData(prev => ({
            ...prev,
            breadIngredients: [...(prev.breadIngredients || []), { id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', cost: '' }]
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
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addIngredient} block style={{ marginTop: '0.5rem' }}>+ 材料を追加</Button>
            </Card >
        </div >
    );
};

// Wrapper for Sortable Hook (Flour Items)
const FlourItem = ({ id, index, item, onChange, onRemove, onSuggestionSelect, activeSuggestion, filteredSuggestions, setActiveSuggestion, setFilteredSuggestions, handleSuggestionSelect, allIngredientNames, calculatePercentage, floursLength }) => {
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
                value={item.quantity}
                onChange={(e) => onChange(index, 'quantity', e.target.value)}
                placeholder="0"
                className="bread-input qty"
            />
            <div className="bread-percent">
                {calculatePercentage(item.quantity)}%
            </div>
            <div>
                <Input
                    type="number"
                    value={item.purchaseCost || ''}
                    onChange={(e) => onChange(index, 'purchaseCost', e.target.value)}
                    placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                    className="bread-input cost"
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '' }}
                    min="0"
                    title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
                />
                {item.purchaseCostRef && (
                    <div style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all' }}>
                        ¥{item.purchaseCostRef} {item.vendorRef && `(${item.vendorRef})`}
                    </div>
                )}
            </div>
            <Input
                type="number"
                value={item.cost || ''}
                onChange={(e) => onChange(index, 'cost', e.target.value)}
                placeholder="原価"
                className="bread-input cost"
                style={{ width: '100%' }}
                min="0"
            />
            {floursLength > 1 && (
                <button type="button" className="bread-remove" onClick={() => onRemove(index)}>×</button>
            )}
        </div>
    );
};

// Wrapper for Sortable Hook (Bread Ingredients)
const BreadIngredientItem = ({ id, index, item, onChange, onRemove, onSuggestionSelect, activeSuggestion, filteredSuggestions, setActiveSuggestion, setFilteredSuggestions, handleSuggestionSelect, allIngredientNames, calculatePercentage }) => {
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
                value={item.quantity}
                onChange={(e) => onChange(index, 'quantity', e.target.value)}
                placeholder="0"
                className="bread-input qty"
            />
            <div className="bread-percent">
                {calculatePercentage(item.quantity)}%
            </div>
            <div>
                <Input
                    type="number"
                    value={item.purchaseCost || ''}
                    onChange={(e) => onChange(index, 'purchaseCost', e.target.value)}
                    placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                    className="bread-input cost"
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '' }}
                    min="0"
                    title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
                />
                {item.purchaseCostRef && (
                    <div style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all' }}>
                        ¥{item.purchaseCostRef} {item.vendorRef && `(${item.vendorRef})`}
                    </div>
                )}
            </div>
            <Input
                type="number"
                value={item.cost || ''}
                onChange={(e) => onChange(index, 'cost', e.target.value)}
                placeholder="原価"
                className="bread-input cost"
                style={{ width: '100%' }}
                min="0"
            />
            <button type="button" className="bread-remove" onClick={() => onRemove(index)}>×</button>
        </div>
    );
};
