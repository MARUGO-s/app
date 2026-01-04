import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { purchasePriceService } from '../services/purchasePriceService';
import './RecipeForm.css'; // Reuse basic styles
import './RecipeFormBread.css'; // Add specialized styles

export const RecipeFormBread = ({ formData, setFormData }) => {
    // Local state for calculation convenience, synced with parent formData
    // We expect formData to have 'flours' and 'breadIngredients' arrays
    // If not, we initialize them or map from existing ingredients

    // Price list cache
    const [priceList, setPriceList] = useState(new Map());

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
            const refPrice = priceList.get(value);
            if (refPrice !== undefined) {
                // Use refPrice as a hint or default?
                // Let's set it as a property specifically for reference
                newFlours[index].purchaseCostRef = refPrice;
                // If no cost set yet, maybe set it? Or just show as placeholder?
                // User asked to 'display it... directly input'
                // Let's just track the ref price for placeholder/display
            } else {
                newFlours[index].purchaseCostRef = null;
            }
        }

        // If updating quantity, allow decimal input but store as string. Calculation handles parsing.
        setFormData(prev => ({ ...prev, flours: newFlours }));
    };

    const handleIngredientChange = (index, field, value) => {
        const newIngs = [...(formData.breadIngredients || [])];
        newIngs[index] = { ...newIngs[index], [field]: value };

        if (field === 'name') {
            const refPrice = priceList.get(value);
            if (refPrice !== undefined) {
                newIngs[index].purchaseCostRef = refPrice;
            } else {
                newIngs[index].purchaseCostRef = null;
            }
        }
        setFormData(prev => ({ ...prev, breadIngredients: newIngs }));
    };

    const addFlour = () => {
        setFormData(prev => ({
            ...prev,
            flours: [...(prev.flours || []), { name: '', quantity: '', unit: 'g', cost: '' }]
        }));
    };

    const addIngredient = () => {
        setFormData(prev => ({
            ...prev,
            breadIngredients: [...(prev.breadIngredients || []), { name: '', quantity: '', unit: 'g', cost: '' }]
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

    // Provide initial structure if empty
    useEffect(() => {
        if (!formData.flours) {
            setFormData(prev => ({ ...prev, flours: [{ name: '', quantity: '', unit: 'g', cost: '' }] }));
        }
        if (!formData.breadIngredients) {
            setFormData(prev => ({ ...prev, breadIngredients: [{ name: '', quantity: '', unit: 'g', cost: '' }] }));
        }
    }, []);

    return (
        <div className="bread-form">
            <Card className="mb-md bread-card">
                <div className="bread-header">
                    <h3>粉グループ (Total: {totalFlour}g)</h3>
                    <span className="bread-badge">Base (100%)</span>
                </div>

                <div className="bread-grid-header">
                    <span>粉の種類</span>
                    <span>重量 (g)</span>
                    <span className="text-center">%</span>
                    <span style={{ width: '80px' }}>原価</span>
                    <span></span>
                </div>

                <div className="bread-grid-body">
                    {(formData.flours || []).map((item, i) => (
                        <div key={`flour-${i}`} className="bread-row">
                            <Input
                                value={item.name}
                                onChange={(e) => handleFlourChange(i, 'name', e.target.value)}
                                placeholder="例: 強力粉"
                                className="bread-input name"
                            />
                            <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleFlourChange(i, 'quantity', e.target.value)}
                                placeholder="0"
                                className="bread-input qty"
                            />
                            <div className="bread-percent">
                                {calculatePercentage(item.quantity)}%
                            </div>
                            <Input
                                type="number"
                                value={item.purchaseCost || ''}
                                onChange={(e) => handleFlourChange(i, 'purchaseCost', e.target.value)}
                                placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                                className="bread-input cost"
                                style={{ width: '80px', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '' }}
                                min="0"
                                title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
                            />
                            <Input
                                type="number"
                                value={item.cost || ''}
                                onChange={(e) => handleFlourChange(i, 'cost', e.target.value)}
                                placeholder="原価"
                                className="bread-input cost"
                                style={{ width: '80px' }}
                                min="0"
                            />
                            {(formData.flours || []).length > 1 && (
                                <button type="button" className="bread-remove" onClick={() => removeFlour(i)}>×</button>
                            )}
                        </div>
                    ))}
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addFlour} block style={{ marginTop: '0.5rem' }}>+ 粉を追加</Button>
            </Card>

            <Card className="mb-md bread-card">
                <div className="bread-header">
                    <h3>その他材料</h3>
                    <span className="bread-subtitle">Water, Salt, Yeast, etc.</span>
                </div>

                <div className="bread-grid-header">
                    <span>材料名</span>
                    <span>重量 (g)</span>
                    <span className="text-center">%</span>
                    <span style={{ width: '80px' }}>原価</span>
                    <span></span>
                </div>

                <div className="bread-grid-body">
                    {(formData.breadIngredients || []).map((item, i) => (
                        <div key={`ing-${i}`} className="bread-row">
                            <Input
                                value={item.name}
                                onChange={(e) => handleIngredientChange(i, 'name', e.target.value)}
                                placeholder="例: 塩"
                                className="bread-input name"
                            />
                            <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleIngredientChange(i, 'quantity', e.target.value)}
                                placeholder="0"
                                className="bread-input qty"
                            />
                            <div className="bread-percent">
                                {calculatePercentage(item.quantity)}%
                            </div>
                            <Input
                                type="number"
                                value={item.purchaseCost || ''}
                                onChange={(e) => handleIngredientChange(i, 'purchaseCost', e.target.value)}
                                placeholder={item.purchaseCostRef ? `Ref: ¥${item.purchaseCostRef}` : "仕入れ"}
                                className="bread-input cost"
                                style={{ width: '80px', borderColor: item.purchaseCostRef && !item.purchaseCost ? 'orange' : '' }}
                                min="0"
                                title={item.purchaseCostRef ? `参考価格: ¥${item.purchaseCostRef}` : "No data"}
                            />
                            <Input
                                type="number"
                                value={item.cost || ''}
                                onChange={(e) => handleIngredientChange(i, 'cost', e.target.value)}
                                placeholder="原価"
                                className="bread-input cost"
                                style={{ width: '80px' }}
                                min="0"
                            />
                            <button type="button" className="bread-remove" onClick={() => removeIngredient(i)}>×</button>
                        </div>
                    ))}
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addIngredient} block style={{ marginTop: '0.5rem' }}>+ 材料を追加</Button>
            </Card >
        </div >
    );
};
