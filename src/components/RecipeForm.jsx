import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { STORE_LIST } from '../constants';
import { RecipeFormBread } from './RecipeFormBread';
import { purchasePriceService } from '../services/purchasePriceService';
import './RecipeForm.css';

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

// Internal Sortable Item Component
const SortableStepItem = ({ id, index, value, onChange, onRemove, listeners, attributes, setNodeRef, transform, transition, isDragging }) => {
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        marginBottom: '0.5rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        backgroundColor: 'white',
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} className="step-row">
            <div
                {...attributes}
                {...listeners}
                className="step-drag-handle"
                style={{
                    cursor: 'grab',
                    padding: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ccc',
                    alignSelf: 'stretch',
                    touchAction: 'none'
                }}
            >
                ⋮⋮
            </div>
            <div className="step-count">{index + 1}</div>
            <div style={{ flex: 1 }}>
                <Input
                    textarea
                    value={value}
                    onChange={(e) => onChange(index, e.target.value)}
                    placeholder={`手順 ${index + 1}...`}
                    style={{ minHeight: '80px' }}
                />
            </div>
            <div className="remove-button-cell">
                <button
                    type="button"
                    className="icon-btn-delete"
                    onClick={() => onRemove(index)}
                    title="削除"
                >✕</button>
            </div>
        </div>
    );
};

const SortableIngredientItem = ({ id, index, item, onChange, onRemove, onSuggestionSelect, activeSuggestionRow, filteredSuggestions, setActiveSuggestionRow, setFilteredSuggestions, handleSuggestionSelect, listeners, attributes, setNodeRef, transform, transition, isDragging, allIngredientNames }) => {
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto',
        backgroundColor: 'white' // Ensure visibility when dragging
    };

    const inputRef = useRef(null);
    const [dropdownStyle, setDropdownStyle] = useState({});

    useEffect(() => {
        if (activeSuggestionRow === index && filteredSuggestions.length > 0 && inputRef.current) {
            const updatePosition = () => {
                const rect = inputRef.current.getBoundingClientRect();
                setDropdownStyle({
                    position: 'fixed',
                    top: `${rect.bottom}px`,
                    left: `${rect.left}px`,
                    width: `${rect.width}px`,
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    borderRadius: '0 0 4px 4px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    zIndex: 9999, // Very high z-index
                    padding: 0,
                    margin: 0,
                    listStyle: 'none',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                });
            };

            updatePosition();
            // Update on scroll or resize
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);

            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [activeSuggestionRow, index, filteredSuggestions.length]);

    return (
        <div ref={setNodeRef} style={style} className="form-ingredient-row">
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
            <div className="ingredient-name" style={{ position: 'relative' }} ref={inputRef}>
                <Input
                    value={item.name}
                    onChange={(e) => onChange(index, e.target.value, 'ingredients', 'name')}
                    onFocus={() => {
                        if (item.name.trim()) {
                            const matchVal = item.name.toLowerCase();
                            const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                            setFilteredSuggestions(matches.slice(0, 10));
                            setActiveSuggestionRow(index);
                        }
                    }}
                    onBlur={() => {
                        setTimeout(() => setActiveSuggestionRow(null), 200);
                    }}
                    placeholder="材料名"
                    style={{ width: '100%' }}
                    autoComplete="off"
                />
                {activeSuggestionRow === index && filteredSuggestions.length > 0 && createPortal(
                    <ul style={dropdownStyle}>
                        {filteredSuggestions.map((suggestion, idx) => (
                            <li
                                key={idx}
                                onMouseDown={() => handleSuggestionSelect(index, suggestion)}
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
                    </ul>,
                    document.body
                )}
            </div>
            <div className="ingredient-qty">
                <Input
                    value={item.quantity}
                    onChange={(e) => onChange(index, e.target.value, 'ingredients', 'quantity')}
                    placeholder="0"
                    style={{ width: '100%' }}
                />
            </div>
            <div className="ingredient-unit">
                <Input
                    value={item.unit}
                    onChange={(e) => onChange(index, e.target.value, 'ingredients', 'unit')}
                    placeholder="単位"
                    style={{ width: '100%' }}
                />
            </div>
            <div className="ingredient-cost">
                <Input
                    type="number"
                    value={item.purchaseCost}
                    onChange={(e) => onChange(index, e.target.value, 'ingredients', 'purchaseCost')}
                    placeholder={item.purchaseCostRef ? `Ref` : "仕入れ"}
                    style={{ width: '100%', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '' }}
                    min="0"
                    title={item.purchaseCostRef ? `参考: ¥${item.purchaseCostRef}${item.vendorRef ? ` (${item.vendorRef})` : ''}` : "No data"}
                />
                {item.purchaseCostRef && (
                    <div style={{ fontSize: '10px', color: '#666', lineHeight: '1.2', marginTop: '2px', wordBreak: 'break-all', textAlign: 'center' }}>
                        ¥{item.purchaseCostRef}
                    </div>
                )}
            </div>
            <div className="ingredient-cost">
                <Input
                    type="number"
                    value={item.cost}
                    onChange={(e) => onChange(index, e.target.value, 'ingredients', 'cost')}
                    placeholder="原価"
                    style={{ width: '100%' }}
                    min="0"
                />
            </div>
            <div className="remove-button-cell">
                <button
                    type="button"
                    className="icon-btn-delete"
                    onClick={() => onRemove(index)}
                    title="削除"
                >✕</button>
            </div>
        </div>
    );
}


export const RecipeForm = ({ onSave, onCancel, initialData }) => {
    const safeInitialData = initialData || {};

    // Price list cache
    const [priceList, setPriceList] = useState(new Map());
    const allIngredientNames = useMemo(() => Array.from(priceList.keys()), [priceList]);

    // Suggestions State
    const [activeSuggestionRow, setActiveSuggestionRow] = useState(null);
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);

    React.useEffect(() => {
        const loadPrices = async () => {
            const prices = await purchasePriceService.fetchPriceList();
            setPriceList(prices);
        };
        loadPrices();
    }, []);

    // Transform initial steps string array to object array with IDs
    const initialSteps = (safeInitialData.steps || ['']).map(step => ({
        id: crypto.randomUUID(),
        text: step
    }));

    // Transform initial ingredients to have IDs
    const initialIngredients = (safeInitialData.ingredients || [{ name: '', quantity: '', unit: '', cost: '', purchaseCost: '' }]).map(ing => {
        const base = typeof ing === 'string' ? { name: ing, quantity: '', unit: '', cost: '', purchaseCost: '' } : { ...ing, cost: ing.cost || '', purchaseCost: ing.purchaseCost || '' };
        return { ...base, id: base.id || crypto.randomUUID() };
    });

    const [formData, setFormData] = useState({
        title: safeInitialData.title || '',
        description: safeInitialData.description || '',
        image: safeInitialData.image || '',
        imageFile: null, // New state for file upload
        storeName: safeInitialData.storeName || '',
        servings: safeInitialData.servings || '',
        ingredients: initialIngredients,
        steps: initialSteps, // Use transformed steps
        tags: safeInitialData.tags || [''],
        course: safeInitialData.course || '',
        category: safeInitialData.category || '',
        type: safeInitialData.type || 'normal', // 'normal' | 'bread'
        flours: safeInitialData.flours || [],
        breadIngredients: safeInitialData.breadIngredients || []
    });

    const [isDragActive, setIsDragActive] = useState(false);

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
                const isStep = prev.steps.some((item) => item.id === active.id);
                const field = isStep ? 'steps' : 'ingredients';

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

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragActive(true);
        } else if (e.type === "dragleave") {
            setIsDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                setFormData(prev => ({
                    ...prev,
                    imageFile: file,
                    image: URL.createObjectURL(file) // Preview URL
                }));
            }
        }
    };

    const handleChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData(prev => ({
                ...prev,
                imageFile: file,
                image: URL.createObjectURL(file) // Preview URL
            }));
        }
    };

    const handleArrayChange = (index, value, field, property = null) => {
        const newArray = [...formData[field]];
        if (field === 'steps') {
            // Special handling for steps object array
            newArray[index] = { ...newArray[index], text: value };
        } else if (property) {
            newArray[index] = { ...newArray[index], [property]: value };

            if (field === 'ingredients') {
                // Helper to calculate cost
                const calculateCost = (item) => {
                    const qty = parseFloat(item.quantity);
                    const pCost = parseFloat(item.purchaseCost);
                    if (!isNaN(qty) && !isNaN(pCost)) {
                        const u = item.unit ? item.unit.trim().toLowerCase() : '';
                        if (u === 'g' || u === 'ｇ') {
                            return Math.round((qty / 1000) * pCost);
                        }
                        return Math.round(qty * pCost);
                    }
                    return item.cost; // Keep existing if invalid
                };

                // Auto-lookup for normal ingredients
                if (property === 'name') {
                    // Should show suggestions?
                    if (value.trim()) {
                        const matchVal = value.toLowerCase();
                        const matches = allIngredientNames.filter(n => n.toLowerCase().includes(matchVal));
                        setFilteredSuggestions(matches.slice(0, 10)); // Top 10
                        setActiveSuggestionRow(index);
                    } else {
                        setFilteredSuggestions([]);
                        setActiveSuggestionRow(null);
                    }

                    const refData = priceList.get(value);
                    if (refData) {
                        const price = typeof refData === 'object' ? refData.price : refData;
                        const vendor = typeof refData === 'object' ? refData.vendor : null;
                        const unit = typeof refData === 'object' ? refData.unit : null;

                        newArray[index].purchaseCostRef = price;
                        newArray[index].vendorRef = vendor;

                        // Autofill if empty
                        if (!newArray[index].purchaseCost) {
                            newArray[index].purchaseCost = price;
                        }
                        if (!newArray[index].unit && unit) {
                            newArray[index].unit = unit;
                        }
                    } else {
                        newArray[index].purchaseCostRef = null;
                        newArray[index].vendorRef = null;
                    }
                }

                // Auto-calculate cost (原価) = Quantity (分量) * PurchaseCost (仕入れ)
                if (property === 'quantity' || property === 'purchaseCost' || property === 'name' || property === 'unit') {
                    const calculated = calculateCost(newArray[index]);
                    if (calculated !== newArray[index].cost) {
                        newArray[index].cost = calculated;
                    }
                }
            }
        } else {
            newArray[index] = value;
        }
        setFormData(prev => ({ ...prev, [field]: newArray }));
    };

    const addArrayItem = (field, value = '') => {
        let newItem = value;
        if (field === 'ingredients') {
            newItem = { id: crypto.randomUUID(), name: '', quantity: '', unit: '', cost: '', purchaseCost: '' };
        } else if (field === 'steps') {
            newItem = { id: crypto.randomUUID(), text: '' };
        }
        setFormData(prev => ({ ...prev, [field]: [...prev[field], newItem] }));
    };

    const handleSuggestionSelect = (index, name) => {
        handleArrayChange(index, name, 'ingredients', 'name');
        setActiveSuggestionRow(null);
        setFilteredSuggestions([]);
    };

    const removeArrayItem = (index, field) => {
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Basic validation could go here

        // Remove IDs and temporary properties before saving if desired, 
        // though Supabase JSONB can handle extra props. 
        // For 'steps', we MUST convert back to string array.
        // For 'ingredients', let's clean it up to keep DB clean.
        const cleanedIngredients = formData.ingredients.map(({ id, ...rest }) => rest);

        // Automatically derive tags from course and category
        const tagSet = new Set([formData.course, formData.category].filter(val => val && val.trim()));
        if (formData.type === 'bread') {
            tagSet.add('パン');
        }
        const derivedTags = Array.from(tagSet);

        onSave({
            ...formData,
            ingredients: cleanedIngredients,
            steps: formData.steps.map(s => s.text), // Convert back to string array
            image: formData.imageFile || formData.image, // Pass file if selected, otherwise string
            id: safeInitialData.id || Date.now(), // preserve ID on edit or new one on create
            tags: derivedTags
        });
    };

    return (
        <form className="recipe-form fade-in" onSubmit={handleSubmit}>
            <div className="recipe-form__header">
                <h2 className="section-title">{safeInitialData.title ? 'レシピ編集' : '新規レシピ作成'}</h2>
                <div className="recipe-form__actions">
                    <Button type="button" variant="ghost" onClick={onCancel}>キャンセル</Button>
                    <Button type="submit" variant="primary">レシピを保存</Button>
                </div>
            </div>

            <div className="recipe-form__grid">
                <div className="form-column">
                    <Card>
                        <h3>基本情報</h3>
                        <div className="form-row-2">
                            <div className="form-group">
                                <label>コース</label>
                                <Input
                                    id="course"
                                    value={formData.course}
                                    onChange={handleChange}
                                    placeholder="例: 前菜, メイン"
                                    list="course-options"
                                />
                                <datalist id="course-options">
                                    <option value="アミューズ" />
                                    <option value="前菜" />
                                    <option value="スープ" />
                                    <option value="魚料理" />
                                    <option value="肉料理" />
                                    <option value="デザート" />
                                    <option value="プティフール" />
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label>カテゴリー</label>
                                <Input
                                    id="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    placeholder="例: ソース, 付け合わせ"
                                />
                            </div>
                        </div>
                        <Input
                            label="レシピ名"
                            id="title"
                            value={formData.title}
                            onChange={handleChange}
                            placeholder="例: 仔羊のナヴァラン"
                            required
                        />
                        <Input
                            label="説明"
                            id="description"
                            textarea
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="料理の簡単な説明..."
                        />
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: 'hsl(var(--color-primary))' }}>画像</label>
                            {/* Drag and Drop Zone */}
                            <div
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                style={{
                                    position: 'relative',
                                    marginBottom: '1rem',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden',
                                    border: isDragActive ? '2px dashed var(--color-primary)' : '1px dashed hsl(var(--color-border))',
                                    backgroundColor: isDragActive ? '#f0f9ff' : '#f9f9f9',
                                    transition: 'all 0.2s ease',
                                    minHeight: '200px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}
                            >
                                {formData.image ? (
                                    <>
                                        <div style={{ width: '100%', height: '200px', backgroundColor: '#f0f0f0' }}>
                                            <img
                                                src={formData.image}
                                                alt="プレビュー"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isDragActive ? 0.5 : 1 }}
                                                onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.textContent = '画像読み込みエラー'; }}
                                            />
                                        </div>
                                        <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: '#666' }}>
                                            クリックして変更、または画像をドロップ
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                                        {isDragActive ? "ここに画像をドロップ" : "クリックして画像を選択、またはドラッグ＆ドロップ"}
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        opacity: 0,
                                        cursor: 'pointer'
                                    }}
                                />
                            </div>

                        </div>
                    </Card>
                    {!safeInitialData.id && (
                        <Card className="mb-md glass-card">
                            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.8rem', marginBottom: '0.8rem' }}>レシピを取り込む</h3>
                            <div className="import-actions-row">
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setShowWebImport(true)}
                                    className="btn-import-web"
                                >
                                    🌐 Web URLから自動入力
                                </Button>
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setShowImageImport(true)}
                                    className="btn-import-image"
                                >
                                    📸 画像解析 (Best Effort)
                                </Button>
                            </div>

                            <div className="image-upload-section" style={{ marginTop: '0.2rem' }}>
                                <label style={{ fontSize: '0.9rem', color: '#555', marginBottom: '0.4rem', display: 'block' }}>
                                    レシピの画像（スクリーンショットや写真）をアップロードしてください。
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    style={{ marginBottom: '0.5rem' }}
                                />
                                {formData.image && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <img
                                            src={formData.image}
                                            alt="Preview"
                                            style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '4px' }}
                                        />
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}

                    <div className="form-row-3">
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>店舗名</label>
                            <select
                                id="storeName"
                                value={formData.storeName}
                                onChange={handleChange}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '0.75rem',
                                    fontSize: '1rem',
                                    border: '1px solid #ddd',
                                    borderRadius: '8px',
                                    backgroundColor: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">店舗を選択</option>
                                {STORE_LIST.map(store => (
                                    <option key={store} value={store}>{store}</option>
                                ))}
                            </select>
                        </div>
                        <Input
                            label="分量"
                            id="servings"
                            value={formData.servings}
                            onChange={handleChange}
                            placeholder="4人分"
                        />
                    </div>
                </div>

                <div className="form-column">
                    <Card className="mb-md" style={{ position: 'relative', zIndex: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3>材料リスト</h3>
                            <div className="mode-toggle" style={{ display: 'flex', gap: '0.5rem', background: '#eee', padding: '4px', borderRadius: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, type: 'normal' }))}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: formData.type === 'normal' ? 'white' : 'transparent',
                                        fontWeight: formData.type === 'normal' ? 'bold' : 'normal',
                                        boxShadow: formData.type === 'normal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    通常
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, type: 'bread' }))}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: formData.type === 'bread' ? 'white' : 'transparent',
                                        fontWeight: formData.type === 'bread' ? 'bold' : 'normal',
                                        boxShadow: formData.type === 'bread' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer',
                                        color: formData.type === 'bread' ? 'var(--color-primary)' : 'inherit'
                                    }}
                                >
                                    パン (Baker's %)
                                </button>
                            </div>
                        </div>

                        {formData.type === 'bread' ? (
                            <RecipeFormBread formData={formData} setFormData={setFormData} />
                        ) : (
                            <div className="recipe-scroll-wrapper">
                                <div className="recipe-list-header">
                                    <span></span> {/* Handle */}
                                    <span>材料名</span>
                                    <span>分量</span>
                                    <span>単位</span>
                                    <span style={{ textAlign: 'center' }}>仕入れ</span>
                                    <span style={{ textAlign: 'center' }}>原価</span>
                                    <span></span>
                                </div>
                                <div className="dynamic-list">
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleDragEnd}
                                        id="ingredients-dnd"
                                    >
                                        <SortableContext
                                            items={formData.ingredients}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {(formData.ingredients || []).map((item, i) => (
                                                <IngredientItem
                                                    key={item.id}
                                                    id={item.id}
                                                    index={i}
                                                    item={item}
                                                    onChange={handleArrayChange}
                                                    onRemove={() => removeArrayItem(i, 'ingredients')}
                                                    onSuggestionSelect={handleSuggestionSelect}
                                                    activeSuggestionRow={activeSuggestionRow}
                                                    filteredSuggestions={filteredSuggestions}
                                                    setActiveSuggestionRow={setActiveSuggestionRow}
                                                    setFilteredSuggestions={setFilteredSuggestions}
                                                    handleSuggestionSelect={handleSuggestionSelect}
                                                    allIngredientNames={allIngredientNames}
                                                />
                                            ))}
                                        </SortableContext>
                                    </DndContext>
                                    <Button type="button" variant="secondary" size="sm" onClick={() => addArrayItem('ingredients')} block>+ 材料を追加</Button>
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card>
                        <h3>作り方</h3>
                        <div className="dynamic-list">
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={formData.steps}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {(formData.steps || []).map((item, i) => (
                                        <StepItem
                                            key={item.id}
                                            id={item.id}
                                            index={i}
                                            value={item.text}
                                            onChange={handleArrayChange}
                                            onRemove={() => removeArrayItem(i, 'steps')}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                            <Button type="button" variant="secondary" size="sm" onClick={() => addArrayItem('steps')} block>+ 作り方を追加</Button>
                        </div>
                    </Card>


                </div>
            </div >
        </form >
    );
};

// Wrapper for Sortable Hook (Ingredients)
const IngredientItem = ({ id, index, item, onChange, onRemove, onSuggestionSelect, activeSuggestionRow, filteredSuggestions, setActiveSuggestionRow, setFilteredSuggestions, handleSuggestionSelect, allIngredientNames }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: id });

    return (
        <SortableIngredientItem
            id={id}
            index={index}
            item={item}
            onChange={onChange}
            onRemove={onRemove}
            onSuggestionSelect={onSuggestionSelect}
            activeSuggestionRow={activeSuggestionRow}
            filteredSuggestions={filteredSuggestions}
            setActiveSuggestionRow={setActiveSuggestionRow}
            setFilteredSuggestions={setFilteredSuggestions}
            handleSuggestionSelect={handleSuggestionSelect}
            listeners={listeners}
            attributes={attributes}
            setNodeRef={setNodeRef}
            transform={transform}
            transition={transition}
            isDragging={isDragging}
            allIngredientNames={allIngredientNames}
        />
    );
}

// Wrapper for Sortable Hook
const StepItem = ({ id, index, value, onChange, onRemove }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: id });

    return (
        <SortableStepItem
            id={id}
            index={index}
            value={value}
            onChange={(idx, val) => onChange(idx, val, 'steps')}
            onRemove={onRemove}
            listeners={listeners}
            attributes={attributes}
            setNodeRef={setNodeRef}
            transform={transform}
            transition={transition}
            isDragging={isDragging}
        />
    );
}
