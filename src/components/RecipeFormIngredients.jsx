import React, { useState, useEffect } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects
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
import { createPortal } from 'react-dom';

// --- Sortable Item Component ---
const SortableIngredientItem = ({
    id,
    index,
    item,
    groupId,
    onChange,
    onRemove,
    handleSuggestionSelect,
    allIngredientNames,
    priceList
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.id, data: { groupId, index } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto',
    };

    // Suggestions State
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = React.useRef(null);
    const [dropdownStyle, setDropdownStyle] = useState({});

    useEffect(() => {
        if (showSuggestions && filteredSuggestions.length > 0 && inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: `${rect.bottom}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                maxHeight: '150px',
                overflowY: 'auto',
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '0 0 4px 4px',
                zIndex: 9999,
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                listStyle: 'none',
                padding: 0,
                margin: 0
            });
        }
    }, [showSuggestions, filteredSuggestions.length]);

    const handleNameChange = (val) => {
        onChange(groupId, index, 'name', val);
        if (val.trim()) {
            const matches = allIngredientNames.filter(n => n.toLowerCase().includes(val.toLowerCase())).slice(0, 10);
            setFilteredSuggestions(matches);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleBlur = () => {
        setTimeout(() => setShowSuggestions(false), 200);
    };

    return (
        <div ref={setNodeRef} style={style} className="form-ingredient-row">
            <div
                {...attributes}
                {...listeners}
                className="ingredient-drag-handle"
                style={{ cursor: 'grab', padding: '0 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}
            >
                ⋮⋮
            </div>

            <div className="ingredient-name" ref={inputRef}>
                <Input
                    value={item.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => item.name && handleNameChange(item.name)}
                    onBlur={handleBlur}
                    placeholder="材料名"
                    style={{ width: '100%' }}
                    autoComplete="off"
                />
                {showSuggestions && filteredSuggestions.length > 0 && createPortal(
                    <ul style={dropdownStyle}>
                        {filteredSuggestions.map((suggestion, idx) => (
                            <li
                                key={idx}
                                onMouseDown={() => {
                                    handleSuggestionSelect(groupId, index, suggestion);
                                    setShowSuggestions(false);
                                }}
                                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                {suggestion}
                            </li>
                        ))}
                    </ul>,
                    document.body
                )}
            </div>

            <div className="ingredient-qty">
                <Input value={item.quantity} onChange={(e) => onChange(groupId, index, 'quantity', e.target.value)} placeholder="0" style={{ width: '100%' }} />
            </div>
            <div className="ingredient-unit">
                <Input value={item.unit} onChange={(e) => onChange(groupId, index, 'unit', e.target.value)} placeholder="単位" style={{ width: '100%' }} />
            </div>
            <div className="ingredient-cost">
                <Input
                    type="number"
                    value={item.purchaseCost}
                    onChange={(e) => onChange(groupId, index, 'purchaseCost', e.target.value)}
                    placeholder={item.purchaseCostRef ? "Ref" : "仕入れ"}
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '' }}
                    title={item.purchaseCostRef ? `参考: ¥${item.purchaseCostRef}${item.vendorRef ? ` (${item.vendorRef})` : ''}` : "No data"}
                />
                {item.purchaseCostRef && (
                    <div style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all', textAlign: 'center' }}>
                        ¥{item.purchaseCostRef}
                    </div>
                )}
            </div>
            <div className="ingredient-cost">
                <Input type="number" value={item.cost} onChange={(e) => onChange(groupId, index, 'cost', e.target.value)} placeholder="原価" style={{ width: '100%' }} />
            </div>
            <div className="remove-button-cell">
                <button type="button" className="icon-btn-delete" onClick={() => onRemove(groupId, index)}>✕</button>
            </div>
        </div>
    );
};

// --- Sortable Section Component ---
const SortableSection = ({ section, sections, onSectionChange, onRemoveSection, children }) => {
    // Only sortable logic for sections if we implement section reordering. 
    // For now simplistic layout.
    return (
        <Card className="ingredient-section mb-md" style={{ border: '1px solid #e0e0e0', boxShadow: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid #f0f0f0', paddingBottom: '0.5rem' }}>
                <Input
                    value={section.name}
                    onChange={(e) => onSectionChange(section.id, e.target.value)}
                    placeholder="グループ名 (例: ソース)"
                    style={{ fontWeight: 'bold', border: 'none', background: 'transparent', fontSize: '1.05rem', padding: '4px', width: '70%' }}
                />

                <div style={{ display: 'flex', gap: '8px' }}>
                    {sections.length > 1 && (
                        <button type="button" onClick={() => onRemoveSection(section.id)} style={{ color: '#999', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
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
                <span></span>
            </div>

            <div className="section-ingredients-list" style={{ minHeight: '50px', transition: 'min-height 0.2s', paddingBottom: '10px' }}>
                {children}
                {section.items.length === 0 && (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#aaa', fontSize: '0.85rem', border: '1px dashed #ddd', borderRadius: '4px' }}>
                        ここに材料をドロップ
                    </div>
                )}
            </div>
        </Card>
    );
};


export const RecipeFormIngredients = ({ formData, setFormData, priceList }) => {
    const allIngredientNames = Array.from(priceList.keys());

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

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const findSection = (id) => sections.find(s => s.items.some(i => i.id === id));

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

    const handleItemChange = (groupId, index, field, value) => {
        setFormData(prev => {
            const newSections = prev.ingredientSections.map(s => {
                if (s.id !== groupId) return s;

                const newItems = [...s.items];
                const newItem = { ...newItems[index], [field]: value };
                newItems[index] = newItem;

                // Calculation Logic
                if (['quantity', 'purchaseCost', 'unit', 'name'].includes(field)) {
                    // Cost Calc
                    const qty = parseFloat(newItem.quantity);
                    const pCost = parseFloat(newItem.purchaseCost);

                    if (!isNaN(qty) && !isNaN(pCost)) {
                        let cost = 0;
                        const u = newItem.unit ? newItem.unit.trim().toLowerCase() : '';
                        if (u === 'g' || u === 'ｇ') {
                            cost = Math.round((qty / 1000) * pCost);
                        } else {
                            cost = Math.round(qty * pCost);
                        }
                        if (cost !== newItem.cost) {
                            newItem.cost = cost;
                            newItems[index] = newItem;
                        }
                    }
                }

                // Name Lookup Logic
                if (field === 'name') {
                    const refData = priceList.get(value);
                    if (refData) {
                        const price = typeof refData === 'object' ? refData.price : refData;
                        const vendor = typeof refData === 'object' ? refData.vendor : null;
                        const unit = typeof refData === 'object' ? refData.unit : null;

                        newItem.purchaseCostRef = price;
                        newItem.vendorRef = vendor;
                        if (!newItem.purchaseCost) newItem.purchaseCost = price;
                        if (!newItem.unit && unit) newItem.unit = unit;

                        // Re-calc cost after autofill
                        const qty = parseFloat(newItem.quantity);
                        const pCost = parseFloat(newItem.purchaseCost);
                        if (!isNaN(qty) && !isNaN(pCost)) {
                            const u = newItem.unit ? newItem.unit.trim().toLowerCase() : '';
                            if (u === 'g' || u === 'ｇ') {
                                newItem.cost = Math.round((qty / 1000) * pCost);
                            } else {
                                newItem.cost = Math.round(qty * pCost);
                            }
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
    };

    const handleSuggestionSelect = (groupId, index, name) => {
        handleItemChange(groupId, index, 'name', name);
    };

    const handleRemoveItem = (groupId, index) => {
        setFormData(prev => ({
            ...prev,
            ingredientSections: prev.ingredientSections.map(s => {
                if (s.id === groupId) {
                    return { ...s, items: s.items.filter((_, i) => i !== index) };
                }
                return s;
            })
        }));
    };

    const handleAddItem = (groupId) => {
        const newItem = { id: crypto.randomUUID(), name: '', quantity: '', unit: '', cost: '', purchaseCost: '' };
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
            collisionDetection={closestCenter}
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
                                <SortableIngredientItem
                                    key={item.id}
                                    id={item.id}
                                    index={index}
                                    item={item}
                                    groupId={section.id}
                                    onChange={handleItemChange}
                                    onRemove={handleRemoveItem}
                                    handleSuggestionSelect={handleSuggestionSelect}
                                    allIngredientNames={allIngredientNames}
                                    priceList={priceList}
                                />
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
        </DndContext>
    );
};
