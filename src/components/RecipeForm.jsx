import React, { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { STORE_LIST } from '../constants';
import { RecipeFormBread } from './RecipeFormBread';
import './RecipeForm.css';

export const RecipeForm = ({ onSave, onCancel, initialData }) => {
    const safeInitialData = initialData || {};
    const [formData, setFormData] = useState({
        title: safeInitialData.title || '',
        description: safeInitialData.description || '',
        image: safeInitialData.image || '',
        imageFile: null, // New state for file upload
        prepTime: safeInitialData.prepTime || '',
        cookTime: safeInitialData.cookTime || '',
        servings: safeInitialData.servings || '',
        ingredients: (safeInitialData.ingredients || [{ name: '', quantity: '', unit: '' }]).map(ing =>
            typeof ing === 'string' ? { name: ing, quantity: '', unit: '' } : ing
        ),
        steps: safeInitialData.steps || [''],
        tags: safeInitialData.tags || [''],
        course: safeInitialData.course || '',
        category: safeInitialData.category || '',
        type: safeInitialData.type || 'normal', // 'normal' | 'bread'
        flours: safeInitialData.flours || [],
        breadIngredients: safeInitialData.breadIngredients || []
    });

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
        if (property) {
            newArray[index] = { ...newArray[index], [property]: value };
        } else {
            newArray[index] = value;
        }
        setFormData(prev => ({ ...prev, [field]: newArray }));
    };

    const addArrayItem = (field, value = '') => {
        const emptyItem = field === 'ingredients' ? { name: '', quantity: '', unit: '' } : value;
        setFormData(prev => ({ ...prev, [field]: [...prev[field], emptyItem] }));
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
        onSave({
            ...formData,
            image: formData.imageFile || formData.image, // Pass file if selected, otherwise string
            id: safeInitialData.id || Date.now() // preserve ID on edit or new one on create
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
                            placeholder="例: おばあちゃんのアップルパイ"
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
                            {formData.image && (
                                <div style={{ marginBottom: '0.5rem', borderRadius: 'var(--radius-md)', overflow: 'hidden', height: '200px', backgroundColor: '#f0f0f0' }}>
                                    <img
                                        src={formData.image}
                                        alt="プレビュー"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.textContent = '画像読み込みエラー'; }}
                                    />
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                style={{ display: 'block', width: '100%', padding: '0.5rem', border: '1px solid hsl(var(--color-border))', borderRadius: 'var(--radius-md)' }}
                            />
                            {/* Hidden URL input fallback if needed, or just let file input take precedence */}
                        </div>

                        <div className="form-row-3">
                            <Input
                                label="準備時間"
                                id="prepTime"
                                value={formData.prepTime}
                                onChange={handleChange}
                                placeholder="15分"
                            />
                            <Input
                                label="調理時間"
                                id="cookTime"
                                value={formData.cookTime}
                                onChange={handleChange}
                                placeholder="30分"
                            />
                            <Input
                                label="分量"
                                id="servings"
                                value={formData.servings}
                                onChange={handleChange}
                                placeholder="4人分"
                            />
                        </div>
                    </Card>
                </div>

                <div className="form-column">
                    <Card className="mb-md">
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
                            <div className="dynamic-list">
                                {(formData.ingredients || []).map((item, i) => (
                                    <div key={i} className="dynamic-item ingredient-row" style={{ gap: '0.5rem' }}>
                                        <div className="ingredient-name">
                                            <Input
                                                value={item.name}
                                                onChange={(e) => handleArrayChange(i, e.target.value, 'ingredients', 'name')}
                                                placeholder="材料名"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div className="ingredient-qty">
                                            <Input
                                                value={item.quantity}
                                                onChange={(e) => handleArrayChange(i, e.target.value, 'ingredients', 'quantity')}
                                                placeholder="分量"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div className="ingredient-unit">
                                            <Input
                                                value={item.unit}
                                                onChange={(e) => handleArrayChange(i, e.target.value, 'ingredients', 'unit')}
                                                placeholder="単位"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        {(formData.ingredients || []).length > 1 && (
                                            <button
                                                type="button"
                                                className="remove-btn"
                                                onClick={() => removeArrayItem(i, 'ingredients')}
                                            >✕</button>
                                        )}
                                    </div>
                                ))}
                                <Button type="button" variant="secondary" size="sm" onClick={() => addArrayItem('ingredients')} block>+ 材料を追加</Button>
                            </div>
                        )}
                    </Card>

                    <Card>
                        <h3>作り方</h3>
                        <div className="dynamic-list">
                            {(formData.steps || []).map((item, i) => (
                                <div key={i} className="dynamic-item">
                                    <div className="step-count">{i + 1}</div>
                                    <Input
                                        textarea
                                        value={item}
                                        onChange={(e) => handleArrayChange(i, e.target.value, 'steps')}
                                        placeholder={`手順 ${i + 1}...`}
                                        style={{ minHeight: '80px', marginBottom: 0 }}
                                    />
                                    {(formData.steps || []).length > 1 && (
                                        <button
                                            type="button"
                                            className="remove-btn"
                                            onClick={() => removeArrayItem(i, 'steps')}
                                        >✕</button>
                                    )}
                                </div>
                            ))}
                            <Button type="button" variant="secondary" size="sm" onClick={() => addArrayItem('steps')} block>+ 作り方を追加</Button>
                        </div>
                    </Card>


                </div>
            </div >
        </form >
    );
};
