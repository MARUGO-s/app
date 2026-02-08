import React, { useState, useEffect, useCallback } from 'react';
import { unitConversionService } from '../services/unitConversionService';
import { purchasePriceService } from '../services/purchasePriceService';
import { csvUnitOverrideService } from '../services/csvUnitOverrideService';
import { userService } from '../services/userService';
import { useToast } from '../contexts/useToast';
import { useAuth } from '../contexts/useAuth';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import './IngredientMaster.css';

export const IngredientMaster = () => {
    const toast = useToast();
    const { user } = useAuth();
    const [ingredients, setIngredients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all'); // all | manual | food | alcohol | soft_drink | supplies
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [csvPriceMap, setCsvPriceMap] = useState(new Map()); // name -> { price, vendor, unit, dateStr }
    const [csvUnitOverrideMap, setCsvUnitOverrideMap] = useState(new Map()); // name -> unit override
    const [csvUnitEdits, setCsvUnitEdits] = useState({}); // name -> current input value

    // Copy ingredient master to another account (admin-only)
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [copyProfiles, setCopyProfiles] = useState([]);
    const [copyProfilesLoading, setCopyProfilesLoading] = useState(false);
    const [copyProfilesError, setCopyProfilesError] = useState('');
    const [copyTargetId, setCopyTargetId] = useState('');
    const [copyOverwrite, setCopyOverwrite] = useState(false);
    const [copyInProgress, setCopyInProgress] = useState(false);
    const [copyResult, setCopyResult] = useState(null); // { type, message, details? }
    const [copyConfirming, setCopyConfirming] = useState(false);

    const CATEGORY_MANUAL_KEY = 'manual';

    const normalizeItemCategory = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) return 'food';
        if (normalized === 'food_alcohol') return 'food';
        if (['food', 'alcohol', 'soft_drink', 'supplies'].includes(normalized)) return normalized;
        return 'food';
    };

    const categoryTabs = ([
        { key: 'all', label: '全て' },
        { key: 'food', label: '食材' },
        { key: 'alcohol', label: 'アルコール' },
        { key: 'soft_drink', label: 'ソフトドリンク' },
        { key: 'supplies', label: '備品' },
        { key: CATEGORY_MANUAL_KEY, label: '手入力' },
    ]);

    const hasCsvPrice = useCallback((ingredientName) => {
        const key = normalizeIngredientKey(ingredientName);
        if (!key) return false;
        return csvPriceMap?.has(key);
    }, [csvPriceMap]);

    const categoryCounts = React.useMemo(() => {
        const counts = {
            all: ingredients.length,
            food: 0,
            alcohol: 0,
            soft_drink: 0,
            supplies: 0,
            [CATEGORY_MANUAL_KEY]: 0,
        };
        ingredients.forEach((item) => {
            const key = normalizeItemCategory(item?.itemCategory);
            counts[key] = (counts[key] || 0) + 1;
            if (!hasCsvPrice(item?.ingredientName)) {
                counts[CATEGORY_MANUAL_KEY] = (counts[CATEGORY_MANUAL_KEY] || 0) + 1;
            }
        });
        return counts;
    }, [ingredients, hasCsvPrice]);

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
                // Stable key for filtered views (ingredientName is unique for persisted rows).
                clientId: item.ingredientName,
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
        const clientId = `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const baseCategory = ['food', 'alcohol', 'soft_drink', 'supplies'].includes(categoryFilter)
            ? categoryFilter
            : 'food';
        const newIngredient = {
            clientId,
            ingredientName: '',
            vendor: '',
            packetSize: '',
            packetUnit: 'g',
            lastPrice: '',
            yieldPercent: 100,
            itemCategory: baseCategory,
            isNew: true,
            isEditing: true
        };
        setIngredients(prev => [newIngredient, ...prev.map(i => ({ ...i, isEditing: false }))]);
        setEditingId(clientId);
    };

    const findIndexByClientId = useCallback((clientId) => {
        return ingredients.findIndex(i => i?.clientId === clientId);
    }, [ingredients]);

    const handleSave = async (clientId) => {
        const index = findIndexByClientId(clientId);
        if (index < 0) return;
        const ingredient = ingredients[index];

        if (!ingredient.ingredientName || !ingredient.packetSize || !ingredient.lastPrice) {
            toast.warning('材料名、内容量、仕入れ値を入力してください');
            return;
        }

        const rawYield = parseFloat(ingredient.yieldPercent);
        const normalizedYield = Number.isFinite(rawYield) ? rawYield : 100;
        if (normalizedYield <= 0 || normalizedYield > 100) {
            toast.warning('歩留まり（%）は 1〜100 の範囲で入力してください');
            return;
        }

        try {
            await unitConversionService.saveConversion(
                ingredient.ingredientName,
                ingredient.packetSize,
                ingredient.packetUnit,
                ingredient.lastPrice,
                ingredient.itemCategory,
                ingredient.vendor,
                normalizedYield
            );
            toast.success('保存しました');
            loadIngredients();
            setEditingId(null);
        } catch (error) {
            toast.error('保存に失敗しました');
            console.error('Save error:', error);
        }
    };

    const handleDelete = async (clientId) => {
        const index = findIndexByClientId(clientId);
        if (index < 0) return;
        const ingredient = ingredients[index];
        const ingredientName = ingredient?.ingredientName;

        if (ingredient.isNew) {
            // 新規追加中のものはキャンセル
            setIngredients(prev => prev.filter(i => i?.clientId !== clientId));
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

    const handleEdit = (clientId) => {
        setEditingId(clientId);
        setIngredients(prev => prev.map(i => ({
            ...i,
            isEditing: i?.clientId === clientId
        })));
    };

    const handleCancel = (clientId) => {
        const index = findIndexByClientId(clientId);
        if (index < 0) return;
        if (ingredients[index].isNew) {
            setIngredients(prev => prev.filter(i => i?.clientId !== clientId));
        } else {
            loadIngredients();
        }
        setEditingId(null);
    };

    const handleChange = (clientId, field, value) => {
        setIngredients(prev => prev.map(i => {
            if (i?.clientId !== clientId) return i;
            return { ...i, [field]: value };
        }));
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

    const filteredIngredients = ingredients.filter(item => {
        const name = String(item?.ingredientName || '');
        const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
        if (categoryFilter === 'all') return true;
        if (categoryFilter === CATEGORY_MANUAL_KEY) {
            return !hasCsvPrice(name);
        }
        return normalizeItemCategory(item?.itemCategory) === categoryFilter;
    });

    const isFilteredView = categoryFilter !== 'all' || String(searchQuery || '').trim() !== '';

    const getCsvUnit = (ingredientName) => {
        const key = normalizeIngredientKey(ingredientName);
        if (!key) return '-';
        const entry = csvPriceMap?.get(key) || null;
        const unit = entry?.unit;
        return unit ? String(unit) : '-';
    };

    const getCsvVendor = (ingredientName) => {
        const key = normalizeIngredientKey(ingredientName);
        if (!key) return '';
        const entry = csvPriceMap?.get(key) || null;
        const vendor = entry?.vendor;
        return vendor ? String(vendor) : '';
    };

    const getDisplayVendor = (item) => {
        const masterVendor = String(item?.vendor || '').trim();
        if (masterVendor) return masterVendor;
        return getCsvVendor(item?.ingredientName);
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

    const getDisplayCsvUnit = (ingredientName) => {
        const name = (ingredientName ?? '').toString().trim();
        if (!name) return '-';
        const override = csvUnitOverrideMap?.get(name);
        if (override) return String(override);
        return getCsvUnit(name);
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

    const openCopyModal = async () => {
        if (user?.role !== 'admin') return;

        setCopyModalOpen(true);
        setCopyProfilesError('');
        setCopyProfiles([]);
        setCopyTargetId('');
        setCopyOverwrite(false);
        setCopyResult(null);
        setCopyConfirming(false);

        setCopyProfilesLoading(true);
        try {
            const profiles = await userService.fetchAllProfiles();
            setCopyProfiles(profiles || []);
        } catch (e) {
            console.error(e);
            setCopyProfilesError('ユーザー一覧の取得に失敗しました（管理者権限が必要です）。');
        } finally {
            setCopyProfilesLoading(false);
        }
    };

    const closeCopyModal = () => {
        if (copyInProgress) return;
        setCopyConfirming(false);
        setCopyModalOpen(false);
    };

    const startCopyToAccount = async () => {
        if (!copyTargetId || copyInProgress) return;

        setCopyInProgress(true);
        setCopyResult({ type: 'info', message: 'コピー中...' });
        try {
            const res = await unitConversionService.adminCopyIngredientMasterToUser(copyTargetId, { overwrite: copyOverwrite });
            const uc = res?.unit_conversions || {};
            const cu = res?.csv_unit_overrides || {};

            const line1 = `材料: ${Number(uc.source_total || 0).toLocaleString()}件 → 追加 ${Number(uc.copied || 0).toLocaleString()} / 上書き ${Number(uc.updated || 0).toLocaleString()} / スキップ ${Number(uc.skipped || 0).toLocaleString()}`;
            const line2 = `元の単位(CSV): ${Number(cu.source_total || 0).toLocaleString()}件 → 追加 ${Number(cu.copied || 0).toLocaleString()} / 上書き ${Number(cu.updated || 0).toLocaleString()} / スキップ ${Number(cu.skipped || 0).toLocaleString()}`;

            setCopyResult({
                type: 'success',
                message: `コピー完了\n${line1}\n${line2}`,
            });
            toast.success('材料マスターをコピーしました');
        } catch (e) {
            console.error(e);
            setCopyResult({ type: 'error', message: `コピーに失敗しました: ${String(e?.message || e)}` });
            toast.error('コピーに失敗しました');
        } finally {
            setCopyInProgress(false);
        }
    };

    return (
        <div className="ingredient-master-container">
            <div className="master-header">
                <h3>📦 材料マスター管理</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {user?.role === 'admin' && (
                        <Button
                            variant="secondary"
                            onClick={openCopyModal}
                            disabled={editingId !== null || loading || copyInProgress}
                            title={editingId !== null ? '編集中はコピーできません' : undefined}
                        >
                            他アカウントへコピー
                        </Button>
                    )}
                    <Button variant="primary" onClick={handleAddNew} disabled={editingId !== null}>
                        + 新規材料
                    </Button>
                </div>
            </div>

            <div className="master-search">
                <Input
                    placeholder="材料名で検索..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="ingredient-master-stats">
                <span>
                    登録数: <strong>{(ingredients.length || 0).toLocaleString()}</strong> 件
                </span>
                {isFilteredView && (
                    <span className="ingredient-master-stats-muted">
                        表示: <strong>{(filteredIngredients.length || 0).toLocaleString()}</strong> 件
                    </span>
                )}
            </div>

            <div className="ingredient-category-tabs">
                {categoryTabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`ingredient-category-tab ${categoryFilter === tab.key ? 'active' : ''}`}
                        onClick={() => setCategoryFilter(tab.key)}
                        disabled={editingId !== null}
                        title={editingId !== null ? '編集中は切り替えできません' : undefined}
                    >
                        {tab.label} ({(categoryCounts[tab.key] ?? 0).toLocaleString()})
                    </button>
                ))}
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
                                <th>歩留まり（%）</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredIngredients.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', color: '#999' }}>
                                        {isFilteredView ? '該当する材料がありません' : '材料データがありません'}
                                    </td>
                                </tr>
                            ) : (
                                filteredIngredients.map((item, _filteredIndex) => {
                                    const clientId = item?.clientId ?? item?.ingredientName ?? String(_filteredIndex);
                                    const csvVendor = getCsvVendor(item?.ingredientName);
                                    const masterVendor = String(item?.vendor || '').trim();
                                    const showCsvVendorHint = item?.isEditing && !!csvVendor && csvVendor !== masterVendor;
                                    const displayVendor = getDisplayVendor(item);
                                    const normalizedCategory = normalizeItemCategory(item?.itemCategory);
                                    const isFoodCategory = normalizedCategory === 'food';

                                    return (
                                    <tr key={clientId} className={item.isEditing ? 'editing' : ''}>
                                        <td>
                                            {item.isEditing ? (
                                                <div className="ingredient-name-cell">
                                                    <Input
                                                        value={item.ingredientName}
                                                        onChange={e => handleChange(clientId, 'ingredientName', e.target.value)}
                                                        placeholder="例: 強力粉"
                                                        disabled={!item.isNew}
                                                        wrapperClassName="input-group--no-margin"
                                                    />
                                                    <Input
                                                        value={item.vendor || ''}
                                                        onChange={e => handleChange(clientId, 'vendor', e.target.value)}
                                                        placeholder="業者名"
                                                        wrapperClassName="input-group--no-margin"
                                                    />
                                                    {showCsvVendorHint && (
                                                        <div className="ingredient-subtext">CSV: {csvVendor}</div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="ingredient-name-cell">
                                                    <div>{item.ingredientName}</div>
                                                    {displayVendor && (
                                                        <div className="ingredient-subtext">{displayVendor}</div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {item.isEditing ? (
                                                <Input
                                                    type="number"
                                                    value={item.lastPrice}
                                                    onChange={e => handleChange(clientId, 'lastPrice', e.target.value)}
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
                                                        onChange={e => handleChange(clientId, 'packetSize', e.target.value)}
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
                                                    onChange={e => handleChange(clientId, 'packetUnit', e.target.value)}
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
                                            {item.isEditing ? (
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
                                            ) : (
                                                <span>{getDisplayCsvUnit(item.ingredientName)}</span>
                                            )}
                                        </td>
                                        <td className="normalized-cost">{calculateNormalizedCost(item)}</td>
                                        <td>
                                            {isFoodCategory ? (
                                                item.isEditing ? (
                                                    <Input
                                                        type="number"
                                                        value={item.yieldPercent ?? ''}
                                                        onChange={e => handleChange(clientId, 'yieldPercent', e.target.value)}
                                                        placeholder="100"
                                                        min="1"
                                                        max="100"
                                                        step="0.1"
                                                        title="可食率（歩留まり）: 100% = 補正なし"
                                                    />
                                                ) : (
                                                    (() => {
                                                        const n = parseFloat(item.yieldPercent);
                                                        if (!Number.isFinite(n) || n <= 0) return '-';
                                                        const rounded = Math.round(n * 10) / 10;
                                                        return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}%`;
                                                    })()
                                                )
                                            ) : (
                                                <span style={{ color: '#999' }}>-</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                {item.isEditing ? (
                                                    <>
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() => handleSave(clientId)}
                                                        >
                                                            保存
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleCancel(clientId)}
                                                        >
                                                            キャンセル
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleEdit(clientId)}
                                                            disabled={editingId !== null}
                                                        >
                                                            編集
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDelete(clientId)}
                                                            disabled={editingId !== null}
                                                        >
                                                            削除
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )})
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="master-info">
                <p>💡 ここで設定した原価情報は、レシピ作成時に自動的に反映されます</p>
            </div>

            <Modal
                isOpen={copyModalOpen}
                onClose={closeCopyModal}
                title="材料マスターを他アカウントへコピー"
                size="medium"
                showCloseButton={!copyInProgress}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
                        材料マスター（内容量/単位/仕入れ値/業者名/歩留まり/カテゴリ/元の単位(CSV)）を別アカウントへ複製します。
                        <br />
                        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                            ※ 同期はされません（1回コピー）。
                        </span>
                    </div>

                    {!copyConfirming ? (
                        <>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px', color: '#111827' }}>
                                    コピー先アカウント
                                </div>

                                {copyProfilesLoading ? (
                                    <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>ユーザー一覧を読み込み中...</div>
                                ) : (
                                    <select
                                        value={copyTargetId}
                                        onChange={(e) => setCopyTargetId(e.target.value)}
                                        disabled={copyInProgress || !!copyProfilesError}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #d1d5db',
                                            fontSize: '0.95rem',
                                            background: copyInProgress ? '#f3f4f6' : 'white'
                                        }}
                                    >
                                        <option value="">選択してください...</option>
                                        {copyProfiles
                                            .filter(p => String(p?.id) && String(p?.id) !== String(user?.id))
                                            .map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.display_id}{p.email ? ` (${p.email})` : ''}{p.role === 'admin' ? ' [管理者]' : ''}
                                                </option>
                                            ))}
                                    </select>
                                )}

                                {copyProfilesError && (
                                    <div style={{ marginTop: '8px', color: '#c92a2a', fontSize: '0.85rem' }}>
                                        {copyProfilesError}
                                    </div>
                                )}
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#374151' }}>
                                <input
                                    type="checkbox"
                                    checked={copyOverwrite}
                                    onChange={(e) => setCopyOverwrite(e.target.checked)}
                                    disabled={copyInProgress}
                                />
                                同名材料がある場合は上書きする
                            </label>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                                <Button variant="ghost" onClick={closeCopyModal} disabled={copyInProgress}>閉じる</Button>
                                <Button
                                    variant="primary"
                                    onClick={() => setCopyConfirming(true)}
                                    disabled={!copyTargetId || copyInProgress || copyProfilesLoading || !!copyProfilesError}
                                >
                                    次へ
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            {(() => {
                                const target = copyProfiles.find(p => String(p?.id) === String(copyTargetId));
                                const label = target
                                    ? `${target.display_id}${target.email ? ` (${target.email})` : ''}`
                                    : (copyTargetId ? String(copyTargetId).slice(0, 8) : '-');
                                return (
                                    <div style={{
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '10px',
                                        padding: '12px',
                                        background: '#f8fafc',
                                        color: '#111827'
                                    }}>
                                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>この内容でコピーしますか？</div>
                                        <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                                            コピー先: <strong>{label}</strong>
                                            <br />
                                            同名材料: <strong>{copyOverwrite ? '上書き' : 'スキップ'}</strong>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                                <Button variant="ghost" onClick={() => setCopyConfirming(false)} disabled={copyInProgress}>戻る</Button>
                                <Button
                                    variant="primary"
                                    onClick={startCopyToAccount}
                                    disabled={!copyTargetId || copyInProgress}
                                >
                                    {copyInProgress ? 'コピー中...' : 'この内容でコピー'}
                                </Button>
                            </div>
                        </>
                    )}

                    {copyInProgress && (
                        <div className="bulk-progress" style={{ marginTop: '10px' }}>
                            <div className="bulk-progress-head">
                                <div className="bulk-progress-spinner" />
                                <div>
                                    <div className="bulk-progress-title">コピー中...</div>
                                    <div className="bulk-progress-subtitle">完了までお待ちください</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {copyResult?.message && (
                        <div className={`status-msg ${copyResult.type || 'info'}`} style={{ whiteSpace: 'pre-wrap' }}>
                            {copyResult.message}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
