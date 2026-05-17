const e=`import React, { useState, useEffect, useCallback } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { unitConversionService } from '../services/unitConversionService';
import { purchasePriceService } from '../services/purchasePriceService';
import { csvUnitOverrideService } from '../services/csvUnitOverrideService';
import { vendorOrderService } from '../services/vendorOrderService';
import { userService } from '../services/userService';
import { useToast } from '../contexts/useToast';
import { useAuth } from '../contexts/useAuth';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { normalizeNumericFieldValue } from '../utils/normalizeNumericInput.js';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { AdminTargetDeleteModal } from './AdminTargetDeleteModal';
import './IngredientMaster.css';

const CATEGORY_MANUAL_KEY = 'manual';
const VENDOR_FILTER_ALL = '__all__';
const VENDOR_FILTER_UNASSIGNED = '__unassigned__';

const SortableVendorOrderItem = ({ vendorKey, label, count, active, disabled, onSelect }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: vendorKey,
        data: { type: 'vendor-order-item' },
        disabled: !!disabled,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={\`vendor-order-item \${active ? 'active' : ''} \${disabled ? 'disabled' : ''}\`}
            onClick={() => {
                if (disabled) return;
                onSelect(vendorKey);
            }}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(vendorKey);
                }
            }}
            aria-label={\`\${label} を選択\`}
        >
            <span className="vendor-order-item__label" title={label}>
                {label}
                <span className="vendor-order-item__count">({Number(count || 0).toLocaleString()})</span>
            </span>
            <span
                className="vendor-order-item__handle"
                {...(disabled ? {} : attributes)}
                {...(disabled ? {} : listeners)}
                title="ドラッグして並び替え"
                aria-label={\`\${label} の並び順を変更\`}
            >
                ⋮⋮
            </span>
        </li>
    );
};

export const IngredientMaster = () => {
    const toast = useToast();
    const { user } = useAuth();
    const userId = user?.id || null;
    const [ingredients, setIngredients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all'); // all | manual | food | alcohol | soft_drink | supplies
    const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
    const [vendorFilter, setVendorFilter] = useState(VENDOR_FILTER_ALL);
    const [vendorSortOrder, setVendorSortOrder] = useState([]);
    const [showVendorOrderEditor, setShowVendorOrderEditor] = useState(false);
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

    // 材料マスター一括ゴミ箱移動
    const [bulkTrashModal, setBulkTrashModal] = useState(false);
    const [bulkTrashLoading, setBulkTrashLoading] = useState(false);
    const [bulkTrashResult, setBulkTrashResult] = useState(null);

    // 管理者専用: 全通常ユーザーの材料マスター一括削除（永続削除）
    const [adminClearMasterModal, setAdminClearMasterModal] = useState(false);
    const [adminClearMasterLoading, setAdminClearMasterLoading] = useState(false);
    const [adminClearMasterResult, setAdminClearMasterResult] = useState(null);

    // 管理者専用: 特定ユーザーの材料マスター削除（永続削除）
    const [adminTargetClearMasterModal, setAdminTargetClearMasterModal] = useState(false);
    const [adminTargetClearMasterLoading, setAdminTargetClearMasterLoading] = useState(false);
    const [adminTargetClearMasterResult, setAdminTargetClearMasterResult] = useState(null);

    const normalizeItemCategory = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) return 'food';
        if (normalized === 'food_alcohol') return 'food';
        if (['food', 'alcohol', 'soft_drink', 'supplies'].includes(normalized)) return normalized;
        return 'food';
    };

    const getItemCategoryLabel = (value) => {
        const normalized = normalizeItemCategory(value);
        if (normalized === 'food') return '食材（8%）';
        if (normalized === 'soft_drink') return 'ソフトドリンク（8%）';
        if (normalized === 'alcohol') return 'アルコール（10%）';
        if (normalized === 'supplies') return '備品（10%）';
        return '食材（8%）';
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
            // Always prioritize material master rows so the table can render even if
            // CSV-related auxiliary data is slow/unavailable.
            let conversionsMap = await unitConversionService.getAllConversions();
            if ((conversionsMap?.size || 0) === 0) {
                // Auth/session can be restored slightly after first paint on some devices.
                // Retry once to avoid false empty states.
                await new Promise((resolve) => setTimeout(resolve, 350));
                const retryMap = await unitConversionService.getAllConversions();
                if ((retryMap?.size || 0) > 0) conversionsMap = retryMap;
            }
            const list = Array.from(conversionsMap.values()).map(item => ({
                ...item,
                // Stable key for filtered views (ingredientName is unique for persisted rows).
                clientId: item.ingredientName,
                isNew: false,
                isEditing: false
            }));
            setIngredients(list.sort((a, b) => String(a?.ingredientName || '').localeCompare(String(b?.ingredientName || ''), 'ja')));
            setLoading(false);

            Promise.allSettled([
                purchasePriceService.fetchPriceList(),
                csvUnitOverrideService.getAll(),
            ]).then(([pricesResult, overridesResult]) => {
                if (pricesResult.status === 'fulfilled') {
                    setCsvPriceMap(pricesResult.value || new Map());
                } else {
                    setCsvPriceMap(new Map());
                    console.warn('Failed to load CSV prices (ingredient master still available):', pricesResult.reason);
                }

                if (overridesResult.status === 'fulfilled') {
                    setCsvUnitOverrideMap(overridesResult.value || new Map());
                } else {
                    setCsvUnitOverrideMap(new Map());
                    console.warn('Failed to load CSV unit overrides (ingredient master still available):', overridesResult.reason);
                }
            }).catch((auxError) => {
                console.warn('Failed to load auxiliary ingredient master data:', auxError);
                setCsvPriceMap(new Map());
                setCsvUnitOverrideMap(new Map());
            });
        } catch (error) {
            toast.error('データの読み込みに失敗しました');
            console.error('Failed to load ingredients:', error);
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        // Avoid calling setState synchronously inside an effect body.
        const t = setTimeout(() => {
            void loadIngredients();
        }, 0);
        return () => clearTimeout(t);
    }, [loadIngredients]);

    useEffect(() => {
        let alive = true;
        const loadVendorOrder = async () => {
            if (!userId) {
                if (alive) setVendorSortOrder([]);
                return;
            }
            try {
                const saved = await vendorOrderService.getAll(userId);
                if (alive) setVendorSortOrder(saved);
            } catch (error) {
                console.error('Failed to load vendor order:', error);
                if (alive) setVendorSortOrder([]);
            }
        };
        void loadVendorOrder();
        return () => { alive = false; };
    }, [userId]);

    const handleAddNew = () => {
        const clientId = \`new-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`;
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
        const nextValue = normalizeNumericFieldValue(field, value);
        setIngredients(prev => prev.map(i => {
            if (i?.clientId !== clientId) return i;
            return { ...i, [field]: nextValue };
        }));
    };

    const calculateNormalizedCost = (item) => {
        const price = parseFloat(item.lastPrice);
        const size = parseFloat(item.packetSize);
        if (!price || !size) return '-';

        const unit = item.packetUnit ? item.packetUnit.trim().toLowerCase() : '';

        if (unit === 'g' || unit === 'ｇ') {
            return \`¥\${Math.round((price / size) * 1000).toLocaleString()}/kg\`;
        }
        if (unit === 'ml' || unit === 'cc' || unit === 'ｍｌ' || unit === 'ｃｃ') {
            return \`¥\${Math.round((price / size) * 1000).toLocaleString()}/L\`;
        }
        if (unit === 'cl' || unit === 'ｃｌ') {
            return \`¥\${Math.round((price / size) * 100).toLocaleString()}/L\`;
        }
        // For other units (pieces, etc.), display per unit
        return \`¥\${Math.round(price / size).toLocaleString()}/\${item.packetUnit}\`;
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

    const duplicateMeta = React.useMemo(() => {
        const byNormalizedKey = new Map(); // normalizedKey -> [{ clientId, name }]
        ingredients.forEach((row) => {
            const name = String(row?.ingredientName || '').trim();
            if (!name) return;
            const key = normalizeIngredientKey(name);
            if (!key) return;
            const arr = byNormalizedKey.get(key) || [];
            arr.push({ clientId: row?.clientId, name });
            byNormalizedKey.set(key, arr);
        });

        const duplicateKeys = new Set();
        const duplicateClientIds = new Set();
        const keyToNames = new Map();
        const groups = [];

        for (const [key, arr] of byNormalizedKey.entries()) {
            if (!Array.isArray(arr) || arr.length < 2) continue;
            duplicateKeys.add(key);
            arr.forEach((it) => {
                if (it?.clientId) duplicateClientIds.add(it.clientId);
            });
            const names = Array.from(new Set(arr.map((it) => it?.name).filter(Boolean)));
            keyToNames.set(key, names);
            groups.push({ key, names, rows: arr.length });
        }

        groups.sort((a, b) => {
            const an = String(a?.names?.[0] || '');
            const bn = String(b?.names?.[0] || '');
            return an.localeCompare(bn, 'ja');
        });

        return {
            duplicateKeys,
            duplicateClientIds,
            keyToNames,
            groups,
        };
    }, [ingredients]);

    useEffect(() => {
        // Auto-exit "duplicates only" when the duplicates disappear (after deletes/edits).
        if (showDuplicatesOnly && (duplicateMeta?.groups?.length || 0) === 0) {
            setShowDuplicatesOnly(false);
        }
    }, [showDuplicatesOnly, duplicateMeta]);

    const isFilteredView = categoryFilter !== 'all' || String(searchQuery || '').trim() !== '';

    const getCsvUnit = (ingredientName) => {
        const key = normalizeIngredientKey(ingredientName);
        if (!key) return '-';
        const entry = csvPriceMap?.get(key) || null;
        const unit = entry?.unit;
        return unit ? String(unit) : '-';
    };

    const getCsvVendor = useCallback((ingredientName) => {
        const key = normalizeIngredientKey(ingredientName);
        if (!key) return '';
        const entry = csvPriceMap?.get(key) || null;
        const vendor = entry?.vendor;
        return vendor ? String(vendor) : '';
    }, [csvPriceMap]);

    const getEffectiveVendorKey = React.useCallback((row) => {
        const masterVendor = String(row?.vendor || '').trim();
        if (masterVendor) return masterVendor;
        const csvVendor = getCsvVendor(row?.ingredientName);
        if (csvVendor) return csvVendor;
        return VENDOR_FILTER_UNASSIGNED;
    }, [getCsvVendor]);

    const vendorMeta = React.useMemo(() => {
        const counts = new Map(); // vendorKey -> count
        filteredIngredients.forEach((row) => {
            const key = getEffectiveVendorKey(row);
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        const vendorKeys = new Set(counts.keys());
        const entries = Array.from(counts.entries()).map(([key, count]) => ({ key, count }));
        const orderIndex = new Map((vendorSortOrder || []).map((key, index) => [key, index]));
        entries.sort((a, b) => {
            const ai = orderIndex.has(a.key) ? orderIndex.get(a.key) : Number.MAX_SAFE_INTEGER;
            const bi = orderIndex.has(b.key) ? orderIndex.get(b.key) : Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            if (a.key === VENDOR_FILTER_UNASSIGNED && b.key !== VENDOR_FILTER_UNASSIGNED) return 1;
            if (b.key === VENDOR_FILTER_UNASSIGNED && a.key !== VENDOR_FILTER_UNASSIGNED) return -1;
            return String(a.key).localeCompare(String(b.key), 'ja');
        });

        return {
            total: filteredIngredients.length,
            vendorKeys,
            entries,
        };
    }, [filteredIngredients, getEffectiveVendorKey, vendorSortOrder]);

    useEffect(() => {
        const keys = (vendorMeta?.entries || []).map((entry) => entry.key);
        setVendorSortOrder((prev) => {
            const current = Array.isArray(prev) ? prev : [];
            const kept = current.filter((key) => keys.includes(key));
            const appended = keys.filter((key) => !kept.includes(key));
            const next = [...kept, ...appended];
            if (next.length === current.length && next.every((k, idx) => k === current[idx])) {
                return current;
            }
            return next;
        });
    }, [vendorMeta]);

    const vendorSensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        }),
    );

    const handleVendorOrderDragEnd = useCallback(async (event) => {
        if (editingId !== null) return;
        const { active, over } = event;
        if (!active?.id || !over?.id || active.id === over.id) return;

        const currentKeys = (vendorMeta?.entries || []).map((entry) => entry.key);
        const oldIndex = currentKeys.indexOf(active.id);
        const newIndex = currentKeys.indexOf(over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const nextCurrent = arrayMove(currentKeys, oldIndex, newIndex);
        const currentState = Array.isArray(vendorSortOrder) ? vendorSortOrder : [];
        const rest = currentState.filter((key) => !currentKeys.includes(key));
        const nextOrderAll = [...nextCurrent, ...rest];
        setVendorSortOrder(nextOrderAll);

        if (!userId) return;
        try {
            await vendorOrderService.saveOrder(userId, nextOrderAll);
        } catch (error) {
            console.error('Failed to save vendor order:', error);
            toast.error(error?.message || '業者の並び順保存に失敗しました');
        }
    }, [editingId, userId, vendorMeta, toast, vendorSortOrder]);

    useEffect(() => {
        if (vendorFilter === VENDOR_FILTER_ALL) return;
        if (!vendorMeta?.vendorKeys?.has?.(vendorFilter)) {
            setVendorFilter(VENDOR_FILTER_ALL);
        }
    }, [vendorFilter, vendorMeta]);

    const visibleIngredients = React.useMemo(() => {
        let list = filteredIngredients.filter((row) => {
            const id = row?.clientId;
            const isEditingRow = !!editingId && id === editingId;

            if (showDuplicatesOnly) {
                const set = duplicateMeta?.duplicateClientIds || new Set();
                const ok = set.has(id);
                if (!ok && !isEditingRow) return false;
            }

            if (vendorFilter !== VENDOR_FILTER_ALL) {
                const ok = getEffectiveVendorKey(row) === vendorFilter;
                if (!ok && !isEditingRow) return false;
            }

            return true;
        });

        // If filters/search/category exclude the editing row, keep it visible at the top while editing.
        if (editingId && !list.some((row) => row?.clientId === editingId)) {
            const editingRow = ingredients.find((row) => row?.clientId === editingId);
            if (editingRow) {
                list = [editingRow, ...list];
            }
        }

        return list;
    }, [filteredIngredients, showDuplicatesOnly, duplicateMeta, vendorFilter, getEffectiveVendorKey, editingId, ingredients]);

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

    const handleBulkMoveToTrash = async () => {
        setBulkTrashLoading(true);
        setBulkTrashResult(null);
        try {
            const result = await unitConversionService.moveAllToTrash();
            setBulkTrashResult({ type: 'success', message: \`ゴミ箱へ移動完了: \${result.moved}件\` });
            // Reload ingredient list
            await loadIngredients();
        } catch (e) {
            console.error(e);
            setBulkTrashResult({ type: 'error', message: 'ゴミ箱への移動に失敗しました: ' + (e?.message || String(e)) });
        } finally {
            setBulkTrashLoading(false);
        }
    };

    const handleAdminClearNonAdminMaster = async () => {
        setAdminClearMasterLoading(true);
        setAdminClearMasterResult(null);
        try {
            const result = await unitConversionService.adminClearAllNonAdminMaster();
            setAdminClearMasterResult({
                type: 'success',
                message: \`完了: 材料マスター \${result.deleted_unit_conversions}件 / CSV上書き設定 \${result.deleted_csv_overrides}件 を削除しました\`
            });
            await loadConversionsAndOverrides(); // もしadmin自身のビューに影響があれば再読み込み
        } catch (e) {
            console.error(e);
            setAdminClearMasterResult({ type: 'error', message: '処理に失敗しました: ' + (e?.message || String(e)) });
        } finally {
            setAdminClearMasterLoading(false);
        }
    };

    const handleAdminTargetClearMaster = async (targetUserId) => {
        setAdminTargetClearMasterLoading(true);
        setAdminTargetClearMasterResult(null);
        try {
            const result = await unitConversionService.adminClearTargetUserMaster(targetUserId);
            setAdminTargetClearMasterResult({
                type: 'success',
                message: \`完了: 材料マスター \${result.deleted_unit_conversions}件 / CSV設定 \${result.deleted_csv_overrides}件 を削除しました\`
            });
            await loadConversionsAndOverrides(); // もしadmin自身のビューに影響があれば再読み込み
        } catch (e) {
            console.error(e);
            setAdminTargetClearMasterResult({ type: 'error', message: '処理に失敗しました: ' + (e?.message || String(e)) });
        } finally {
            setAdminTargetClearMasterLoading(false);
            setAdminTargetClearMasterModal(false);
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

            const line1 = \`材料: \${Number(uc.source_total || 0).toLocaleString()}件 → 追加 \${Number(uc.copied || 0).toLocaleString()} / 上書き \${Number(uc.updated || 0).toLocaleString()} / スキップ \${Number(uc.skipped || 0).toLocaleString()}\`;
            const line2 = \`元の単位(CSV): \${Number(cu.source_total || 0).toLocaleString()}件 → 追加 \${Number(cu.copied || 0).toLocaleString()} / 上書き \${Number(cu.updated || 0).toLocaleString()} / スキップ \${Number(cu.skipped || 0).toLocaleString()}\`;

            setCopyResult({
                type: 'success',
                message: \`コピー完了\\n\${line1}\\n\${line2}\`,
            });
            toast.success('材料マスターをコピーしました');
        } catch (e) {
            console.error(e);
            setCopyResult({ type: 'error', message: \`コピーに失敗しました: \${String(e?.message || e)}\` });
            toast.error('コピーに失敗しました');
        } finally {
            setCopyInProgress(false);
        }
    };

    return (
        <div className="ingredient-master-container">
            <div className="master-header">
                <h3>📦 材料マスター管理</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
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
                    <Button
                        variant="danger"
                        onClick={() => setBulkTrashModal(true)}
                        disabled={editingId !== null || loading || bulkTrashLoading || ingredients.length === 0}
                        title="全材料をゴミ箱へ移動します"
                    >
                        🗑️ 全件ゴミ箱へ
                    </Button>
                    {user?.role === 'admin' && (
                        <>
                            <Button
                                variant="danger"
                                onClick={() => setAdminTargetClearMasterModal(true)}
                                disabled={editingId !== null || adminTargetClearMasterLoading || adminClearMasterLoading}
                                title="特定ユーザーの材料マスターを削除（永続削除）"
                                style={{ background: '#b91c1c' }}
                            >
                                👤 ユーザー個別材料クリア
                            </Button>
                            <Button
                                variant="danger"
                                onClick={() => setAdminClearMasterModal(true)}
                                disabled={editingId !== null || adminTargetClearMasterLoading || adminClearMasterLoading}
                                title="通常ユーザー全件の材料マスターを全件削除（永続削除）"
                                style={{ background: '#7f1d1d' }}
                            >
                                🧹 ユーザー全体材料クリア
                            </Button>
                        </>
                    )}
                    <Button variant="primary" onClick={handleAddNew} disabled={editingId !== null}>
                        + 新規材料
                    </Button>
                </div>
            </div>
            {bulkTrashResult && (
                <div className={\`status-msg \${bulkTrashResult.type}\`} style={{ marginBottom: '8px' }}>
                    {bulkTrashResult.message}
                </div>
            )}
            {adminTargetClearMasterResult && (
                <div className={\`status-msg \${adminTargetClearMasterResult.type}\`} style={{ marginBottom: '8px' }}>
                    {adminTargetClearMasterResult.message}
                </div>
            )}
            {adminClearMasterResult && (
                <div className={\`status-msg \${adminClearMasterResult.type}\`} style={{ marginBottom: '8px' }}>
                    {adminClearMasterResult.message}
                </div>
            )}

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
                <button
                    type="button"
                    className={\`ingredient-dup-toggle \${showDuplicatesOnly ? 'active' : ''}\`}
                    onClick={() => setShowDuplicatesOnly((prev) => !prev)}
                    disabled={editingId !== null || (duplicateMeta?.groups?.length || 0) === 0}
                    title={
                        editingId !== null
                            ? '編集中は切り替えできません'
                            : ((duplicateMeta?.groups?.length || 0) === 0
                                ? '重複候補は見つかりませんでした'
                                : '表記ゆれ等の重複候補だけ表示します')
                    }
                >
                    重複候補: <strong>{(duplicateMeta?.groups?.length || 0).toLocaleString()}</strong> グループ
                </button>
            </div>

            <div className="ingredient-category-tabs">
                {categoryTabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        className={\`ingredient-category-tab \${categoryFilter === tab.key ? 'active' : ''}\`}
                        onClick={() => setCategoryFilter(tab.key)}
                        disabled={editingId !== null}
                        title={editingId !== null ? '編集中は切り替えできません' : undefined}
                    >
                        {tab.label} ({(categoryCounts[tab.key] ?? 0).toLocaleString()})
                    </button>
                ))}
            </div>

            <div className="ingredient-vendor-filter-row">
                <label htmlFor="ingredient-vendor-filter" className="ingredient-vendor-filter-label">
                    業者フィルタ
                </label>
                <select
                    id="ingredient-vendor-filter"
                    value={vendorFilter}
                    onChange={(e) => setVendorFilter(e.target.value)}
                    disabled={editingId !== null}
                    className="ingredient-vendor-select"
                    title={editingId !== null ? '編集中は切り替えできません' : 'クリックで業者を選択'}
                >
                    <option value={VENDOR_FILTER_ALL}>
                        全業者 ({(vendorMeta?.total || 0).toLocaleString()})
                    </option>
                    {(vendorMeta?.entries || []).map(({ key, count }) => {
                        const label = key === VENDOR_FILTER_UNASSIGNED ? '未設定' : key;
                        return (
                            <option key={key} value={key}>
                                {label} ({Number(count || 0).toLocaleString()})
                            </option>
                        );
                    })}
                </select>
                <button
                    type="button"
                    className={\`ingredient-vendor-order-toggle \${showVendorOrderEditor ? 'active' : ''}\`}
                    onClick={() => setShowVendorOrderEditor((prev) => !prev)}
                    disabled={editingId !== null}
                    title={editingId !== null ? '編集中は切り替えできません' : '必要な時だけ並び替えリストを表示'}
                >
                    {showVendorOrderEditor ? '並び替えを閉じる' : '並び替えを表示'}
                </button>
            </div>

            {showVendorOrderEditor && (
                <div className="ingredient-vendor-order-panel">
                    <div className="ingredient-vendor-order-title">業者の並び順（ドラッグ＆ドロップ）</div>
                    {(vendorMeta?.entries || []).length === 0 ? (
                        <div className="ingredient-vendor-order-empty">業者データがありません</div>
                    ) : (
                        <DndContext
                            sensors={vendorSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleVendorOrderDragEnd}
                        >
                            <SortableContext
                                items={(vendorMeta?.entries || []).map((entry) => entry.key)}
                                strategy={verticalListSortingStrategy}
                            >
                                <ul className="vendor-order-list">
                                    {(vendorMeta?.entries || []).map(({ key, count }) => {
                                        const label = key === VENDOR_FILTER_UNASSIGNED ? '未設定' : key;
                                        return (
                                            <SortableVendorOrderItem
                                                key={key}
                                                vendorKey={key}
                                                label={label}
                                                count={count}
                                                active={vendorFilter === key}
                                                disabled={editingId !== null}
                                                onSelect={setVendorFilter}
                                            />
                                        );
                                    })}
                                </ul>
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            )}

            {loading ? (
                <div className="master-loading">読み込み中...</div>
            ) : (
                <div className="master-table-wrapper">
                    <table className="master-table">
                        <thead>
                            <tr>
                                <th className="master-col-no">No</th>
                                <th>材料名</th>
                                <th className="master-col-category">区分（税率）</th>
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
                            {visibleIngredients.length === 0 ? (
                                <tr>
                                    <td colSpan="10" style={{ textAlign: 'center', color: '#999' }}>
                                        {showDuplicatesOnly ? '重複候補がありません' : (isFilteredView ? '該当する材料がありません' : '材料データがありません')}
                                    </td>
                                </tr>
                            ) : (
                                visibleIngredients.map((item, _filteredIndex) => {
                                    const clientId = item?.clientId ?? item?.ingredientName ?? String(_filteredIndex);
                                    const csvVendor = getCsvVendor(item?.ingredientName);
                                    const masterVendor = String(item?.vendor || '').trim();
                                    const showCsvVendorHint = item?.isEditing && !!csvVendor && csvVendor !== masterVendor;
                                    const effectiveVendor = masterVendor || csvVendor || '';
                                    const vendorSourceClass = masterVendor
                                        ? 'vendor-tag--master'
                                        : (csvVendor ? 'vendor-tag--csv' : 'vendor-tag--empty');
                                    const vendorTitle = (() => {
                                        if (!effectiveVendor) return '業者名が未設定です';
                                        if (masterVendor && csvVendor && csvVendor !== masterVendor) {
                                            return \`業者（材料マスター）: \${masterVendor} / CSV: \${csvVendor}\`;
                                        }
                                        return masterVendor ? '業者（材料マスター）' : '業者（CSV）';
                                    })();
                                    const normalizedCategory = normalizeItemCategory(item?.itemCategory);
                                    const isFoodCategory = normalizedCategory === 'food';
                                    const dupKey = normalizeIngredientKey(item?.ingredientName);
                                    const isDuplicate = !!dupKey && duplicateMeta?.duplicateKeys?.has?.(dupKey);
                                    const dupNames = (dupKey && duplicateMeta?.keyToNames?.get?.(dupKey)) || null;
                                    const dupTitle = isDuplicate && Array.isArray(dupNames) && dupNames.length > 0
                                        ? \`重複候補: \${dupNames.join(' / ')}\`
                                        : '重複候補';

                                    return (
                                        <tr
                                            key={clientId}
                                            className={[
                                                item.isEditing ? 'editing' : '',
                                                isDuplicate ? 'duplicate' : '',
                                            ].filter(Boolean).join(' ')}
                                        >
                                            <td className="master-col-no">
                                                <span className="master-col-no__text">{_filteredIndex + 1}</span>
                                            </td>
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
                                                            <div className="ingredient-vendor-tags">
                                                                <span className="vendor-tag vendor-tag--csv" title="業者名（CSV）">
                                                                    参考: {csvVendor}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="ingredient-name-cell">
                                                        <div className="ingredient-name-row">
                                                            <span>{item.ingredientName}</span>
                                                            {isDuplicate && (
                                                                <span className="ingredient-dup-badge" title={dupTitle}>
                                                                    重複
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="ingredient-vendor-tags">
                                                            <span
                                                                className={\`vendor-tag \${vendorSourceClass}\`}
                                                                title={vendorTitle}
                                                            >
                                                                業者: {effectiveVendor || '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="master-col-category">
                                                {item.isEditing ? (
                                                    <select
                                                        value={normalizedCategory}
                                                        onChange={e => handleChange(clientId, 'itemCategory', e.target.value)}
                                                        className="category-select"
                                                    >
                                                        <option value="food">食材（8%）</option>
                                                        <option value="soft_drink">ソフトドリンク（8%）</option>
                                                        <option value="alcohol">アルコール（10%）</option>
                                                        <option value="supplies">備品（10%）</option>
                                                    </select>
                                                ) : (
                                                    <span title="税率判定に使われます">{getItemCategoryLabel(item?.itemCategory)}</span>
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
                                                    \`¥\${parseFloat(item.lastPrice || 0).toLocaleString()}\`
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
                                                        <option value="cc">cc</option>
                                                        <option value="cl">cl</option>
                                                        <option value="個">個</option>
                                                        <option value="袋">袋</option>
                                                        <option value="本">本</option>
                                                        <option value="枚">枚</option>
                                                        <option value="パック">パック</option>
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
                                                        placeholder={getCsvUnit(item.ingredientName) === '-' ? '未設定' : \`CSV: \${getCsvUnit(item.ingredientName)}\`}
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
                                                            return \`\${Number.isInteger(rounded) ? Math.round(rounded) : rounded}%\`;
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
                                    )
                                })
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
                                                    {p.display_id}{p.email ? \` (\${p.email})\` : ''}{p.role === 'admin' ? ' [管理者]' : ''}
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
                                    ? \`\${target.display_id}\${target.email ? \` (\${target.email})\` : ''}\`
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
                        <div className={\`status-msg \${copyResult.type || 'info'}\`} style={{ whiteSpace: 'pre-wrap' }}>
                            {copyResult.message}
                        </div>
                    )}
                </div>
            </Modal>

            {/* 材料マスター一括ゴミ箱移動確認モーダル */}
            <DeleteConfirmModal
                isOpen={bulkTrashModal}
                onClose={() => { if (!bulkTrashLoading) { setBulkTrashModal(false); setBulkTrashResult(null); } }}
                onConfirm={async () => {
                    await handleBulkMoveToTrash();
                    setBulkTrashModal(false);
                }}
                title="材料マスターを全件ゴミ箱へ移動"
                description={
                    <span>
                        登録済みの材料マスター（<strong>{ingredients.length.toLocaleString()}件</strong>）を全てゴミ箱へ移動します。<br />
                        ゴミ箱タブから復元・完全削除が行えます。
                    </span>
                }
                loading={bulkTrashLoading}
            />

            {/* 管理者専用: 全通常ユーザーの材料マスター一括削除（永続削除）確認モーダル */}
            <DeleteConfirmModal
                isOpen={adminClearMasterModal}
                onClose={() => { if (!adminClearMasterLoading) { setAdminClearMasterModal(false); setAdminClearMasterResult(null); } }}
                onConfirm={async () => {
                    await handleAdminClearNonAdminMaster();
                    setAdminClearMasterModal(false);
                }}
                title="通常ユーザーの材料マスターを全件削除"
                description={
                    <span>
                        <strong style={{ color: '#b91c1c' }}>管理者・admin以外の全ユーザー</strong>の材料マスター（単位換算・CSVマッピング）を<strong>永続削除</strong>します。<br />
                        ゴミ箱には移動しません。この操作は取り消せません。
                    </span>
                }
                loading={adminClearMasterLoading}
            />

            {/* 管理者専用: 特定ユーザーの材料マスター削除（永続削除）確認モーダル */}
            <AdminTargetDeleteModal
                isOpen={adminTargetClearMasterModal}
                onClose={() => { if (!adminTargetClearMasterLoading) { setAdminTargetClearMasterModal(false); setAdminTargetClearMasterResult(null); } }}
                onConfirm={handleAdminTargetClearMaster}
                title="特定ユーザーの材料マスターを削除"
                description={
                    <span>
                        指定したユーザーの材料マスター（単位換算・CSVマッピング）を<strong>永続削除</strong>します。<br />
                        ゴミ箱には移動しません。この操作は取り消せません。
                    </span>
                }
                loading={adminTargetClearMasterLoading}
            />
        </div>
    );
};
`;export{e as default};
