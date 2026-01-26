import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { STORE_LIST } from '../constants';
import { RecipeFormBread } from './RecipeFormBread';
import { RecipeFormIngredients } from './RecipeFormIngredients';
import { RecipeFormSteps } from './RecipeFormSteps';
import { purchasePriceService } from '../services/purchasePriceService';
import './RecipeForm.css';
import { ImportModal } from './ImportModal';

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

// Internal Sortable Item Component





export const RecipeForm = ({ onSave, onCancel, initialData }) => {
    const safeInitialData = initialData || {};

    const [importMode, setImportMode] = useState(null); // 'url' | 'image' | null

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

    // Transform initial steps and extract groups (similar to ingredients)
    const processedInitialSteps = useMemo(() => {
        const steps = safeInitialData.steps || [''];
        let stepGroups = safeInitialData.stepGroups || [];

        // If no explicit groups but steps have 'group' property (from import)
        // Steps might be strings or objects here
        const hasStepGroups = steps.some(s => typeof s === 'object' && s.group);

        if (stepGroups.length === 0 && hasStepGroups) {
            const groupMap = new Map();
            steps.forEach(s => {
                if (typeof s === 'object' && s.group && !groupMap.has(s.group)) {
                    groupMap.set(s.group, crypto.randomUUID());
                }
            });
            stepGroups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));
        }

        const finalSteps = steps.map(s => {
            // Handle string or object
            const text = typeof s === 'string' ? s : s.text || '';
            const id = (typeof s === 'object' && s.id) ? s.id : crypto.randomUUID();

            let groupId = (typeof s === 'object') ? s.groupId : undefined;
            const groupName = (typeof s === 'object') ? s.group : undefined;

            if (!groupId && groupName && stepGroups.length > 0) {
                const grp = stepGroups.find(g => g.name === groupName);
                if (grp) groupId = grp.id;
            }

            return { id, text, groupId };
        });

        return { steps: finalSteps, stepGroups };
    }, [safeInitialData]);

    const initialSteps = processedInitialSteps.steps;
    const initialStepGroups = processedInitialSteps.stepGroups;

    // Transform initial ingredients and extract groups if present (for imported recipes)
    const processedInitialData = useMemo(() => {
        const ingredients = safeInitialData.ingredients || [{ name: '', quantity: '', unit: '', cost: '', purchaseCost: '' }];
        let groups = safeInitialData.ingredientGroups || [];

        // If no explicit groups but ingredients have 'group' property (from import)
        if (groups.length === 0 && ingredients.some(i => i.group)) {
            const groupMap = new Map(); // Name -> ID
            // Create groups
            ingredients.forEach(i => {
                if (i.group && !groupMap.has(i.group)) {
                    groupMap.set(i.group, crypto.randomUUID());
                }
            });

            // Build group array
            groups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));

            // Assign groupIds to ingredients
            // Note: Ingredients without group will go to default (handled by RecipeFormIngredients) or we can make a default Main group
            if (groupMap.size > 0 && ingredients.some(i => !i.group)) {
                // Ensure there is a default group if we have mixed content?
                // Usually import is all grouped or not.
            }
        }

        const finalIngredients = ingredients.map(ing => {
            const base = typeof ing === 'string' ? { name: ing, quantity: '', unit: '', cost: '', purchaseCost: '' } : { ...ing, cost: ing.cost || '', purchaseCost: ing.purchaseCost || '' };

            // Map group name to ID if applicable
            let groupId = base.groupId;
            if (!groupId && base.group && groups.length > 0) {
                const grp = groups.find(g => g.name === base.group);
                if (grp) groupId = grp.id;
            }

            return { ...base, id: base.id || crypto.randomUUID(), groupId };
        });

        return { ingredients: finalIngredients, ingredientGroups: groups };
    }, [safeInitialData]);

    const initialIngredients = processedInitialData.ingredients;
    const initialIngredientGroups = processedInitialData.ingredientGroups;

    const [formData, setFormData] = useState({
        title: safeInitialData.title || '',
        description: safeInitialData.description || '',
        image: safeInitialData.image || '',
        imageFile: null, // New state for file upload
        storeName: safeInitialData.storeName || '',
        servings: safeInitialData.servings || '',
        ingredients: initialIngredients,
        ingredientGroups: initialIngredientGroups,
        steps: initialSteps, // Use transformed steps
        stepGroups: initialStepGroups,
        tags: safeInitialData.tags || [''],
        course: safeInitialData.course || '',
        category: safeInitialData.category || '',
        type: safeInitialData.type || 'normal', // 'normal' | 'bread'
        flours: safeInitialData.flours || [],
        breadIngredients: safeInitialData.breadIngredients || [],
        sourceUrl: safeInitialData.sourceUrl || '' // Add sourceUrl state
    });

    const [isDragActive, setIsDragActive] = useState(false);

    // DnD Sensors
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 1000,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleImportedRecipe = (importedData, sourceUrl = '') => {
        // Map imported ingredients to form structure
        // 1. Extract Groups
        const groupMap = new Map(); // Name -> ID
        const rawIngredients = importedData.ingredients || [];

        rawIngredients.forEach(ing => {
            // Treat 'Main' as a group too (rename to '材料') to ensure it comes first if it appears first
            let gName = ing.group || '材料';
            if (gName === 'Main') gName = '材料';

            if (!groupMap.has(gName)) {
                groupMap.set(gName, crypto.randomUUID());
            }
        });

        const newGroups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));

        // 2. Map Ingredients
        const mappedIngredients = rawIngredients.map(ing => {
            let gName = ing.group || '材料';
            if (gName === 'Main') gName = '材料';

            let groupId = undefined;
            if (groupMap.has(gName)) {
                groupId = groupMap.get(gName);
            }

            return {
                id: crypto.randomUUID(),
                name: ing.name || '',
                quantity: ing.quantity || '',
                unit: ing.unit || '',
                cost: '',
                purchaseCost: '',
                groupId // Assign Group ID
            };
        });

        // Map imported steps
        const stepGroupMap = new Map();
        const rawSteps = importedData.steps || [];

        // 1. Extract Step Groups
        rawSteps.forEach(step => {
            if (typeof step === 'object' && step.group && step.group !== 'Main') {
                if (!stepGroupMap.has(step.group)) {
                    stepGroupMap.set(step.group, crypto.randomUUID());
                }
            }
        });

        const newStepGroups = Array.from(stepGroupMap.entries()).map(([name, id]) => ({ id, name }));

        // 2. Map Steps
        const mappedSteps = rawSteps.map(step => {
            const isObj = typeof step === 'object';
            const text = isObj ? (step.text || '') : step;
            const groupName = isObj ? step.group : null;

            let groupId = undefined;
            if (groupName && stepGroupMap.has(groupName)) {
                groupId = stepGroupMap.get(groupName);
            }

            return {
                id: crypto.randomUUID(),
                text,
                groupId
            };
        });

        setFormData(prev => ({
            ...prev,
            title: importedData.name || prev.title,
            description: importedData.description || prev.description,
            category: sourceUrl ? 'URL取り込み' : (importedData.category || prev.category),
            image: importedData.image || prev.image,
            servings: importedData.recipeYield || prev.servings,
            ingredients: mappedIngredients,
            ingredientGroups: newGroups, // Set the groups
            steps: mappedSteps,
            stepGroups: newStepGroups, // Set step groups
            // Reset sections 
            ingredientSections: undefined,
            stepSections: undefined,
            sourceUrl: sourceUrl || prev.sourceUrl // Save Source URL
        }));
        setImportMode(null);
    };

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

        let finalIngredients = [];
        let finalGroups = [];

        if (formData.type === 'bread') {
            finalIngredients = formData.ingredients.map(({ id, ...rest }) => rest);
        } else {
            // Reconstruct ingredients from sections
            const sections = formData.ingredientSections || []; // Should be populated

            // If never populated (e.g. immediate submit without render?), fallback to ingredients
            if (sections.length === 0 && formData.ingredients.length > 0) {
                finalIngredients = formData.ingredients.map(({ id, ...rest }) => rest);
            } else {
                finalIngredients = sections.flatMap(section =>
                    section.items.map(item => ({
                        ...item,
                        groupId: section.id,
                    }))
                ).map(({ id, ...rest }) => rest); // Remove UI IDs

                finalGroups = sections.map(s => ({ id: s.id, name: s.name }));
            }
        }

        // Automatically derive tags from course and category
        const tagSet = new Set(formData.tags || []); // Start with existing tags to preserve 'owner:*' etc.
        if (formData.course) tagSet.add(formData.course);
        if (formData.category) tagSet.add(formData.category);
        if (formData.type === 'bread') {
            tagSet.add('パン');
        }

        // Remove empty strings
        const derivedTags = Array.from(tagSet).filter(Boolean);

        // Process Steps Sections
        let finalSteps = [];
        let finalStepGroups = [];
        const stepSections = formData.stepSections || [];

        if (stepSections.length === 0 && formData.steps.length > 0) {
            // Fallback if no sections loaded/edited (though they should be init on mount)
            // Ensure steps are objects if possible or strings
            finalSteps = formData.steps.map(s => typeof s === 'string' ? { text: s } : s);
        } else {
            finalSteps = stepSections.flatMap(section =>
                section.items.map(item => ({
                    text: item.text,
                    groupId: section.id
                }))
            );
            finalStepGroups = stepSections.map(s => ({ id: s.id, name: s.name }));
        }

        onSave({
            ...formData,
            ingredients: finalIngredients,
            ingredientGroups: finalGroups,
            steps: finalSteps, // Now passing objects with groupId instead of strings!
            stepGroups: finalStepGroups,
            image: formData.imageFile || formData.image,
            id: safeInitialData.id || Date.now(),
            tags: derivedTags,
            // Clean up temporary UI state
            ingredientSections: undefined,
            stepSections: undefined,
        });
    };

    return (
        <form className="recipe-form fade-in" onSubmit={handleSubmit}>
            {importMode && (
                <ImportModal
                    onClose={() => setImportMode(null)}
                    onImport={handleImportedRecipe}
                    initialMode={importMode}
                />
            )}
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
                                    list="category-options"
                                />
                                <datalist id="category-options">
                                    <option value="ドレッシング" />
                                    <option value="ソース" />
                                    <option value="飾り" />
                                    <option value="付け合わせ" />
                                    <option value="お菓子" />
                                </datalist>
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
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>引用元URL</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Input
                                    id="sourceUrl"
                                    value={formData.sourceUrl || ''}
                                    onChange={handleChange}
                                    placeholder="https://example.com/recipe/..."
                                    style={{ flex: 1 }}
                                />
                                {formData.sourceUrl && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setFormData(prev => ({ ...prev, sourceUrl: '' }))}
                                        title="URLを削除"
                                        style={{ color: 'var(--color-danger)' }}
                                    >
                                        ✕
                                    </Button>
                                )}
                            </div>
                        </div>
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
                                        <div style={{ width: '100%', height: '200px', backgroundColor: '#f0f0f0', position: 'relative' }}>
                                            <img
                                                src={formData.image}
                                                alt="プレビュー"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isDragActive ? 0.5 : 1 }}
                                                onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.textContent = '画像読み込みエラー'; }}
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setFormData(prev => ({ ...prev, image: '', imageFile: null }));
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    right: '8px',
                                                    background: 'rgba(0,0,0,0.6)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '50%',
                                                    width: '28px',
                                                    height: '28px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '16px',
                                                    lineHeight: 1,
                                                    zIndex: 10 // Ensure it's above the file input
                                                }}
                                                title="画像を削除"
                                            >
                                                ×
                                            </button>
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
                                        cursor: 'pointer',
                                        display: formData.image ? 'none' : 'block' // hide input if image exists so click goes to parent or we need to ensure input is still clickable for change? 
                                        // Actually if we want "Click to change", input must be active. 
                                        // But if we have a delete button on top, we need to make sure input doesn't capture that click. 
                                        // The delete button stopPropagation handles that. 
                                        // But if input is on top of everything, it will capture click even for delete button visually under it if z-index is high.
                                        // Let's adjust z-index or handle input differently.
                                    }}
                                />
                                {formData.image && (
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
                                            cursor: 'pointer',
                                            zIndex: 1 // Lower than delete button
                                        }}
                                    />
                                )}
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
                                    onClick={() => setImportMode('url')}
                                    className="btn-import-web"
                                >
                                    🌐 Web URLから自動入力
                                </Button>
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setImportMode('image')}
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

                    <div className="form-row-2">
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>店舗名</label>
                            <Input
                                id="storeName"
                                value={formData.storeName}
                                onChange={handleChange}
                                placeholder="店舗名を入力または選択"
                                list="store-options"
                            />
                            <datalist id="store-options">
                                {STORE_LIST.map(store => (
                                    <option key={store} value={store} />
                                ))}
                            </datalist>
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
                            <RecipeFormIngredients
                                formData={formData}
                                setFormData={setFormData}
                                priceList={priceList}
                            />
                        )}
                    </Card>

                    <Card>
                        <h3>作り方</h3>
                        <RecipeFormSteps formData={formData} setFormData={setFormData} />
                    </Card>


                </div>
            </div >
        </form >
    );
};




