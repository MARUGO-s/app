import React, { useMemo, useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { STORE_LIST } from '../constants';
import { RecipeFormBread } from './RecipeFormBread';
import { RecipeFormIngredients } from './RecipeFormIngredients';
import { RecipeFormSteps } from './RecipeFormSteps';
import { purchasePriceService } from '../services/purchasePriceService';
import { ImportModal } from './ImportModal';
import './RecipeFormMock.css';

// UI Mock for RecipeForm (keeps existing data behavior, only changes layout/styles).
export const RecipeFormMock = ({ onSave, onCancel, initialData }) => {
    const safeInitialData = initialData || {};

    const [workTab, setWorkTab] = useState('ingredients'); // 'ingredients' | 'steps'
    const [importMode, setImportMode] = useState(null); // 'url' | 'image' | null

    // Price list cache
    const [priceList, setPriceList] = useState(new Map());

    React.useEffect(() => {
        const loadPrices = async () => {
            const prices = await purchasePriceService.fetchPriceList();
            setPriceList(prices);
        };
        loadPrices();
    }, []);

    // Transform initial steps and extract groups (same behavior as RecipeForm)
    const processedInitialSteps = useMemo(() => {
        const steps = safeInitialData.steps || [''];
        let stepGroups = safeInitialData.stepGroups || [];

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

    // Transform initial ingredients and extract groups if present (same behavior as RecipeForm)
    const processedInitialData = useMemo(() => {
        const ingredients = safeInitialData.ingredients || [{ name: '', quantity: '', unit: '', cost: '', purchaseCost: '' }];
        let groups = safeInitialData.ingredientGroups || [];

        if (groups.length === 0 && ingredients.some(i => i.group)) {
            const groupMap = new Map(); // Name -> ID
            ingredients.forEach(i => {
                if (i.group && !groupMap.has(i.group)) {
                    groupMap.set(i.group, crypto.randomUUID());
                }
            });
            groups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));
        }

        const finalIngredients = ingredients.map(ing => {
            const base = typeof ing === 'string'
                ? { name: ing, quantity: '', unit: '', cost: '', purchaseCost: '' }
                : { ...ing, cost: ing.cost || '', purchaseCost: ing.purchaseCost || '' };

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
        imageFile: null,
        storeName: safeInitialData.storeName || '',
        servings: safeInitialData.servings || '',
        ingredients: initialIngredients,
        ingredientGroups: initialIngredientGroups,
        steps: initialSteps,
        stepGroups: initialStepGroups,
        tags: safeInitialData.tags || [''],
        course: safeInitialData.course || '',
        category: safeInitialData.category || '',
        type: safeInitialData.type || 'normal', // 'normal' | 'bread'
        flours: safeInitialData.flours || [],
        breadIngredients: safeInitialData.breadIngredients || [],
        sourceUrl: safeInitialData.sourceUrl || ''
    });

    const [isDragActive, setIsDragActive] = useState(false);

    const handleImportedRecipe = (importedData, sourceUrl = '') => {
        const groupMap = new Map(); // Name -> ID
        const rawIngredients = importedData.ingredients || [];

        rawIngredients.forEach(ing => {
            let gName = ing.group || '材料';
            if (gName === 'Main') gName = '材料';
            if (!groupMap.has(gName)) groupMap.set(gName, crypto.randomUUID());
        });
        const newGroups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));

        const mappedIngredients = rawIngredients.map(ing => {
            let gName = ing.group || '材料';
            if (gName === 'Main') gName = '材料';
            const groupId = groupMap.get(gName);

            return {
                id: crypto.randomUUID(),
                name: ing.name || '',
                quantity: ing.quantity || '',
                unit: ing.unit || '',
                cost: '',
                purchaseCost: '',
                groupId
            };
        });

        const stepGroupMap = new Map();
        const rawSteps = importedData.steps || [];
        rawSteps.forEach(step => {
            if (typeof step === 'object' && step.group && step.group !== 'Main') {
                if (!stepGroupMap.has(step.group)) stepGroupMap.set(step.group, crypto.randomUUID());
            }
        });
        const newStepGroups = Array.from(stepGroupMap.entries()).map(([name, id]) => ({ id, name }));

        const mappedSteps = rawSteps.map(step => {
            const isObj = typeof step === 'object';
            const text = isObj ? (step.text || '') : step;
            const groupName = isObj ? step.group : null;
            const groupId = groupName && stepGroupMap.has(groupName) ? stepGroupMap.get(groupName) : undefined;
            return { id: crypto.randomUUID(), text, groupId };
        });

        setFormData(prev => ({
            ...prev,
            title: importedData.name || prev.title,
            description: importedData.description || prev.description,
            category: sourceUrl ? 'URL取り込み' : (importedData.category || prev.category),
            image: importedData.image || prev.image,
            servings: importedData.recipeYield || prev.servings,
            ingredients: mappedIngredients,
            ingredientGroups: newGroups,
            steps: mappedSteps,
            stepGroups: newStepGroups,
            ingredientSections: undefined,
            stepSections: undefined,
            sourceUrl: sourceUrl || prev.sourceUrl
        }));
        setImportMode(null);
        setWorkTab('ingredients');
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
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
                    image: URL.createObjectURL(file)
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
                image: URL.createObjectURL(file)
            }));
        }
    };

    const ingredientCount = useMemo(() => {
        if (formData.type === 'bread') {
            return (formData.flours?.length || 0) + (formData.breadIngredients?.length || 0);
        }
        const sections = formData.ingredientSections || [];
        if (sections.length > 0) {
            return sections.reduce((sum, s) => sum + ((s?.items?.length) || 0), 0);
        }
        return formData.ingredients?.length || 0;
    }, [formData.breadIngredients, formData.flours, formData.ingredientSections, formData.ingredients, formData.type]);

    const stepCount = useMemo(() => {
        const sections = formData.stepSections || [];
        if (sections.length > 0) {
            return sections.reduce((sum, s) => sum + ((s?.items?.length) || 0), 0);
        }
        return formData.steps?.length || 0;
    }, [formData.stepSections, formData.steps]);

    const handleSubmit = (e) => {
        e.preventDefault();

        let finalIngredients = [];
        let finalGroups = [];

        if (formData.type === 'bread') {
            finalIngredients = formData.ingredients.map((item) => {
                const { id: _id, ...rest } = item;
                return rest;
            });
        } else {
            const sections = formData.ingredientSections || [];

            if (sections.length === 0 && formData.ingredients.length > 0) {
                finalIngredients = formData.ingredients.map((item) => {
                    const { id: _id, ...rest } = item;
                    return rest;
                });
            } else {
                finalIngredients = sections.flatMap(section =>
                    section.items.map(item => ({
                        ...item,
                        groupId: section.id,
                    }))
                ).map((item) => {
                    const { id: _id, ...rest } = item;
                    return rest;
                });

                finalGroups = sections.map(s => ({ id: s.id, name: s.name }));
            }
        }

        const tagSet = new Set(formData.tags || []);
        if (formData.course) tagSet.add(formData.course);
        if (formData.category) tagSet.add(formData.category);
        if (formData.type === 'bread') tagSet.add('パン');
        const derivedTags = Array.from(tagSet).filter(Boolean);

        let finalSteps = [];
        let finalStepGroups = [];
        const stepSections = formData.stepSections || [];

        if (stepSections.length === 0 && formData.steps.length > 0) {
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
            steps: finalSteps,
            stepGroups: finalStepGroups,
            image: formData.imageFile || formData.image,
            id: safeInitialData.id || Date.now(),
            tags: derivedTags,
            ingredientSections: undefined,
            stepSections: undefined,
        });
    };

    const isEdit = Boolean(safeInitialData?.title);

    return (
        <form className="recipe-form-mock fade-in" onSubmit={handleSubmit}>
            {importMode && (
                <ImportModal
                    onClose={() => setImportMode(null)}
                    onImport={handleImportedRecipe}
                    initialMode={importMode}
                />
            )}

            <div className="recipe-form-mock__page">
                <div className="recipe-form-mock__commandbar" role="banner">
                    <div className="recipe-form-mock__commandbar-inner">
                        <div className="recipe-form-mock__crumb">
                            <span className="recipe-form-mock__crumb-app">Recipe</span>
                            <span className="recipe-form-mock__crumb-sep">/</span>
                            <span className="recipe-form-mock__crumb-page">
                                {isEdit ? 'レシピ編集' : '新規レシピ作成'}
                            </span>
                            <span className="recipe-form-mock__crumb-badge">UIモック</span>
                        </div>
                        <div className="recipe-form-mock__actions">
                            <Button type="button" variant="ghost" onClick={onCancel}>キャンセル</Button>
                            <Button type="submit" variant="primary">レシピを保存</Button>
                        </div>
                    </div>
                </div>

                <div className="recipe-form-mock__sheet">
                    <header className="recipe-form-mock__doc">
                        <div className="recipe-form-mock__doc-title">
                            <input
                                id="title"
                                className="recipe-form-mock__title-input"
                                value={formData.title}
                                onChange={handleChange}
                                placeholder="レシピ名を入力"
                                required
                            />
                            <div className="recipe-form-mock__doc-sub">
                                まずはレシピ名と基本情報を入力し、材料と作り方を追加します。
                            </div>
                        </div>

                        <div className="recipe-form-mock__meta-grid">
                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="コース"
                                    id="course"
                                    value={formData.course}
                                    onChange={handleChange}
                                    placeholder="例: 前菜, メイン"
                                    list="course-options"
                                    wrapperClassName="input-group--no-margin"
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

                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="カテゴリー"
                                    id="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    placeholder="例: ソース, 付け合わせ"
                                    list="category-options"
                                    wrapperClassName="input-group--no-margin"
                                />
                                <datalist id="category-options">
                                    <option value="ドレッシング" />
                                    <option value="ソース" />
                                    <option value="飾り" />
                                    <option value="付け合わせ" />
                                    <option value="お菓子" />
                                </datalist>
                            </div>

                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="店舗名"
                                    id="storeName"
                                    value={formData.storeName}
                                    onChange={handleChange}
                                    placeholder="店舗名を入力または選択"
                                    list="store-options"
                                    wrapperClassName="input-group--no-margin"
                                />
                                <datalist id="store-options">
                                    {STORE_LIST.map(store => (
                                        <option key={store} value={store} />
                                    ))}
                                </datalist>
                            </div>

                            <div className="recipe-form-mock__meta-field">
                                <Input
                                    label="分量"
                                    id="servings"
                                    value={formData.servings}
                                    onChange={handleChange}
                                    placeholder="4人分"
                                    wrapperClassName="input-group--no-margin"
                                />
                            </div>
                        </div>
                    </header>

                    <div className="recipe-form-mock__grid">
                        <aside className="recipe-form-mock__col recipe-form-mock__col--side">
                            <Card className="recipe-form-mock__card recipe-form-mock__card--notes">
                                <div className="recipe-form-mock__card-title">
                                    メモ
                                </div>
                                <Input
                                    label="説明"
                                    id="description"
                                    textarea
                                    value={formData.description}
                                    onChange={handleChange}
                                    placeholder="料理のポイント、仕込み、注意点など..."
                                />
                                <Input
                                    label="引用元URL"
                                    id="sourceUrl"
                                    value={formData.sourceUrl || ''}
                                    onChange={handleChange}
                                    placeholder="https://example.com/recipe/..."
                                />
                            </Card>

                            <Card className="recipe-form-mock__card recipe-form-mock__card--image">
                                <div className="recipe-form-mock__card-title">
                                    画像
                                </div>
                                <div
                                    className={`recipe-form-mock__image-drop ${isDragActive ? 'is-active' : ''}`}
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                >
                                    {formData.image ? (
                                        <div className="recipe-form-mock__image-preview">
                                            <img
                                                src={formData.image}
                                                alt="プレビュー"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                            <button
                                                type="button"
                                                className="recipe-form-mock__image-remove"
                                                onClick={() => setFormData(prev => ({ ...prev, image: '', imageFile: null }))}
                                                title="画像を削除"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="recipe-form-mock__image-empty">
                                            クリックして画像を選択
                                            <div className="recipe-form-mock__image-sub">またはドラッグ＆ドロップ</div>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        className="recipe-form-mock__image-input"
                                    />
                                </div>
                            </Card>

                            {!safeInitialData?.id && (
                                <Card className="recipe-form-mock__card recipe-form-mock__card--import">
                                    <div className="recipe-form-mock__card-title">
                                        取り込み
                                    </div>
                                    <div className="recipe-form-mock__import-actions">
                                        <Button
                                            variant="secondary"
                                            type="button"
                                            onClick={() => setImportMode('url')}
                                        >
                                            URL取り込み
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            type="button"
                                            onClick={() => setImportMode('image')}
                                        >
                                            画像解析
                                        </Button>
                                    </div>
                                    <div className="recipe-form-mock__import-note">
                                        取り込み後も内容は編集できます。
                                    </div>
                                </Card>
                            )}

                            <Card className="recipe-form-mock__card recipe-form-mock__card--tips">
                                <div className="recipe-form-mock__card-title">
                                    使い方
                                </div>
                                <ul className="recipe-form-mock__tips-list">
                                    <li>材料と手順はドラッグで並び替えできます。</li>
                                    <li>材料名は入力候補から選ぶと、仕入れ単価が自動入力されます。</li>
                                    <li>保存はいつでも可能です。</li>
                                </ul>
                            </Card>
                        </aside>

                        <section className="recipe-form-mock__col recipe-form-mock__col--main">
                            <div className="recipe-form-mock__workspace" role="region" aria-label="編集エリア">
                                <div className="recipe-form-mock__workspace-head">
                                    <div className="recipe-form-mock__nav">
                                        <button
                                            type="button"
                                            className={`recipe-form-mock__nav-btn recipe-form-mock__nav-btn--ingredients ${workTab === 'ingredients' ? 'active' : ''}`}
                                            onClick={() => setWorkTab('ingredients')}
                                        >
                                            材料 <span className="recipe-form-mock__nav-count">{ingredientCount.toLocaleString()}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`recipe-form-mock__nav-btn recipe-form-mock__nav-btn--steps ${workTab === 'steps' ? 'active' : ''}`}
                                            onClick={() => setWorkTab('steps')}
                                        >
                                            作り方 <span className="recipe-form-mock__nav-count">{stepCount.toLocaleString()}</span>
                                        </button>
                                    </div>

                                    <div className="recipe-form-mock__workspace-right">
                                        {workTab === 'ingredients' ? (
                                            <div className="recipe-form-mock__segmented">
                                                <button
                                                    type="button"
                                                    className={`recipe-form-mock__seg-btn ${formData.type === 'normal' ? 'active' : ''}`}
                                                    onClick={() => setFormData(prev => ({ ...prev, type: 'normal' }))}
                                                >
                                                    通常
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`recipe-form-mock__seg-btn ${formData.type === 'bread' ? 'active' : ''}`}
                                                    onClick={() => setFormData(prev => ({ ...prev, type: 'bread' }))}
                                                >
                                                    パン
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="recipe-form-mock__hint">
                                                ドラッグで並び替えできます
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="recipe-form-mock__workspace-body">
                                    {workTab === 'ingredients' ? (
                                        <div className="recipe-form-mock__editor-surface">
                                            {formData.type === 'bread' ? (
                                                <RecipeFormBread formData={formData} setFormData={setFormData} />
                                            ) : (
                                                <RecipeFormIngredients
                                                    formData={formData}
                                                    setFormData={setFormData}
                                                    priceList={priceList}
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="recipe-form-mock__editor-surface">
                                            <RecipeFormSteps formData={formData} setFormData={setFormData} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </form>
    );
};
