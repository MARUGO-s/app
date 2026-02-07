import React, { useState, useEffect, useCallback } from 'react';
import { unitConversionService } from '../services/unitConversionService';
import { purchasePriceService } from '../services/purchasePriceService';
import { csvUnitOverrideService } from '../services/csvUnitOverrideService';
import { useToast } from '../contexts/useToast';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { Button } from './Button';
import { Input } from './Input';
import './IngredientMaster.css';

/* Additional styles for hints */
const styles = `
.input-with-hint {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.unit-hint {
    font-size: 0.75rem;
    color: #f59e0b; /* Warning/Info color */
    white-space: nowrap;
}
`;
// Inject styles (temporary quick fix, ideally move to CSS file)
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export const IngredientMaster = () => {
    const toast = useToast();
    const [ingredients, setIngredients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [csvPriceMap, setCsvPriceMap] = useState(new Map()); // name -> { price, vendor, unit, dateStr }
    const [csvUnitOverrideMap, setCsvUnitOverrideMap] = useState(new Map()); // name -> unit override
    const [csvUnitEdits, setCsvUnitEdits] = useState({}); // name -> current input value

    const loadIngredients = useCallback(async () => {
        setLoading(true);
        try {
            const [conversionsMap, prices, overrides] = await Promise.all([
                unitConversionService.getAllConversions(),
                purchasePriceService.fetchPriceList(),
                csvUnitOverrideService.getAll(),
            ]);
            const list = Array.from(conversionsMap.values()).map(item => ({
                ...item,
                isNew: false,
                isEditing: false
            }));
            setCsvPriceMap(prices || new Map());
            setCsvUnitOverrideMap(overrides || new Map());
            setIngredients(list.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, 'ja')));
        } catch (error) {
            toast.error('データの読み込みに失敗しました');
            console.error('Failed to load ingredients:', error);
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        // Avoid calling setState synchronously inside an effect body.
        const t = setTimeout(() => {
            void loadIngredients();
        }, 0);
        return () => clearTimeout(t);
    }, [loadIngredients]);

    const handleAddNew = () => {
        const newIngredient = {
            ingredientName: '',
            packetSize: '',
            packetUnit: 'g',
            lastPrice: '',
            isNew: true,
            isEditing: true
        };
        setIngredients([newIngredient, ...ingredients]);
        setEditingId(0);
    };

    const handleSave = async (index) => {
        const ingredient = ingredients[index];

        if (!ingredient.ingredientName || !ingredient.packetSize || !ingredient.lastPrice) {
            toast.warning('材料名、内容量、仕入れ値を入力してください');
            return;
        }

        try {
            await unitConversionService.saveConversion(
                ingredient.ingredientName,
                ingredient.packetSize,
                ingredient.packetUnit,
                ingredient.lastPrice
            );
            toast.success('保存しました');
            loadIngredients();
            setEditingId(null);
        } catch (error) {
            toast.error('保存に失敗しました');
            console.error('Save error:', error);
        }
    };

    const handleDelete = async (ingredientName, index) => {
        const ingredient = ingredients[index];

        if (ingredient.isNew) {
            // 新規追加中のものはキャンセル
            setIngredients(ingredients.filter((_, i) => i !== index));
            setEditingId(null);
            return;
        }

        try {
            await unitConversionService.deleteConversion(ingredientName);
            toast.success('削除しました');
            loadIngredients();
        } catch (error) {
            toast.error('削除に失敗しました');
            console.error('Delete error:', error);
        }
    };

    const handleEdit = (index) => {
        setEditingId(index);
        const updated = [...ingredients];
        updated[index].isEditing = true;
        setIngredients(updated);
    };

    const handleCancel = (index) => {
        if (ingredients[index].isNew) {
            setIngredients(ingredients.filter((_, i) => i !== index));
        } else {
            loadIngredients();
        }
        setEditingId(null);
    };

    const handleChange = (index, field, value) => {
        const updated = [...ingredients];
        updated[index][field] = value;
        setIngredients(updated);
    };

    const calculateNormalizedCost = (item) => {
        const price = parseFloat(item.lastPrice);
        const size = parseFloat(item.packetSize);
        if (!price || !size) return '-';

        const unit = item.packetUnit ? item.packetUnit.trim().toLowerCase() : '';

        if (unit === 'g' || unit === 'ｇ') {
            return `¥${Math.round((price / size) * 1000).toLocaleString()}/kg`;
        }
        if (unit === 'ml' || unit === 'cc' || unit === 'ｍｌ' || unit === 'ｃｃ') {
            return `¥${Math.round((price / size) * 1000).toLocaleString()}/L`;
        }
        // For other units (pieces, etc.), display per unit
        return `¥${Math.round(price / size).toLocaleString()}/${item.packetUnit}`;
    };

    const filteredIngredients = ingredients.filter(item =>
        item.ingredientName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getCsvUnit = (ingredientName) => {
        const key = normalizeIngredientKey(ingredientName);
        if (!key) return '-';
        const entry = csvPriceMap?.get(key) || null;
        const unit = entry?.unit;
        return unit ? String(unit) : '-';
    };

    const getEditableCsvUnit = (ingredientName) => {
        const name = (ingredientName ?? '').toString().trim();
        if (!name) return '';
        if (Object.prototype.hasOwnProperty.call(csvUnitEdits, name)) return csvUnitEdits[name];
        const override = csvUnitOverrideMap?.get(name);
        if (override) return String(override);
        const base = getCsvUnit(name);
        return base === '-' ? '' : base;
    };

    const saveCsvUnitOverride = async (ingredientName, unitValue) => {
        const name = (ingredientName ?? '').toString().trim();
        const unit = (unitValue ?? '').toString().trim();
        if (!name) return;
        if (!unit) {
            // allow clearing local input without writing empty to DB
            setCsvUnitEdits(prev => {
                const next = { ...prev };
                delete next[name];
                return next;
            });
            return;
        }
        try {
            await csvUnitOverrideService.upsert(name, unit);
            // update local map so UI reflects immediately
            setCsvUnitOverrideMap(prev => {
                const next = new Map(prev);
                next.set(name, unit);
                return next;
            });
            toast.success('元の単位（CSV）を保存しました');
        } catch (e) {
            console.error(e);
            toast.error(e?.message || '保存に失敗しました');
        }
    };

    return (
        <div className="ingredient-master-container">
            <div className="master-header">
                <h3>📦 材料マスター管理</h3>
                <Button variant="primary" onClick={handleAddNew} disabled={editingId !== null}>
                    + 新規材料
                </Button>
            </div>

            <div className="master-search">
                <Input
                    placeholder="材料名で検索..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="master-loading">読み込み中...</div>
            ) : (
                <div className="master-table-wrapper">
                    <table className="master-table">
                        <thead>
                            <tr>
                                <th>材料名</th>
                                <th>仕入れ値（円）</th>
                                <th>内容量</th>
                                <th>単位</th>
                                <th>元の単位（CSV）</th>
                                <th>換算単価</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredIngredients.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', color: '#999' }}>
                                        {searchQuery ? '該当する材料がありません' : '材料データがありません'}
                                    </td>
                                </tr>
                            ) : (
                                filteredIngredients.map((item, index) => (
                                    <tr key={index} className={item.isEditing ? 'editing' : ''}>
                                        <td>
                                            {item.isEditing ? (
                                                <Input
                                                    value={item.ingredientName}
                                                    onChange={e => handleChange(index, 'ingredientName', e.target.value)}
                                                    placeholder="例: 強力粉"
                                                    disabled={!item.isNew}
                                                />
                                            ) : (
                                                item.ingredientName
                                            )}
                                        </td>
                                        <td>
                                            {item.isEditing ? (
                                                <Input
                                                    type="number"
                                                    value={item.lastPrice}
                                                    onChange={e => handleChange(index, 'lastPrice', e.target.value)}
                                                    placeholder="例: 500"
                                                />
                                            ) : (
                                                `¥${parseFloat(item.lastPrice || 0).toLocaleString()}`
                                            )}
                                        </td>
                                        <td>
                                            {item.isEditing ? (
                                                <div className="input-with-hint">
                                                    <Input
                                                        type="number"
                                                        value={item.packetSize}
                                                        onChange={e => handleChange(index, 'packetSize', e.target.value)}
                                                        placeholder={['個', '本', '枚', 'PC', '箱', '缶', '包'].includes(item.packetUnit) ? '数量 (例: 1)' : '例: 1000'}
                                                    />
                                                    {['個', '本', '枚', 'PC', '箱', '缶', '包'].includes(item.packetUnit) && (
                                                        <span className="unit-hint">1{item.packetUnit}あたりの価格なら「1」</span>
                                                    )}
                                                </div>
                                            ) : (
                                                item.packetSize
                                            )}
                                        </td>
                                        <td>
                                            {item.isEditing ? (
                                                <select
                                                    value={item.packetUnit}
                                                    onChange={e => handleChange(index, 'packetUnit', e.target.value)}
                                                    className="unit-select"
                                                >
                                                    <option value="g">g</option>
                                                    <option value="ml">ml</option>
                                                    <option value="個">個</option>
                                                    <option value="袋">袋</option>
                                                    <option value="本">本</option>
                                                    <option value="枚">枚</option>
                                                    <option value="パック">パック</option>
                                                    <option value="cc">cc</option>
                                                </select>
                                            ) : (
                                                item.packetUnit
                                            )}
                                        </td>
                                        <td className="csv-unit-cell">
                                            <Input
                                                value={getEditableCsvUnit(item.ingredientName)}
                                                onChange={(e) => {
                                                    const name = (item.ingredientName ?? '').toString().trim();
                                                    const val = e.target.value;
                                                    setCsvUnitEdits(prev => ({ ...prev, [name]: val }));
                                                }}
                                                onBlur={(e) => saveCsvUnitOverride(item.ingredientName, e.target.value)}
                                                placeholder={getCsvUnit(item.ingredientName) === '-' ? '未設定' : `CSV: ${getCsvUnit(item.ingredientName)}`}
                                            />
                                        </td>
                                        <td className="normalized-cost">{calculateNormalizedCost(item)}</td>
                                        <td>
                                            <div className="action-buttons">
                                                {item.isEditing ? (
                                                    <>
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() => handleSave(index)}
                                                        >
                                                            保存
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleCancel(index)}
                                                        >
                                                            キャンセル
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleEdit(index)}
                                                            disabled={editingId !== null}
                                                        >
                                                            編集
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDelete(item.ingredientName, index)}
                                                            disabled={editingId !== null}
                                                        >
                                                            削除
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="master-info">
                <p>💡 ここで設定した原価情報は、レシピ作成時に自動的に反映されます</p>
            </div>
        </div>
    );
};
