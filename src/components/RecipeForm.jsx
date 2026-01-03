import React, { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { STORE_LIST } from '../constants';
import './RecipeForm.css';

export const RecipeForm = ({ onSave, onCancel, initialData = {} }) => {
    const [formData, setFormData] = useState({
        title: initialData.title || '',
        description: initialData.description || '',
        image: initialData.image || '',
        imageFile: null, // New state for file upload
        prepTime: initialData.prepTime || '',
        cookTime: initialData.cookTime || '',
        servings: initialData.servings || '',
        ingredients: initialData.ingredients || [{ name: '', quantity: '', unit: '' }],
        steps: initialData.steps || [''],
        tags: initialData.tags || ['']
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
            id: initialData.id || Date.now() // preserve ID on edit or new one on create
        });
    };

    return (
        <form className="recipe-form fade-in" onSubmit={handleSubmit}>
            <div className="recipe-form__header">
                <h2 className="section-title">{initialData.title ? 'レシピ編集' : '新規レシピ作成'}</h2>
                <div className="recipe-form__actions">
                    <Button type="button" variant="ghost" onClick={onCancel}>キャンセル</Button>
                    <Button type="submit" variant="primary">レシピを保存</Button>
                </div>
            </div>

            <div className="recipe-form__grid">
                <div className="form-column">
                    <Card>
                        <h3>基本情報</h3>
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

                        <h3>タグ</h3>
                        <div className="dynamic-list">
                            {formData.tags.map((item, i) => (
                                <div key={i} className="dynamic-item">
                                    <Input
                                        value={item}
                                        onChange={(e) => handleArrayChange(i, e.target.value, 'tags')}
                                        placeholder={`タグ ${i + 1}`}
                                    />
                                    {formData.tags.length > 1 && (
                                        <button
                                            type="button"
                                            className="remove-btn"
                                            onClick={() => removeArrayItem(i, 'tags')}
                                        >✕</button>
                                    )}
                                </div>
                            ))}
                            <div className="tag-actions">
                                <Button type="button" variant="secondary" size="sm" onClick={() => addArrayItem('tags')} block>+ タグを追加</Button>
                                <select
                                    className="store-select"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            addArrayItem('tags', e.target.value);
                                            e.target.value = ""; // Reset
                                        }
                                    }}
                                >
                                    <option value="">店舗を選択して追加...</option>
                                    {STORE_LIST.map(store => (
                                        <option key={store} value={store}>{store}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="form-column">
                    <Card className="mb-md">
                        <h3>材料</h3>
                        <div className="dynamic-list">
                            {formData.ingredients.map((item, i) => (
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
                                    {formData.ingredients.length > 1 && (
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
                    </Card>

                    <Card>
                        <h3>作り方</h3>
                        <div className="dynamic-list">
                            {formData.steps.map((item, i) => (
                                <div key={i} className="dynamic-item">
                                    <div className="step-count">{i + 1}</div>
                                    <Input
                                        textarea
                                        value={item}
                                        onChange={(e) => handleArrayChange(i, e.target.value, 'steps')}
                                        placeholder={`手順 ${i + 1}...`}
                                        style={{ minHeight: '80px', marginBottom: 0 }}
                                    />
                                    {formData.steps.length > 1 && (
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
