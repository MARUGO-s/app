import React, { useState, useEffect } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSearchParams } from 'react-router-dom';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { inventoryService } from '../services/inventoryService';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import { csvUnitOverrideService } from '../services/csvUnitOverrideService';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { InventoryList } from './InventoryList';
import { AutocompleteInput } from './AutocompleteInput';
import './Inventory.css';
import { Modal } from './Modal';
import { useAuth } from '../contexts/useAuth';

export const Inventory = ({ onBack }) => {
    const { user } = useAuth();
    const userId = user?.id;
    const [, setSearchParams] = useSearchParams();
    const [items, setItems] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [deletedSnapshots, setDeletedSnapshots] = useState([]);
    const [csvData, setCsvData] = useState([]); // Master data from CSV
    const [ingredientMasterMap, setIngredientMasterMap] = useState(new Map()); // unit_conversions (材料マスター)
    const [csvUnitOverrideMap, setCsvUnitOverrideMap] = useState(new Map()); // csv_unit_overrides (元の単位)
    const [ignoredNames, setIgnoredNames] = useState(new Set()); // Ignored item names
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editingItem, setEditingItem] = useState(null); // null = create
    const [ingredientName, setIngredientName] = useState(''); // For autocomplete in registration form

    // Unit Sync Modal State
    const [unitSyncModalOpen, setUnitSyncModalOpen] = useState(false);
    const [unitSyncTarget, setUnitSyncTarget] = useState(null); // inventory item
    const [unitSyncSaving, setUnitSyncSaving] = useState(false);

    // Snapshot / Complete Modal State
    const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
    const [snapshotTitle, setSnapshotTitle] = useState('');
    const [snapshotSaving, setSnapshotSaving] = useState(false);
    const [resetAfterSnapshot, setResetAfterSnapshot] = useState(true); // true = reset qty to 0, false = keep as-is

    // Snapshot History Modal State
    const [snapshotHistoryModalOpen, setSnapshotHistoryModalOpen] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState(null);
    const [snapshotHistoryTab, setSnapshotHistoryTab] = useState('history'); // 'history' | 'trash'
    const [snapshotConfirm, setSnapshotConfirm] = useState(null); // { title, message, onConfirm }
    const [snapshotConfirmInput, setSnapshotConfirmInput] = useState('');
    const [snapshotConfirmLoading, setSnapshotConfirmLoading] = useState(false);
    const [snapshotActionLoading, setSnapshotActionLoading] = useState(null); // { type: 'move' | 'restore' | 'hard-delete', id }
    const [hideZeroSnapshotItems, setHideZeroSnapshotItems] = useState(true);
    const [snapshotDetailSort, setSnapshotDetailSort] = useState({ key: 'name', direction: 'asc' });

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [excludedNames, setExcludedNames] = useState(new Set()); // only hide in current inventory check UI

    // Completion Success Modal State
    const [completeSuccessModalOpen, setCompleteSuccessModalOpen] = useState(false);

    // Generic Notification State (for replacing alerts)
    const [notification, setNotification] = useState(null); // { title, message, type }

    // Confirm modal when switching tax to 10%
    const [taxConfirm, setTaxConfirm] = useState(null); // { item }
    const [taxConfirmSaving, setTaxConfirmSaving] = useState(false);

    // Sensors for DnD (activates on move of 8px to prevent accidental drag on click)
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const [activeTab, setActiveTab] = useState('all'); // 'all', 'inventory-check', 'summary', or vendor name
    const [checkedItems, setCheckedItems] = useState(new Set()); // Set of IDs
    const [summaryMonth, setSummaryMonth] = useState(''); // YYYY-MM
    const [historyMonth, setHistoryMonth] = useState(''); // YYYY-MM
    const [summaryOrderByMonth, setSummaryOrderByMonth] = useState({});

    // Sync ingredientName with editingItem when it changes
    useEffect(() => {
        if (editingItem) {
            setIngredientName(editingItem.name || '');
        } else {
            setIngredientName('');
        }
    }, [editingItem]);
    const [selectedSummaryVendor, setSelectedSummaryVendor] = useState('');

    const SummarySortableRow = ({ row, onVendorClick, isSelected }) => {
        const {
            attributes,
            listeners,
            setNodeRef,
            setActivatorNodeRef,
            transform,
            transition,
            isDragging
        } = useSortable({
            id: row.vendor,
            data: { type: 'summary-row' }
        });

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.6 : 1
        };

        return (
            <tr
                ref={setNodeRef}
                style={style}
                {...attributes}
                className={isSelected ? 'inventory-summary__row inventory-summary__row--selected' : 'inventory-summary__row'}
            >
                <td className="inventory-summary__drag">
                    <span
                        ref={setActivatorNodeRef}
                        {...listeners}
                        className="inventory-summary__drag-handle"
                        title="ドラッグで並び替え"
                    >
                        ⋮⋮
                    </span>
                </td>
                <td>
                    <button
                        type="button"
                        className="inventory-summary__vendor-btn"
                        onClick={() => onVendorClick?.(row.vendor)}
                        aria-expanded={!!isSelected}
                    >
                        <span>{row.vendor}</span>
                        <span className="inventory-summary__vendor-btn-icon">{isSelected ? '▲' : '▼'}</span>
                    </button>
                </td>
                <td style={{ textAlign: 'right' }}>
                    ¥{Math.round(row.total || 0).toLocaleString()}
                </td>
            </tr>
        );
    };

    useEffect(() => {
        if (!userId) return;
        // When entering Inventory page, default to showing all vendors/items
        setActiveTab('all');
        setSearchQuery('');
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const loadData = async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const [inventoryData, csvList, ignored, snapshotList, deletedList, conversions, overrides] = await Promise.all([
                inventoryService.getAll(userId),
                purchasePriceService.getPriceListArray(),
                inventoryService.getIgnoredItems(userId),
                inventoryService.getSnapshots(userId),
                inventoryService.getDeletedSnapshots(userId),
                unitConversionService.getAllConversions(),
                csvUnitOverrideService.getAll(userId)
            ]);
            setItems(inventoryData);
            setCsvData(csvList);
            setIgnoredNames(ignored);
            setSnapshots(snapshotList || []);
            setDeletedSnapshots(deletedList || []);
            setIngredientMasterMap(conversions || new Map());
            setCsvUnitOverrideMap(overrides || new Map());

            // Initialize checkedItems with IDs of unique existing inventory items (deduped by vendor+name).
            // This keeps the count aligned with what the user sees in the inventory table.
            const toDateMs = (value) => {
                if (!value) return -1;
                const d = new Date(value);
                const ms = d.getTime();
                return Number.isFinite(ms) ? ms : -1;
            };
            const pickPreferred = (a, b) => {
                const aMs = Math.max(
                    toDateMs(a?.updated_at),
                    toDateMs(a?.updatedAt),
                    toDateMs(a?.created_at),
                    toDateMs(a?.createdAt),
                );
                const bMs = Math.max(
                    toDateMs(b?.updated_at),
                    toDateMs(b?.updatedAt),
                    toDateMs(b?.created_at),
                    toDateMs(b?.createdAt),
                );
                if (aMs !== bMs) return bMs > aMs ? b : a;
                return a;
            };
            const bestByKey = new Map();
            (inventoryData || []).forEach((it) => {
                const vendorKey = String(it?.vendor ?? '').trim() || '__no_vendor__';
                const nameKey = normalizeIngredientKey(it?.name) || String(it?.name ?? '').trim();
                if (!nameKey) return;
                const key = `${vendorKey}@@${nameKey}`;
                const prev = bestByKey.get(key);
                if (!prev) {
                    bestByKey.set(key, it);
                    return;
                }
                bestByKey.set(key, pickPreferred(prev, it));
            });
            const existingIds = new Set(Array.from(bestByKey.values()).map(item => item.id));
            setCheckedItems(existingIds);

        } catch (error) {
            console.error("Failed to load data:", error);
        } finally {
            if (!isSilent) setLoading(false);
        }
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return String(dateString);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
    };

    const getSnapshotItemsArray = (snapshot) => {
        const raw = snapshot?.items;
        if (Array.isArray(raw)) return raw;
        // jsonb might come back as object/nullable depending on DB state
        if (!raw) return [];
        return [];
    };

    const parseSnapshotDate = (snapshot) => {
        const raw = snapshot?.snapshot_date || snapshot?.created_at;
        if (!raw) return null;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return null;
        return d;
    };

    const hiddenVendors = React.useMemo(() => new Set([
        '株式会社穂高リネンサプライ'
    ]), []);

    const isHiddenVendor = (vendor) => {
        const v = String(vendor ?? '').trim();
        return hiddenVendors.has(v);
    };

    const isTax10 = (value) => value === true || value === 1 || value === '1' || value === 'true';

    const normalizeUnit = (u) => {
        const s = String(u ?? '').trim();
        if (!s) return '';
        const lower = s.toLowerCase();
        if (lower === 'ｇ') return 'g';
        if (lower === 'ｍｌ') return 'ml';
        if (lower === 'ｃｃ') return 'cc';
        if (lower === 'ｋｇ') return 'kg';
        if (lower === 'ｌ') return 'l';
        if (lower === 'ｃｌ') return 'cl';
        return lower;
    };

    // Inventory expects "price" to be per-unit (matching item.unit).
    // Ingredient master stores packet total price + packet size/unit.
    const masterUnitPriceFor = (master, targetUnitRaw) => {
        const lastPrice = parseFloat(master?.lastPrice);
        const packetSize = parseFloat(master?.packetSize);
        const packetUnit = normalizeUnit(master?.packetUnit);
        const targetUnit = normalizeUnit(targetUnitRaw || packetUnit);
        if (!Number.isFinite(lastPrice) || !Number.isFinite(packetSize) || packetSize <= 0) return null;
        if (!packetUnit) return null;

        // base price per 1 packetUnit
        const perPacketUnit = lastPrice / packetSize;

        // Same unit
        if (targetUnit === packetUnit) return perPacketUnit;

        // g <-> kg
        if (packetUnit === 'g' && targetUnit === 'kg') return perPacketUnit * 1000;
        if (packetUnit === 'kg' && targetUnit === 'g') return perPacketUnit / 1000;

        // ml/cc <-> l (treat cc as ml)
        const pu = packetUnit === 'cc' ? 'ml' : packetUnit;
        const tu = targetUnit === 'cc' ? 'ml' : targetUnit;
        if (pu === 'ml' && tu === 'l') return perPacketUnit * 1000;
        if (pu === 'l' && tu === 'ml') return perPacketUnit / 1000;

        // cl (centiliter, 1 cl = 10 ml) <-> ml
        if (pu === 'cl' && tu === 'ml') return (lastPrice / packetSize) / 10;
        if (pu === 'ml' && tu === 'cl') return perPacketUnit * 10;
        if (pu === 'cl' && tu === 'cl') return perPacketUnit;

        // Not convertible
        return null;
    };

    const unitConversionFactor = (fromUnitRaw, toUnitRaw) => {
        const from = normalizeUnit(fromUnitRaw);
        const to = normalizeUnit(toUnitRaw);
        if (!from || !to) return null;
        if (from === to) return 1;

        // g <-> kg
        if (from === 'kg' && to === 'g') return 1000;
        if (from === 'g' && to === 'kg') return 1 / 1000;

        // ml/cc <-> l (treat cc as ml)
        const f = from === 'cc' ? 'ml' : from;
        const t = to === 'cc' ? 'ml' : to;
        if (f === 'l' && t === 'ml') return 1000;
        if (f === 'ml' && t === 'l') return 1 / 1000;
        // cl (1 cl = 10 ml)
        if (f === 'cl' && t === 'ml') return 10;
        if (f === 'ml' && t === 'cl') return 1 / 10;

        return null;
    };

    const normalizeItemCategory = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) return '';
        if (normalized === 'food_alcohol') return 'food';
        if (['food', 'alcohol', 'soft_drink', 'supplies'].includes(normalized)) return normalized;
        return '';
    };

    const isTax10ByItemCategory = (itemCategory) => {
        const normalized = normalizeItemCategory(itemCategory);
        return normalized === 'alcohol' || normalized === 'supplies';
    };

    const getItemCategoryLabel = (itemCategory) => {
        const normalized = normalizeItemCategory(itemCategory);
        if (normalized === 'food') return '食材';
        if (normalized === 'alcohol' || normalized === 'soft_drink') return 'ドリンク';
        if (normalized === 'supplies') return '備品';
        return '未分類';
    };

    const getSummaryBreakdownKey = (itemCategory) => {
        const normalized = normalizeItemCategory(itemCategory);
        if (normalized === 'food') return 'food';
        if (normalized === 'alcohol' || normalized === 'soft_drink') return 'drink';
        if (normalized === 'supplies') return 'supplies';
        return 'unknown';
    };

    const getSummaryBreakdownLabel = (breakdownKey) => {
        if (breakdownKey === 'food') return '食材';
        if (breakdownKey === 'drink') return 'ドリンク（アルコール・ソフトドリンク）';
        if (breakdownKey === 'supplies') return '備品';
        return '未分類';
    };

    const getTaxMultiplier = (item) => (isTax10(item?.tax10) ? 1.1 : 1.08);

    const toMonthKey = (date) => {
        if (!date) return '';
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    const parseDateToMs = (value) => {
        if (!value) return -1;
        const d = new Date(value);
        const ms = d.getTime();
        return Number.isFinite(ms) ? ms : -1;
    };

    const getSnapshotItemUpdatedMs = (item) => {
        const candidates = [
            item?.updated_at,
            item?.updatedAt,
            item?.created_at,
            item?.createdAt
        ];
        for (const raw of candidates) {
            const ms = parseDateToMs(raw);
            if (ms >= 0) return ms;
        }
        return -1;
    };

    const monthOptions = React.useMemo(() => {
        const map = new Map();
        snapshots.forEach((s) => {
            const d = parseSnapshotDate(s);
            if (!d) return;
            const key = toMonthKey(d);
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    year: d.getFullYear(),
                    month: d.getMonth() + 1
                });
            }
        });
        return Array.from(map.values())
            .sort((a, b) => b.key.localeCompare(a.key))
            .map((m) => ({ ...m, label: `${m.year}年${m.month}月` }));
    }, [snapshots]);

    useEffect(() => {
        if (monthOptions.length === 0) {
            if (summaryMonth) setSummaryMonth('');
            return;
        }
        if (summaryMonth && monthOptions.some(m => m.key === summaryMonth)) return;
        const currentKey = toMonthKey(new Date());
        const nextKey = monthOptions.find(m => m.key === currentKey)?.key || monthOptions[0].key;
        setSummaryMonth(nextKey);
    }, [monthOptions, summaryMonth]);

    useEffect(() => {
        if (monthOptions.length === 0) {
            if (historyMonth) setHistoryMonth('');
            return;
        }
        if (historyMonth && monthOptions.some(m => m.key === historyMonth)) return;
        const currentKey = toMonthKey(new Date());
        const nextKey = monthOptions.find(m => m.key === currentKey)?.key || monthOptions[0].key;
        setHistoryMonth(nextKey);
    }, [monthOptions, historyMonth]);

    const historyMonthInfo = React.useMemo(() => {
        if (!historyMonth) return null;
        const [yStr, mStr] = historyMonth.split('-');
        const year = parseInt(yStr, 10);
        const month = parseInt(mStr, 10);
        if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
        const pad = (n) => String(n).padStart(2, '0');
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        return {
            year,
            month,
            start,
            end,
            rangeLabel: `${year}/${pad(month)}/01〜${year}/${pad(month)}/${pad(end.getDate())}`
        };
    }, [historyMonth]);

    const historySnapshots = React.useMemo(() => {
        if (!historyMonth) return snapshots;
        return snapshots
            .map((s) => ({ snapshot: s, date: parseSnapshotDate(s) }))
            .filter((row) => row.date && toMonthKey(row.date) === historyMonth)
            .sort((a, b) => b.date - a.date)
            .map((row) => row.snapshot);
    }, [snapshots, historyMonth]);

    const summaryMonthInfo = React.useMemo(() => {
        if (!summaryMonth) return null;
        const [yStr, mStr] = summaryMonth.split('-');
        const year = parseInt(yStr, 10);
        const month = parseInt(mStr, 10);
        if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
        const pad = (n) => String(n).padStart(2, '0');
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        return {
            year,
            month,
            start,
            end,
            rangeLabel: `${year}/${pad(month)}/01〜${year}/${pad(month)}/${pad(end.getDate())}`
        };
    }, [summaryMonth]);

    const summarySnapshots = React.useMemo(() => {
        if (!summaryMonth) return [];
        return snapshots
            .map((s) => ({ snapshot: s, date: parseSnapshotDate(s) }))
            .filter((row) => row.date && toMonthKey(row.date) === summaryMonth)
            .sort((a, b) => b.date - a.date)
            .map((row) => row.snapshot);
    }, [snapshots, summaryMonth]);

    const summarySnapshot = summarySnapshots[0] || null;

    const summaryOrderKey = summaryMonth || (summarySnapshot?.id ? `snapshot:${summarySnapshot.id}` : '');

    const summaryLatestItems = React.useMemo(() => {
        const dedupMap = new Map();

        summarySnapshots.forEach((snapshot) => {
            const snapshotMs = parseSnapshotDate(snapshot)?.getTime() || -1;
            const list = getSnapshotItemsArray(snapshot);

            list.forEach((it, rowIndex) => {
                const vendorRaw = (it?.vendor || '').toString().trim();
                if (isHiddenVendor(vendorRaw)) return;
                const vendor = vendorRaw || 'その他';
                const name = String(it?.name || '').trim();
                if (!name) return;

                const key = `${vendor}::${name}`;
                const candidate = {
                    item: { ...it, vendor },
                    snapshotMs,
                    itemUpdatedMs: getSnapshotItemUpdatedMs(it),
                    rowIndex
                };

                const prev = dedupMap.get(key);
                if (!prev) {
                    dedupMap.set(key, candidate);
                    return;
                }

                if (candidate.snapshotMs !== prev.snapshotMs) {
                    if (candidate.snapshotMs > prev.snapshotMs) dedupMap.set(key, candidate);
                    return;
                }

                if (candidate.itemUpdatedMs !== prev.itemUpdatedMs) {
                    if (candidate.itemUpdatedMs > prev.itemUpdatedMs) dedupMap.set(key, candidate);
                    return;
                }

                if (candidate.rowIndex >= prev.rowIndex) {
                    dedupMap.set(key, candidate);
                }
            });
        });

        return Array.from(dedupMap.values()).map((row) => row.item);
    }, [summarySnapshots, isHiddenVendor]);

    const summaryVendorTotalsBase = React.useMemo(() => {
        const map = new Map();
        summaryLatestItems.forEach((it) => {
            const vendorRaw = (it?.vendor || '').toString().trim();
            const vendor = vendorRaw || 'その他';
            if (isHiddenVendor(vendorRaw)) return;
            const price = parseFloat(it?.price) || 0;
            const qty = it?.quantity === '' ? 0 : (parseFloat(it?.quantity) || 0);
            const net = price * qty;
            const taxed = net * getTaxMultiplier(it);
            const prev = map.get(vendor) || { vendor, net: 0, taxed: 0 };
            prev.net += net;
            prev.taxed += taxed;
            map.set(vendor, prev);
        });
        return Array.from(map.values()).map((row) => ({
            vendor: row.vendor,
            net: row.net,
            taxed: row.taxed,
            total: row.taxed
        }));
    }, [summaryLatestItems, isHiddenVendor, getTaxMultiplier]);

    const summaryVendorTotalsMap = React.useMemo(() => {
        const map = new Map();
        summaryVendorTotalsBase.forEach((row) => {
            map.set(row.vendor, row);
        });
        return map;
    }, [summaryVendorTotalsBase]);

    const ingredientMasterByName = React.useMemo(() => {
        const map = new Map();
        try {
            for (const [rawName, value] of (ingredientMasterMap || new Map()).entries()) {
                const name = String(rawName ?? '').trim();
                if (!name) continue;
                map.set(name, value);
            }
        } catch {
            // ignore
        }
        return map;
    }, [ingredientMasterMap]);

    const resolveSnapshotItemCategory = React.useCallback((item) => {
        const direct = normalizeItemCategory(item?.itemCategory ?? item?.item_category);
        if (direct) return direct;

        const itemName = String(item?.name ?? '').trim();
        if (!itemName) return '';

        const masterRow = ingredientMasterByName.get(itemName);
        return normalizeItemCategory(masterRow?.itemCategory ?? masterRow?.item_category);
    }, [ingredientMasterByName]);

    const summaryVendorDetailsMap = React.useMemo(() => {
        const map = new Map();
        summaryLatestItems.forEach((it, index) => {
            const vendorRaw = (it?.vendor || '').toString().trim();
            const vendor = vendorRaw || 'その他';
            if (isHiddenVendor(vendorRaw)) return;

            const price = parseFloat(it?.price) || 0;
            const quantity = it?.quantity === '' ? 0 : (parseFloat(it?.quantity) || 0);
            const net = price * quantity;
            const taxed = net * getTaxMultiplier(it);

            const itemCategory = resolveSnapshotItemCategory(it);
            const breakdownKey = getSummaryBreakdownKey(itemCategory);

            const entry = map.get(vendor) || {
                vendor,
                rows: [],
                totals: { food: 0, drink: 0, supplies: 0, unknown: 0, net: 0, taxed: 0 }
            };

            entry.totals[breakdownKey] += taxed;
            entry.totals.net += net;
            entry.totals.taxed += taxed;
            entry.rows.push({
                id: it?.id || `${vendor}-${it?.name || 'item'}-${index}`,
                name: it?.name || '',
                unit: it?.unit || '',
                quantity,
                price,
                taxed,
                itemCategory,
                breakdownKey
            });

            map.set(vendor, entry);
        });

        for (const entry of map.values()) {
            entry.rows.sort((a, b) => {
                const categoryOrder = { food: 0, drink: 1, unknown: 2, supplies: 3 };
                const aOrder = categoryOrder[a?.breakdownKey] ?? 2;
                const bOrder = categoryOrder[b?.breakdownKey] ?? 2;
                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
                const an = (a?.name || '').toString();
                const bn = (b?.name || '').toString();
                return an.localeCompare(bn, 'ja');
            });
        }

        return map;
    }, [summaryLatestItems, isHiddenVendor, getTaxMultiplier, resolveSnapshotItemCategory]);

    const defaultSummaryOrder = React.useMemo(() => {
        return summaryVendorTotalsBase
            .slice()
            .sort((a, b) => {
                if (b.taxed !== a.taxed) return b.taxed - a.taxed;
                return a.vendor.localeCompare(b.vendor, 'ja');
            })
            .map((row) => row.vendor);
    }, [summaryVendorTotalsBase]);

    const summaryOrder = React.useMemo(() => {
        if (!summaryOrderKey) return defaultSummaryOrder;
        const saved = summaryOrderByMonth[summaryOrderKey];
        const vendorsSet = new Set(summaryVendorTotalsMap.keys());
        const normalized = Array.isArray(saved) ? saved.filter((v) => vendorsSet.has(v)) : [];
        const remaining = defaultSummaryOrder.filter((v) => !normalized.includes(v));
        return [...normalized, ...remaining];
    }, [summaryOrderByMonth, summaryOrderKey, defaultSummaryOrder, summaryVendorTotalsMap]);

    const summaryVendorTotals = React.useMemo(() => {
        return summaryOrder.map((vendor) => summaryVendorTotalsMap.get(vendor)).filter(Boolean);
    }, [summaryOrder, summaryVendorTotalsMap]);

    const summaryTotals = summaryVendorTotals.reduce((sum, row) => {
        sum.net += row.net || 0;
        sum.taxed += row.taxed || 0;
        return sum;
    }, { net: 0, taxed: 0 });

    useEffect(() => {
        if (!selectedSummaryVendor) return;
        if (summaryVendorTotalsMap.has(selectedSummaryVendor)) return;
        setSelectedSummaryVendor('');
    }, [selectedSummaryVendor, summaryVendorTotalsMap]);

    const handleSummaryVendorClick = (vendor) => {
        setSelectedSummaryVendor((prev) => (prev === vendor ? '' : vendor));
    };

    const handleMoveSnapshotToTrash = (snapshot) => {
        if (!snapshot?.id) return;
        if (!userId) return;
        setSnapshotConfirmLoading(false);
        setSnapshotActionLoading(null);
        setSnapshotConfirmInput('');
        setSnapshotConfirm({
            title: '削除の確認',
            message: `「${snapshot.title || '棚卸し'}」をゴミ箱に移動しますか？\n（ゴミ箱から復元できます）`,
            confirmLabel: '削除する',
            loadingLabel: '削除中...',
            onConfirm: async () => {
                setSnapshotConfirmLoading(true);
                setSnapshotActionLoading({ type: 'move', id: snapshot.id });
                try {
                    await inventoryService.deleteSnapshotToTrash(userId, snapshot.id);
                    await loadData(true);
                    setNotification({ title: '完了', message: 'ゴミ箱に移動しました', type: 'success' });
                } catch (e) {
                    console.error(e);
                    setNotification({ title: 'エラー', message: '削除(ゴミ箱移動)に失敗しました', type: 'error' });
                } finally {
                    setSnapshotConfirmLoading(false);
                    setSnapshotActionLoading(null);
                    setSnapshotConfirm(null);
                }
            }
        });
    };

    const handleRestoreSnapshot = (deletedRow) => {
        if (!deletedRow?.id) return;
        if (!userId) return;
        setSnapshotConfirmLoading(false);
        setSnapshotActionLoading(null);
        setSnapshotConfirmInput('');
        setSnapshotConfirm({
            title: '復元の確認',
            message: `「${deletedRow.title || '棚卸し'}」を履歴に復元しますか？`,
            confirmLabel: '復元する',
            loadingLabel: '復元中...',
            onConfirm: async () => {
                setSnapshotConfirmLoading(true);
                setSnapshotActionLoading({ type: 'restore', id: deletedRow.id });
                try {
                    await inventoryService.restoreSnapshotFromTrash(userId, deletedRow.id);
                    await loadData(true);
                    setNotification({ title: '完了', message: '復元しました', type: 'success' });
                } catch (e) {
                    console.error(e);
                    setNotification({ title: 'エラー', message: '復元に失敗しました', type: 'error' });
                } finally {
                    setSnapshotConfirmLoading(false);
                    setSnapshotActionLoading(null);
                    setSnapshotConfirm(null);
                }
            }
        });
    };

    const handleHardDeleteSnapshot = (deletedRow) => {
        if (!deletedRow?.id) return;
        if (!userId) return;
        setSnapshotConfirmLoading(false);
        setSnapshotActionLoading(null);
        setSnapshotConfirmInput('');
        setSnapshotConfirm({
            title: '⚠️ 完全削除の確認',
            message: `「${deletedRow.title || '棚卸し'}」を完全に削除しますか？\nこの操作は取り消せません。\n\n確認のため delete と入力してください。`,
            requireText: 'delete',
            confirmLabel: '完全削除する',
            loadingLabel: '削除中...',
            onConfirm: async () => {
                setSnapshotConfirmLoading(true);
                setSnapshotActionLoading({ type: 'hard-delete', id: deletedRow.id });
                try {
                    await inventoryService.hardDeleteSnapshotFromTrash(userId, deletedRow.id);
                    await loadData(true);
                    setNotification({ title: '完了', message: '完全に削除しました', type: 'success' });
                } catch (e) {
                    console.error(e);
                    setNotification({ title: 'エラー', message: '完全削除に失敗しました', type: 'error' });
                } finally {
                    setSnapshotConfirmLoading(false);
                    setSnapshotActionLoading(null);
                    setSnapshotConfirm(null);
                }
            }
        });
    };

    const downloadSnapshotCsv = (snapshot) => {
        if (!snapshot) return;
        const list = getSnapshotItemsArray(snapshot).filter((it) => !isHiddenVendor(it?.vendor));

        const headers = ['品名', '仕入れ値', '単位', '在庫数', '在庫金額(税込)', '業者名'];
        const rows = list.map((it) => {
            const price = parseFloat(it?.price) || 0;
            const qty = it?.quantity === '' ? 0 : (parseFloat(it?.quantity) || 0);
            const total = Math.round(price * qty * getTaxMultiplier(it));
            return [
                it?.name ?? '',
                price || '',
                it?.unit ?? '',
                it?.quantity ?? '',
                total || '',
                it?.vendor ?? '',
            ];
        });

        const escapeCsv = (value) => {
            const s = String(value ?? '');
            if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        const csvContent = [
            headers.map(escapeCsv).join(','),
            ...rows.map((r) => r.map(escapeCsv).join(',')),
        ].join('\n');

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const title = (snapshot.title || 'inventory_snapshot').toString().replace(/[\\/:*?"<>|]/g, '_');
        const dateStr = (snapshot.snapshot_date ? new Date(snapshot.snapshot_date) : new Date())
            .toISOString()
            .slice(0, 10);

        const link = document.createElement('a');
        link.href = url;
        link.download = `InventorySnapshot_${dateStr}_${title}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadSummaryCsv = () => {
        if (!summarySnapshot) return;
        const headers = ['業者名', '合計金額(税込)'];
        const rows = summaryVendorTotals.map((row) => [
            row.vendor,
            Math.round(row.total || 0)
        ]);
        const escapeCsv = (value) => {
            const s = String(value ?? '');
            if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };
        const csvContent = [
            headers.map(escapeCsv).join(','),
            ...rows.map((r) => r.map(escapeCsv).join(','))
        ].join('\n');
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const dateStr = (summarySnapshot.snapshot_date ? new Date(summarySnapshot.snapshot_date) : new Date())
            .toISOString()
            .slice(0, 10);
        const title = summarySnapshot.title || 'inventory_summary';
        const label = summaryMonthInfo ? `${summaryMonthInfo.year}${String(summaryMonthInfo.month).padStart(2, '0')}` : dateStr;
        const safeTitle = title.toString().replace(/[\\/:*?"<>|]/g, '_');
        const link = document.createElement('a');
        link.href = url;
        link.download = `InventorySummary_${label}_${safeTitle}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadSummaryVendorCsv = (detail) => {
        if (!detail?.vendor) return;

        const headers = ['品名', '区分', '単価', '単位', '数量', '金額(税込)', '業者名'];
        const rows = (detail.rows || []).map((detailRow) => {
            const categoryLabel = detailRow.itemCategory
                ? getItemCategoryLabel(detailRow.itemCategory)
                : getSummaryBreakdownLabel(detailRow.breakdownKey);
            return [
                detailRow.name || '',
                categoryLabel,
                Math.round(detailRow.price || 0),
                detailRow.unit || '',
                Number(detailRow.quantity || 0),
                Math.round(detailRow.taxed || 0),
                detail.vendor
            ];
        });

        const escapeCsv = (value) => {
            const s = String(value ?? '');
            if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        const csvContent = [
            headers.map(escapeCsv).join(','),
            ...rows.map((r) => r.map(escapeCsv).join(','))
        ].join('\n');

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const dateStr = (summarySnapshot?.snapshot_date ? new Date(summarySnapshot.snapshot_date) : new Date())
            .toISOString()
            .slice(0, 10);
        const label = summaryMonthInfo ? `${summaryMonthInfo.year}${String(summaryMonthInfo.month).padStart(2, '0')}` : dateStr;
        const safeVendor = detail.vendor.toString().replace(/[\\/:*?"<>|]/g, '_');

        const link = document.createElement('a');
        link.href = url;
        link.download = `InventorySummary_${label}_${safeVendor}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Merge Inventory and CSV Data
    const mergedComponents = React.useMemo(() => {
        const normalize = (str) => str ? str.toString().trim() : '';
        const keyFor = (str) => normalizeIngredientKey(str);

        // Treat name variations as the same (case/space/full-width) when matching.
        const ignoredKeySet = new Set();
        try {
            for (const rawName of (ignoredNames || new Set()).values()) {
                const k = keyFor(rawName);
                if (k) ignoredKeySet.add(k);
            }
        } catch {
            // ignore
        }

        const excludedKeySet = new Set();
        try {
            for (const rawName of (excludedNames || new Set()).values()) {
                const k = keyFor(rawName);
                if (k) excludedKeySet.add(k);
            }
        } catch {
            // ignore
        }

        const masterByName = new Map();
        try {
            for (const [name, row] of (ingredientMasterMap || new Map()).entries()) {
                const k = keyFor(name);
                if (!k) continue;
                masterByName.set(k, row);
            }
        } catch {
            // ignore
        }

        const csvByName = new Map();
        try {
            (csvData || []).forEach((row) => {
                const k = keyFor(row?.name);
                if (!k) return;
                csvByName.set(k, row);
            });
        } catch {
            // ignore
        }

        const overridesByName = new Map();
        try {
            for (const [rawName, unit] of (csvUnitOverrideMap || new Map()).entries()) {
                const k = keyFor(rawName);
                if (!k) continue;
                overridesByName.set(k, unit);
            }
        } catch {
            // ignore
        }

        const normalizeUnit = (u) => {
            const s = String(u ?? '').trim();
            if (!s) return '';
            const lower = s.toLowerCase();
            if (lower === 'ｇ') return 'g';
            if (lower === 'ｍｌ') return 'ml';
            if (lower === 'ｃｃ') return 'cc';
            if (lower === 'ｋｇ') return 'kg';
            if (lower === 'ｌ') return 'l';
            if (lower === 'ｃｌ') return 'cl';
            return lower;
        };

        // Inventory expects "price" to be per-unit (matching item.unit).
        // Ingredient master stores packet total price + packet size/unit.
        const masterUnitPriceFor = (master, targetUnitRaw) => {
            const lastPrice = parseFloat(master?.lastPrice);
            const packetSize = parseFloat(master?.packetSize);
            const packetUnit = normalizeUnit(master?.packetUnit);
            const targetUnit = normalizeUnit(targetUnitRaw || packetUnit);
            if (!Number.isFinite(lastPrice) || !Number.isFinite(packetSize) || packetSize <= 0) return null;
            if (!packetUnit) return null;

            // base price per 1 packetUnit
            const perPacketUnit = lastPrice / packetSize;

            // Same unit
            if (targetUnit === packetUnit) return perPacketUnit;

            // g <-> kg
            if (packetUnit === 'g' && targetUnit === 'kg') return perPacketUnit * 1000;
            if (packetUnit === 'kg' && targetUnit === 'g') return perPacketUnit / 1000;

            // ml/cc <-> l (treat cc as ml)
            const pu = packetUnit === 'cc' ? 'ml' : packetUnit;
            const tu = targetUnit === 'cc' ? 'ml' : targetUnit;
            if (pu === 'ml' && tu === 'l') return perPacketUnit * 1000;
            if (pu === 'l' && tu === 'ml') return perPacketUnit / 1000;

            // cl (1 cl = 10 ml) <-> ml
            if (pu === 'cl' && tu === 'ml') return (lastPrice / packetSize) / 10;
            if (pu === 'ml' && tu === 'cl') return perPacketUnit * 10;
            if (pu === 'cl' && tu === 'cl') return perPacketUnit;

            // Not convertible
            return null;
        };

        const isCountUnit = (uRaw) => {
            const u = String(uRaw ?? '').trim();
            if (!u) return false;
            // Units that typically represent "number of packages/items"
            return ['本', '個', '袋', '枚', 'パック', '缶', '箱', 'pc', 'PC', '包'].includes(u);
        };

        const applyMasterPriority = (base) => {
            const nameKey = keyFor(base?.name);
            const m = nameKey ? masterByName.get(nameKey) : null;
            const csvRow = nameKey ? csvByName.get(nameKey) : null;
            const csvUnit = (nameKey && overridesByName.has(nameKey))
                ? String(overridesByName.get(nameKey) || '')
                : String(csvRow?.unit || '');

            // Always attach CSV info for UI display (e.g. show "¥1200/kg").
            const baseWithCsv = { ...base };
            baseWithCsv.name = normalize(baseWithCsv.name);
            baseWithCsv.vendor = normalize(baseWithCsv.vendor);
            baseWithCsv._csv = {
                unit: csvUnit,
                price: csvRow?.price ?? null,
                vendor: normalize(csvRow?.vendor) || null,
                dateStr: csvRow?.dateStr ?? null
            };

            if (!m) return baseWithCsv;
            const next = { ...baseWithCsv };
            const normalizedCategory = normalizeItemCategory(m?.itemCategory);

            // 材料マスター（unit_conversions）の入力を優先
            // - price: must be per-unit (matching next.unit) to avoid huge totals
            // - unit/quantity: when inventory uses count-like units (本/袋/個...) but master is g/ml etc,
            //   normalize to master unit and convert quantity using packetSize (e.g., 1本 -> 500ml).
            const masterUnit = m.packetUnit || '';
            const packetSize = parseFloat(m.packetSize);
            const masterPricePerUnit = masterUnit ? masterUnitPriceFor(m, masterUnit) : null;

            if (next.isPhantom) {
                if (masterUnit && masterPricePerUnit !== null) {
                    next.unit = masterUnit;
                    next.price = masterPricePerUnit;
                }
            } else {
                // If existing inventory row is in count-unit and master provides measurable unit,
                // convert quantity/threshold to master unit so calculations stay correct.
                const shouldConvertToMasterUnit =
                    !!masterUnit &&
                    Number.isFinite(packetSize) &&
                    packetSize > 0 &&
                    (isCountUnit(next.unit) || !next.unit);

                if (shouldConvertToMasterUnit && masterPricePerUnit !== null) {
                    // Convert quantity if it's numeric (keep empty string as-is)
                    const qRaw = next.quantity;
                    if (qRaw !== '' && qRaw !== null && qRaw !== undefined) {
                        const q = parseFloat(qRaw);
                        if (Number.isFinite(q)) next.quantity = q * packetSize;
                    }

                    // Convert threshold similarly so alert logic remains consistent
                    const tRaw = next.threshold;
                    if (tRaw !== '' && tRaw !== null && tRaw !== undefined) {
                        const t = parseFloat(tRaw);
                        if (Number.isFinite(t)) next.threshold = t * packetSize;
                    }

                    next.unit = masterUnit;
                } else {
                    // Force unit to master when possible, but keep the numeric quantity as-is.
                    // This matches "単位だけを変えて計算する" use-cases.
                    if (masterUnit && masterPricePerUnit !== null) {
                        next.unit = masterUnit;
                    } else if (!next.unit && masterUnit) {
                        next.unit = masterUnit;
                    }
                }

                if (masterPricePerUnit !== null && normalizeUnit(next.unit) === normalizeUnit(masterUnit)) {
                    next.price = masterPricePerUnit;
                } else {
                    const p = masterUnitPriceFor(m, next.unit || masterUnit);
                    if (p !== null) next.price = p;
                }
            }

            const tax10Override = isTax10(next?.tax10_override ?? next?.tax10Override);
            const tax10Auto = normalizedCategory ? isTax10ByItemCategory(normalizedCategory) : null;

            // Keep extra master info for future UI if needed
            next._master = {
                packetSize: m.packetSize,
                packetUnit: m.packetUnit,
                lastPrice: m.lastPrice,
                itemCategory: normalizedCategory || null,
                tax10Auto,
                tax10Override,
                updatedAt: m.updatedAt
            };

            // 税率ルール: アルコール/備品は10%、食材/ソフトドリンクは8%（材料マスター区分がある場合）
            // - tax10_override=false (default): 自動判定を適用
            // - tax10_override=true : 明示設定を優先（手動でチェック可能にする）
            if (normalizedCategory) {
                next.tax10_override = tax10Override;
                if (!tax10Override && tax10Auto !== null) {
                    next.tax10 = tax10Auto;
                }
            }
            return next;
        };

        const effectiveItems = items.map(applyMasterPriority);
        const inventoryMap = new Map();
        effectiveItems.forEach((i) => {
            const k = keyFor(i?.name);
            if (!k) return;
            inventoryMap.set(k, i);
        });
        const merged = [...effectiveItems];

        csvData.forEach((csvItem, index) => {
            const rawName = String(csvItem?.name ?? '');
            const trimmedName = normalize(rawName);
            const nameKey = keyFor(rawName);
            if (!nameKey) return;
            if (ignoredNames.has(rawName) || (trimmedName && ignoredNames.has(trimmedName)) || ignoredKeySet.has(nameKey)) return;

            if (!inventoryMap.has(nameKey)) {
                const base = {
                    id: `phantom-${index}`,
                    isPhantom: true,
                    name: trimmedName,
                    quantity: '',
                    unit: csvItem.unit || '',
                    category: '',
                    price: csvItem.price,
                    vendor: normalize(csvItem.vendor),
                    threshold: 0,
                    tax10: false,
                    tax10_override: false
                };
                merged.push(applyMasterPriority(base));
            }
        });
        const filtered = merged.filter(i => {
            const rawName = String(i?.name ?? '');
            const trimmedName = normalize(rawName);
            const nameKey = keyFor(rawName);
            if (ignoredNames.has(rawName) || (trimmedName && ignoredNames.has(trimmedName)) || (nameKey && ignoredKeySet.has(nameKey))) return false;
            if (excludedNames.has(rawName) || (trimmedName && excludedNames.has(trimmedName)) || (nameKey && excludedKeySet.has(nameKey))) return false;
            if (isHiddenVendor(i.vendor)) return false;
            return true;
        });

        // Prevent duplicated rows in the inventory table.
        // Dedupe by (vendor, normalized ingredient key).
        // Prefer persisted rows over CSV phantom rows; if multiple persisted rows exist, pick the latest by updated_at/created_at.
        const toDateMs = (value) => {
            if (!value) return -1;
            const d = new Date(value);
            const ms = d.getTime();
            return Number.isFinite(ms) ? ms : -1;
        };

        const pickPreferred = (a, b) => {
            const aPhantom = !!a?.isPhantom;
            const bPhantom = !!b?.isPhantom;
            if (aPhantom !== bPhantom) return aPhantom ? b : a;

            const aMs = Math.max(
                toDateMs(a?.updated_at),
                toDateMs(a?.updatedAt),
                toDateMs(a?.created_at),
                toDateMs(a?.createdAt),
            );
            const bMs = Math.max(
                toDateMs(b?.updated_at),
                toDateMs(b?.updatedAt),
                toDateMs(b?.created_at),
                toDateMs(b?.createdAt),
            );
            if (aMs !== bMs) return bMs > aMs ? b : a;

            // If timestamps are equal/unknown, prefer non-empty quantity.
            const aQtyRaw = a?.quantity;
            const bQtyRaw = b?.quantity;
            const aQty = aQtyRaw === '' || aQtyRaw === null || aQtyRaw === undefined ? null : parseFloat(aQtyRaw);
            const bQty = bQtyRaw === '' || bQtyRaw === null || bQtyRaw === undefined ? null : parseFloat(bQtyRaw);
            const aHasQty = aQty !== null && Number.isFinite(aQty);
            const bHasQty = bQty !== null && Number.isFinite(bQty);
            if (aHasQty !== bHasQty) return bHasQty ? b : a;

            // Stable fallback: keep the first one.
            return a;
        };

        const deduped = new Map();
        filtered.forEach((it) => {
            const nameKey = keyFor(it?.name) || normalize(it?.name);
            if (!nameKey) return;
            const vendorKey = normalize(it?.vendor) || '__no_vendor__';
            const key = `${vendorKey}@@${nameKey}`;
            const prev = deduped.get(key);
            if (!prev) {
                deduped.set(key, it);
                return;
            }
            deduped.set(key, pickPreferred(prev, it));
        });

        return Array.from(deduped.values());
    }, [items, csvData, ignoredNames, excludedNames, ingredientMasterMap, csvUnitOverrideMap, isHiddenVendor]);

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over) return;

        const activeType = active?.data?.current?.type;
        if (activeType === 'summary-row') {
            if (!summaryOrderKey) return;
            const activeId = active.id;
            const overId = over.id;
            if (!activeId || !overId || activeId === overId) return;
            const currentOrder = summaryOrder;
            const oldIndex = currentOrder.indexOf(activeId);
            const newIndex = currentOrder.indexOf(overId);
            if (oldIndex < 0 || newIndex < 0) return;
            const nextOrder = arrayMove(currentOrder, oldIndex, newIndex);
            setSummaryOrderByMonth((prev) => ({ ...prev, [summaryOrderKey]: nextOrder }));
            return;
        }

        if (over.id === 'inventory-list-droppable') {
            const item = active.data.current.item;
            if (active.data.current.type === 'csv-item') {
                const itemNameTrimmed = String(item?.name ?? '').trim();
                const nameKey = normalizeIngredientKey(itemNameTrimmed);
                let m = null;
                if (ingredientMasterMap && ingredientMasterMap.size > 0 && nameKey) {
                    // Prefer exact key, but also allow loose match (case/space/full-width).
                    m = ingredientMasterMap.get(itemNameTrimmed) || null;
                    if (!m) {
                        for (const [rawName, row] of ingredientMasterMap.entries()) {
                            if (normalizeIngredientKey(rawName) === nameKey) {
                                m = row;
                                break;
                            }
                        }
                    }
                }

                const preferredUnit = m?.packetUnit || item.unit;
                // For inventory, prefer per-unit price (normalized) when master exists
                const masterPricePerUnit = m ? masterUnitPriceFor(m, preferredUnit) : null;
                const preferredPrice = masterPricePerUnit !== null
                    ? masterPricePerUnit
                    : ((m?.lastPrice !== null && m?.lastPrice !== undefined && m?.lastPrice !== '') ? m.lastPrice : item.price);
                setEditingItem({
                    name: item.name,
                    price: preferredPrice,
                    unit: preferredUnit,
                    category: '',
                    threshold: 0,
                    quantity: 0,
                    vendor: item.vendor,
                    tax10: isTax10(item?.tax10),
                    isNewFromCsv: true
                });
                setIsEditing(true);
                setIngredientName(item.name || '');
            }
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!userId) return;
        const formData = new FormData(e.target);

        const name = formData.get('name');
        const quantity = parseFloat(formData.get('quantity'));
        const unit = formData.get('unit');
        const category = formData.get('category');
        const threshold = parseFloat(formData.get('threshold'));

        // New fields
        const vendor = formData.get('vendor');
        const price = parseFloat(formData.get('price'));

        // Packet info (Master data)
        const packetSize = formData.get('packetSize'); // string
        const packetUnit = formData.get('packetUnit'); // string

        const newItem = {
            name,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            unit,
            category,
            threshold: Number.isFinite(threshold) ? threshold : 0,
            vendor: vendor || (editingItem?.vendor || ''),
            price: Number.isFinite(price) ? price : (editingItem?.price || 0),
            tax10: isTax10(editingItem?.tax10)
        };

        try {
            // 1. Save Packet Info to Material Master (unit_conversions) if provided
            if (packetSize && packetUnit) {
                const sizeVal = parseFloat(packetSize);
                if (Number.isFinite(sizeVal) && sizeVal > 0) {
                    await unitConversionService.saveConversion(
                        name,
                        sizeVal,
                        packetUnit,
                        Number.isFinite(price) ? price : null, // lastPrice
                        category, // itemCategory,
                        vendor // vendor
                    );
                    // Refresh in-memory map so the new conversion is applied immediately?
                    // We call loadData() at the end which refreshes everything.
                }
            }

            // 2. Save Inventory Item
            if (editingItem?.id && !editingItem.isPhantom) {
                await inventoryService.update(userId, { ...editingItem, ...newItem });
            } else {
                await inventoryService.add(userId, newItem);
            }
            setIsEditing(false);
            setEditingItem(null);
            loadData();
        } catch (error) {
            console.error("Failed to save item:", error);
            setNotification({ title: 'エラー', message: '保存に失敗しました', type: 'error' });
        }
    };

    const handleDelete = (item) => {
        setItemToDelete(item);
        setDeleteModalOpen(true);
    };

    const handleRequestUnitSync = (item) => {
        if (!item || item.isPhantom) return;
        const masterUnit = item?._master?.packetUnit;
        if (!masterUnit) return;
        setUnitSyncTarget(item);
        setUnitSyncModalOpen(true);
    };

    const closeUnitSyncModal = () => {
        if (unitSyncSaving) return;
        setUnitSyncModalOpen(false);
        setUnitSyncTarget(null);
    };

    const executeUnitSync = async ({ convertQuantity }) => {
        if (!userId) return;
        const item = unitSyncTarget;
        if (!item || item.isPhantom) return;

        const masterUnit = item?._master?.packetUnit;
        if (!masterUnit) return;

        const nextUnit = masterUnit;
        const nextPrice = masterUnitPriceFor(item?._master, nextUnit);
        if (nextPrice === null) {
            setNotification({ title: 'エラー', message: '単価の計算に失敗しました（材料マスターの価格/容量を確認してください）', type: 'error' });
            return;
        }

        let nextQuantity = item.quantity;
        let nextThreshold = item.threshold;

        if (convertQuantity) {
            const factor = unitConversionFactor(item.unit, nextUnit);
            if (!factor) {
                setNotification({ title: 'エラー', message: '単位の換算ができません（kg↔g / l↔ml のみ対応）', type: 'error' });
                return;
            }

            const q = item.quantity === '' ? null : parseFloat(item.quantity);
            if (q !== null && Number.isFinite(q)) nextQuantity = q * factor;

            const t = item.threshold === '' ? null : parseFloat(item.threshold);
            if (t !== null && Number.isFinite(t)) nextThreshold = t * factor;
        }

        setUnitSyncSaving(true);
        try {
            await inventoryService.update(userId, {
                id: item.id,
                unit: nextUnit,
                price: nextPrice,
                quantity: nextQuantity === '' ? 0 : (parseFloat(nextQuantity) || 0),
                threshold: nextThreshold === '' ? 0 : (parseFloat(nextThreshold) || 0),
                tax10: isTax10(item?.tax10)
            });
            await loadData(true);
            setUnitSyncModalOpen(false);
            setUnitSyncTarget(null);
        } catch (error) {
            console.error('Failed to sync unit:', error);
            setNotification({ title: 'エラー', message: '単位の同期に失敗しました', type: 'error' });
        } finally {
            setUnitSyncSaving(false);
        }
    };

    const executeDelete = async () => {
        if (!itemToDelete) return;
        try {
            // Only hide from the current inventory check list UI.
            // Do NOT modify CSV source, and do NOT delete inventory master rows.
            const normalize = (str) => str ? str.toString().trim() : '';
            const name = normalize(itemToDelete?.name);
            if (name) {
                setExcludedNames(prev => {
                    const next = new Set(prev);
                    next.add(name);
                    return next;
                });
            }
            setDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error("Failed to delete/ignore item:", error);
        }
    };

    const handleUpdateQuantity = async (id, newQuantity) => {
        try {
            if (!userId) return;
            const item = mergedComponents.find(i => i.id === id);
            if (!item) return;

            if (item.isPhantom) {
                const newItem = {
                    name: item.name.trim(),
                    quantity: newQuantity,
                    unit: item.unit,
                    category: item.category || '',
                    price: item.price,
                    vendor: item.vendor,
                    threshold: 0,
                    tax10: isTax10(item?.tax10)
                };
                const added = await inventoryService.add(userId, newItem);
                await loadData(true);
                setCheckedItems(prev => {
                    const newSet = new Set(prev);
                    newSet.add(added.id);
                    return newSet;
                });
            } else {
                // Keep local state consistent with what we display (unit/price may be normalized by master)
                setItems(prev => prev.map(i => {
                    if (i.id !== id) return i;
                    return {
                        ...i,
                        quantity: newQuantity,
                        unit: item.unit ?? i.unit,
                        price: item.price ?? i.price,
                        threshold: item.threshold ?? i.threshold,
                    };
                }));
                setCheckedItems(prev => {
                    const newSet = new Set(prev);
                    newSet.add(id);
                    return newSet;
                });
                await inventoryService.update(userId, { ...item, quantity: newQuantity });
            }
        } catch (e) {
            console.error(e);
            const msg =
                e?.message ||
                e?.error_description ||
                (typeof e === 'string' ? e : null) ||
                (() => { try { return JSON.stringify(e); } catch { return null; } })() ||
                '更新に失敗しました';
            setNotification({ title: 'エラー', message: `更新に失敗しました\n${msg}`, type: 'error' });
            loadData();
        }
    };

    const handleToggleTax = async (item, nextTax10) => {
        try {
            if (!userId || !item) return;
            const tax10 = !!nextTax10;
            if (item.isPhantom) {
                const newItem = {
                    name: item.name.trim(),
                    quantity: item.quantity === '' ? 0 : (parseFloat(item.quantity) || 0),
                    unit: item.unit,
                    category: item.category || '',
                    price: item.price,
                    vendor: item.vendor,
                    threshold: 0,
                    tax10,
                    tax10_override: true
                };
                await inventoryService.add(userId, newItem);
                await loadData(true);
            } else {
                const nowIso = new Date().toISOString();
                setItems(prev => prev.map(i => (
                    i.id === item.id
                        ? { ...i, tax10, tax10_override: true, updated_at: nowIso, updatedAt: nowIso }
                        : i
                )));
                await inventoryService.update(userId, { ...item, tax10, tax10_override: true });
                await loadData(true);
            }
        } catch (e) {
            console.error(e);
            const msg =
                e?.message ||
                e?.error_description ||
                (typeof e === 'string' ? e : null) ||
                (() => { try { return JSON.stringify(e); } catch { return null; } })() ||
                '更新に失敗しました';
            setNotification({ title: 'エラー', message: `税率の更新に失敗しました\n${msg}`, type: 'error' });
            loadData();
        }
    };

    const handleRequestToggleTax = (item, nextTax10) => {
        // Ask confirmation ONLY when switching to 10%.
        if (nextTax10 === true) {
            setTaxConfirm({ item });
            return;
        }
        void handleToggleTax(item, nextTax10);
    };

    const closeTaxConfirmModal = () => {
        if (taxConfirmSaving) return;
        setTaxConfirm(null);
    };

    const confirmTax10Switch = async () => {
        const item = taxConfirm?.item;
        if (!item) return;
        setTaxConfirmSaving(true);
        try {
            await handleToggleTax(item, true);
            setTaxConfirm(null);
        } finally {
            setTaxConfirmSaving(false);
        }
    };

    const handleCompleteInventory = async () => {
        if (snapshotSaving) return;
        if (!snapshotTitle) return;
        if (!userId) return;
        setSnapshotSaving(true);
        try {
            // Use the same normalized view that the user sees (master overrides applied),
            // and strip UI-only fields before saving to DB snapshots.
            const snapshotItems = mergedComponents
                .filter(i => !i.isPhantom)
                .map((it) => {
                    const rest = { ...it };
                    delete rest.isPhantom;
                    delete rest._master;
                    delete rest._csv;
                    return rest;
                });

            const totalValue = snapshotItems.reduce((sum, it) => {
                const price = parseFloat(it.price) || 0;
                const qty = it.quantity === '' ? 0 : (parseFloat(it.quantity) || 0);
                return sum + (price * qty * getTaxMultiplier(it));
            }, 0);

            await inventoryService.createSnapshot(userId, snapshotTitle, snapshotItems, totalValue);
            if (resetAfterSnapshot) {
                await inventoryService.resetStockQuantities(userId);
                await loadData();
                setCheckedItems(new Set());
            } else {
                // Keep quantities as-is; just refresh history lists silently
                await loadData(true);
            }
            setSnapshotModalOpen(false);
            setCompleteSuccessModalOpen(true);
        } catch (error) {
            console.error("Failed to complete inventory:", error);
            const msg =
                error?.message ||
                error?.error_description ||
                (typeof error === 'string' ? error : null) ||
                (() => { try { return JSON.stringify(error); } catch { return null; } })() ||
                '完了処理に失敗しました';
            setNotification({ title: 'エラー', message: `完了処理に失敗しました\n${msg}`, type: 'error' });
        } finally {
            setSnapshotSaving(false);
        }
    };


    // CSV Export function
    const handleDownloadCsv = () => {
        // Define headers matching the print/list layout
        const headers = ['品名', '仕入れ値', '単位', '在庫数', '在庫金額(税込)', '業者名'];

        // Convert items to CSV rows
        const rows = filteredItems.map(item => {
            const price = parseFloat(item.price) || 0;
            const quantity = item.quantity === '' ? 0 : (parseFloat(item.quantity) || 0);
            const totalValue = Math.round(price * quantity * getTaxMultiplier(item));

            return [
                item.name,
                price,
                item.unit,
                item.quantity, // Keep original input for quantity (might be empty string)
                totalValue,
                item.vendor || ''
            ];
        });

        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => {
                // Handle special characters and quotes
                const stringCell = String(cell ?? '');
                if (stringCell.includes(',') || stringCell.includes('"') || stringCell.includes('\n')) {
                    return `"${stringCell.replace(/"/g, '""')}"`;
                }
                return stringCell;
            }).join(','))
        ].join('\n');

        // Add BOM for Excel compatibility
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        // Use standard MIME type
        const blob = new Blob([bom, csvContent], { type: 'text/csv' });

        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().split('T')[0];

        // Use English filename to ensure extension is preserved on all browsers/OS
        link.href = url;
        link.download = `Inventory_${dateStr}.csv`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Clean up
        URL.revokeObjectURL(url);
    };

    const categories = [
        '野菜', 'お肉', 'お魚', 'フルーツ', '粉類', '調味料類', '乾物',
        'ワイン', 'スピリッツ', 'リキュール', 'ウイスキー', '焼酎'
    ];

    const uniqueVendors = [...new Set(mergedComponents.map(item => item.vendor).filter(v => v && !isHiddenVendor(v)))].sort();
    const hasNoVendorItems = mergedComponents.some(item => !item.vendor);
    const isSummaryTab = activeTab === 'summary';

    const filteredItems = mergedComponents.filter(item => {
        // First filter by search query
        if (!item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;

        // Then filter by tab
        if (activeTab === 'all') return true;
        if (activeTab === 'summary') return true;
        if (activeTab === 'inventory-check') {
            // Show items that are explicitly checked OR already saved in DB (not phantom)
            // This ensures data persists in the list after reload
            return checkedItems.has(item.id) || !item.isPhantom;
        }
        if (activeTab === 'other') return !item.vendor; // specific case for no vendor

        // Vendor tab
        return item.vendor === activeTab;
    });

    // Handler for autocomplete selection - auto-fill master data
    const handleIngredientSelect = (selectedItem) => {
        if (!selectedItem) return;

        // Search for matching master data
        const nameKey = normalizeIngredientKey(selectedItem.name);
        let masterData = null;

        if (ingredientMasterMap && ingredientMasterMap.size > 0 && nameKey) {
            // Try exact match first
            masterData = ingredientMasterMap.get(selectedItem.name) || null;

            // If not found, try normalized key match
            if (!masterData) {
                for (const [rawName, row] of ingredientMasterMap.entries()) {
                    if (normalizeIngredientKey(rawName) === nameKey) {
                        masterData = row;
                        break;
                    }
                }
            }
        }

        // Update editingItem with master data if available
        if (masterData) {
            const preferredUnit = masterData.packetUnit || editingItem?.unit || '';
            const masterPricePerUnit = masterData.packetUnit ? masterUnitPriceFor(masterData, preferredUnit) : null;
            const preferredPrice = masterPricePerUnit !== null
                ? masterPricePerUnit
                : (masterData.lastPrice || editingItem?.price || 0);

            setEditingItem(prev => ({
                ...prev,
                name: selectedItem.name,
                price: preferredPrice,
                unit: preferredUnit,
                vendor: masterData.vendor || prev?.vendor || '',
                _master: {
                    packetSize: masterData.packetSize,
                    packetUnit: masterData.packetUnit,
                    lastPrice: masterData.lastPrice,
                    itemCategory: masterData.itemCategory,
                    updatedAt: masterData.updatedAt
                }
            }));
        } else {
            // No master data, just update name
            setEditingItem(prev => ({ ...prev, name: selectedItem.name }));
        }
    };

    if (isEditing) {
        // Pre-fill packet info if available in _master
        const currentPacketSize = editingItem?._master?.packetSize || '';
        const currentPacketUnit = editingItem?._master?.packetUnit || '';

        return (
            <div className="inventory-edit-container fade-in">
                <div className="container-header">
                    <h2 className="section-title">{editingItem && !editingItem.isNewFromCsv ? '在庫編集' : '新規在庫登録'}</h2>
                </div>
                <Card className="edit-form-card">
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label>材料名 <span className="badge-required">必須</span></label>
                            <AutocompleteInput
                                name="name"
                                required
                                value={ingredientName}
                                onChange={(e) => setIngredientName(e.target.value)}
                                onSelect={handleIngredientSelect}
                                placeholder="例: リロンデル"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>業者名</label>
                                <Input
                                    name="vendor"
                                    defaultValue={editingItem?.vendor}
                                    list="vendor-list"
                                    placeholder="例: 株式会社◯◯"
                                />
                                <datalist id="vendor-list">
                                    {uniqueVendors.filter(v => v !== 'その他').map(v => <option key={v} value={v} />)}
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label>仕入れ値 (円)</label>
                                <Input name="price" type="number" step="1" defaultValue={editingItem?.price} placeholder="0" />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>現在庫数 <span className="badge-required">必須</span></label>
                                <Input name="quantity" type="number" step="0.01" defaultValue={editingItem?.quantity} required />
                            </div>
                            <div className="form-group">
                                <label>単位 <span className="badge-required">必須</span></label>
                                <Input name="unit" defaultValue={editingItem?.unit || 'pc'} required placeholder="g, ml, 個, pc..." />
                            </div>
                        </div>

                        <div style={{ marginTop: '16px', padding: '12px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px', color: '#495057' }}>
                                📦 荷姿・内容量 (任意)
                                <span style={{ fontSize: '0.8rem', fontWeight: 'normal', marginLeft: '8px', color: '#868e96' }}>
                                    ※ 1pc = 400g のように設定すると、自動計算に使われます
                                </span>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label style={{ fontSize: '0.85rem' }}>内容量 (1つあたり)</label>
                                    <Input name="packetSize" type="number" step="0.01" defaultValue={currentPacketSize} placeholder="例: 400" />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '0.85rem' }}>内容量単位</label>
                                    <Input name="packetUnit" defaultValue={currentPacketUnit} placeholder="例: g" />
                                </div>
                            </div>
                        </div>

                        <div className="form-row" style={{ marginTop: '16px' }}>
                            <div className="form-group">
                                <label>カテゴリー</label>
                                <Input
                                    name="category"
                                    defaultValue={editingItem?.category}
                                    list="category-list"
                                    placeholder="選択または入力"
                                    autoComplete="off"
                                />
                                <datalist id="category-list">
                                    {categories.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label>発注点 (これ以下でアラート)</label>
                                <Input name="threshold" type="number" step="0.01" defaultValue={editingItem?.threshold || 0} />
                            </div>
                        </div>

                        <div className="form-actions">
                            <Button variant="ghost" type="button" onClick={() => { setIsEditing(false); setEditingItem(null); }}>キャンセル</Button>
                            <Button variant="primary" type="submit">保存</Button>
                        </div>
                    </form>
                </Card>
            </div>
        );
    }

    return (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors} autoScroll={false}>
            <div className="inventory-container fade-in">
                <div className="container-header">
                    <h2 className="section-title">📦 在庫管理</h2>
                    <div className="header-actions inventory-header-actions">
                        <Button variant="ghost" onClick={onBack}>← メニュー</Button>

                        <Button
                            variant="secondary"
                            className="inventory-header-actions__btn"
                            onClick={() => setSearchParams({ view: 'data', tab: 'csv-import' })}
                            title="データ管理のCSV取込へ"
                        >
                            📥 CSV取込へ
                        </Button>

                        <Button
                            variant="primary"
                            className="inventory-header-actions__btn inventory-header-actions__btn--main"
                            style={{ backgroundColor: '#2ecc71', borderColor: '#27ae60' }}
                            onClick={() => {
                                const today = new Date();
                                setSnapshotTitle(`${today.getFullYear()}年${today.getMonth() + 1}月 棚卸し`);
                                setResetAfterSnapshot(true);
                                setSnapshotModalOpen(true);
                            }}
                        >
                            🎉 棚卸し完了
                        </Button>

                        <Button
                            variant="secondary"
                            className="inventory-header-actions__btn"
                            onClick={() => {
                                setSelectedSnapshot(null);
                                setSnapshotHistoryTab('history');
                                setSnapshotHistoryModalOpen(true);
                            }}
                            title="保存済みの棚卸し履歴を表示"
                        >
                            📜 履歴
                        </Button>

                        <Button
                            variant="primary"
                            className="inventory-header-actions__btn"
                            onClick={() => { setEditingItem(null); setIngredientName(''); setIsEditing(true); }}
                        >
                            + アイテム追加
                        </Button>
                    </div>
                </div>

                <div className="inventory-split-layout">
                    {/* Inventory List (Full Width) */}
                    <div className="inventory-right-panel" style={{ paddingLeft: 0, borderLeft: 'none' }}>
                        <div className="inventory-controls">
                            {!isSummaryTab ? (
                                <div className="inventory-controls__row inventory-controls__row--filters">
                                    <div className="inventory-controls__field">
                                        <label className="inventory-controls__label">業者選択:</label>
                                        <select
                                            className="inventory-controls__select"
                                            value={activeTab === 'inventory-check' ? '' : activeTab}
                                            onChange={(e) => {
                                                // allow switching back to "all"
                                                if (e.target.value) setActiveTab(e.target.value);
                                            }}
                                        >
                                            <option value="all">すべて</option>
                                            <option value="" disabled>業者を選択してください</option>
                                            <optgroup label="業者リスト">
                                                {uniqueVendors.map(vendor => (
                                                    <option key={vendor} value={vendor}>{vendor}</option>
                                                ))}
                                                {hasNoVendorItems && <option value="other">その他</option>}
                                            </optgroup>
                                        </select>
                                    </div>

                                    <input
                                        className="inventory-controls__search"
                                        placeholder="🔍 在庫検索..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            ) : (
                                <div className="inventory-controls__row inventory-controls__row--filters">
                                    <div className="inventory-controls__field">
                                        <label className="inventory-controls__label">対象月:</label>
                                        <select
                                            className="inventory-controls__select"
                                            value={summaryMonth}
                                            onChange={(e) => setSummaryMonth(e.target.value)}
                                            disabled={monthOptions.length === 0}
                                        >
                                            {monthOptions.length === 0 ? (
                                                <option value="">棚卸し履歴がありません</option>
                                            ) : (
                                                monthOptions.map((m) => (
                                                    <option key={m.key} value={m.key}>{m.label}</option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                    {summaryMonthInfo && (
                                        <div className="inventory-controls__summary-range">
                                            期間: {summaryMonthInfo.rangeLabel}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="inventory-controls__row inventory-controls__row--actions">
                                <button
                                    className="inventory-controls__btn"
                                    onClick={() => setActiveTab('inventory-check')}
                                    data-active={activeTab === 'inventory-check' ? 'true' : 'false'}
                                >
                                    ✅ 棚卸し一覧 ({checkedItems.size})
                                </button>

                                <button
                                    className="inventory-controls__btn"
                                    onClick={() => setActiveTab('summary')}
                                    data-active={activeTab === 'summary' ? 'true' : 'false'}
                                >
                                    📊 統合
                                </button>

                                {!isSummaryTab && (
                                    <button
                                        className="inventory-controls__btn"
                                        onClick={handleDownloadCsv}
                                        title="CSVダウンロード"
                                    >
                                        📥 CSV出力 (.csv)
                                    </button>
                                )}

                                {!isSummaryTab && activeTab === 'inventory-check' && (
                                    <button
                                        className="inventory-controls__btn"
                                        onClick={() => window.print()}
                                        title="印刷 / PDF保存"
                                    >
                                        🖨️ 印刷
                                    </button>
                                )}
                            </div>
                        </div>

                        {isSummaryTab ? (
                            <div className="inventory-summary">
                                <div className="inventory-summary__header">
                                    <div>
                                        <div className="inventory-summary__title">月次統合</div>
                                        {summaryMonthInfo && (
                                            <div className="inventory-summary__meta">対象期間: {summaryMonthInfo.rangeLabel}</div>
                                        )}
                                        {summarySnapshot ? (
                                            <div className="inventory-summary__meta">
                                                対象棚卸し: {summarySnapshot.title || '棚卸し'}（{formatDateTime(summarySnapshot.snapshot_date)}）
                                            </div>
                                        ) : (
                                            <div className="inventory-summary__meta">この月の棚卸し履歴がありません</div>
                                        )}
                                        {summarySnapshots.length > 1 && (
                                            <div className="inventory-summary__note">
                                                この月は棚卸しが {summarySnapshots.length} 件あります。同名品目は月内の最新データを採用して集計しています。
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {summarySnapshot ? (
                                    <div className="inventory-summary__table-wrap">
                                        <div className="inventory-summary__actions">
                                            <Button variant="secondary" size="sm" onClick={downloadSummaryCsv}>
                                                📥 CSV出力 (.csv)
                                            </Button>
                                        </div>
                                        <table className="inventory-summary__table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '40px' }}></th>
                                                    <th>業者名</th>
                                                    <th style={{ textAlign: 'right' }}>合計金額(税込)</th>
                                                </tr>
                                            </thead>
                                            <SortableContext items={summaryOrder} strategy={verticalListSortingStrategy}>
                                                <tbody>
                                                    {summaryVendorTotals.map((row) => {
                                                        const isSelected = selectedSummaryVendor === row.vendor;
                                                        const detail = summaryVendorDetailsMap.get(row.vendor) || null;

                                                        return (
                                                            <React.Fragment key={row.vendor}>
                                                                <SummarySortableRow
                                                                    row={row}
                                                                    onVendorClick={handleSummaryVendorClick}
                                                                    isSelected={isSelected}
                                                                />

                                                                {isSelected && detail && (
                                                                    <tr className="inventory-summary__detail-row">
                                                                        <td></td>
                                                                        <td colSpan="2">
                                                                            <div className="inventory-summary__inline-detail">
                                                                                <div className="inventory-summary__inline-detail-head">
                                                                                    <span className="inventory-summary__inline-detail-title">
                                                                                        {detail.vendor} の内訳
                                                                                    </span>
                                                                                    <div className="inventory-summary__inline-detail-actions">
                                                                                        <Button
                                                                                            variant="secondary"
                                                                                            size="sm"
                                                                                            onClick={() => downloadSummaryVendorCsv(detail)}
                                                                                            disabled={!detail.rows || detail.rows.length === 0}
                                                                                        >
                                                                                            📥 この業者をCSV
                                                                                        </Button>
                                                                                        <span className="inventory-summary__inline-detail-total">
                                                                                            総計（税込）: ¥{Math.round(detail.totals.taxed || 0).toLocaleString()}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="inventory-summary__inline-breakdown">
                                                                                    {['food', 'drink', 'supplies'].map((key) => (
                                                                                        <div key={key} className="inventory-summary__inline-breakdown-row">
                                                                                            <span className="inventory-summary__inline-breakdown-label">
                                                                                                {getSummaryBreakdownLabel(key)}
                                                                                            </span>
                                                                                            <span className="inventory-summary__inline-breakdown-value">
                                                                                                ¥{Math.round(detail.totals[key] || 0).toLocaleString()}
                                                                                            </span>
                                                                                        </div>
                                                                                    ))}
                                                                                    {detail.totals.unknown > 0 && (
                                                                                        <div className="inventory-summary__inline-breakdown-row inventory-summary__inline-breakdown-row--unknown">
                                                                                            <span className="inventory-summary__inline-breakdown-label">未分類</span>
                                                                                            <span className="inventory-summary__inline-breakdown-value">
                                                                                                ¥{Math.round(detail.totals.unknown).toLocaleString()}
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>

                                                                                <div className="inventory-summary__inline-detail-subtotal">
                                                                                    税抜合計: ¥{Math.round(detail.totals.net || 0).toLocaleString()}
                                                                                </div>

                                                                                <div className="inventory-summary__inline-items-wrap">
                                                                                    <table className="inventory-summary__inline-items-table">
                                                                                        <thead>
                                                                                            <tr>
                                                                                                <th>品名</th>
                                                                                                <th>区分</th>
                                                                                                <th style={{ textAlign: 'right' }}>単価</th>
                                                                                                <th style={{ textAlign: 'right' }}>数量</th>
                                                                                                <th style={{ textAlign: 'right' }}>金額(税込)</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {detail.rows.map((detailRow, rowIndex) => {
                                                                                                const categoryLabel = detailRow.itemCategory
                                                                                                    ? getItemCategoryLabel(detailRow.itemCategory)
                                                                                                    : getSummaryBreakdownLabel(detailRow.breakdownKey);
                                                                                                const prevDetailRow = rowIndex > 0 ? detail.rows[rowIndex - 1] : null;
                                                                                                const isCategoryBoundary = !!prevDetailRow && prevDetailRow.breakdownKey !== detailRow.breakdownKey;
                                                                                                return (
                                                                                                    <tr
                                                                                                        key={detailRow.id}
                                                                                                        className={isCategoryBoundary
                                                                                                            ? 'inventory-summary__inline-items-row inventory-summary__inline-items-row--category-start'
                                                                                                            : 'inventory-summary__inline-items-row'}
                                                                                                    >
                                                                                                        <td>{detailRow.name || '-'}</td>
                                                                                                        <td>{categoryLabel}</td>
                                                                                                        <td style={{ textAlign: 'right' }}>
                                                                                                            ¥{Number(detailRow.price || 0).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
                                                                                                        </td>
                                                                                                        <td style={{ textAlign: 'right' }}>
                                                                                                            {Number(detailRow.quantity || 0).toLocaleString('ja-JP', {
                                                                                                                maximumFractionDigits: 3
                                                                                                            })}
                                                                                                            {detailRow.unit ? ` ${detailRow.unit}` : ''}
                                                                                                        </td>
                                                                                                        <td style={{ textAlign: 'right' }}>
                                                                                                            ¥{Math.round(detailRow.taxed || 0).toLocaleString()}
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                );
                                                                                            })}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    {summaryVendorTotals.length === 0 && (
                                                        <tr>
                                                            <td colSpan="3" className="inventory-summary__empty">データがありません</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </SortableContext>
                                            <tfoot>
                                                <tr>
                                                    <td></td>
                                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>合計（税抜 / 税込）</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                        ¥{Math.round(summaryTotals.net).toLocaleString()} / ¥{Math.round(summaryTotals.taxed).toLocaleString()}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="inventory-summary__empty">棚卸し履歴がありません。</div>
                                )}
                            </div>
                        ) : (
                            <InventoryList
                                items={filteredItems}
                                loading={loading}
                                onSearch={setSearchQuery}
                                searchQuery={searchQuery}
                                onEdit={(item) => { setEditingItem(item); setIngredientName(item?.name || ''); setIsEditing(true); }}
                                onDelete={handleDelete}
                                onUpdateQuantity={handleUpdateQuantity}
                                onToggleTax={handleRequestToggleTax}
                                onRequestUnitSync={handleRequestUnitSync}
                            />
                        )}
                    </div>
                </div>

                {/* Tax 10% confirm modal */}
                <Modal
                    isOpen={!!taxConfirm}
                    onClose={closeTaxConfirmModal}
                    title="税率10%へ切り替え"
                    size="small"
                    showCloseButton={!taxConfirmSaving}
                >
                    <div style={{ color: '#333' }}>
                        <p style={{ fontSize: '1rem', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                            「{taxConfirm?.item?.name || 'このアイテム'}」を税率<strong>10%</strong>に切り替えます。よろしいですか？
                        </p>
                        <div style={{ fontSize: '0.85rem', color: '#555', lineHeight: 1.5 }}>
                            在庫金額（税込）の計算結果が変わります。
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                            <Button variant="secondary" onClick={closeTaxConfirmModal} disabled={taxConfirmSaving}>
                                キャンセル
                            </Button>
                            <Button variant="primary" onClick={confirmTax10Switch} disabled={taxConfirmSaving}>
                                {taxConfirmSaving ? '切り替え中...' : '切り替える'}
                            </Button>
                        </div>
                    </div>
                </Modal>

                {/* Snapshot Confirmation Modal */}
                <Modal
                    isOpen={snapshotModalOpen}
                    onClose={() => {
                        if (snapshotSaving) return;
                        setSnapshotModalOpen(false);
                    }}
                    title="🎉 棚卸し完了の確認"
                    size="small"
                >
                    <div style={{ color: '#333' }}>
                        <p style={{ fontSize: '1rem', marginBottom: '1rem', lineHeight: '1.6' }}>
                            現在の入力内容を保存し、今月の棚卸しを完了しますか？
                        </p>
                        <div style={{ background: '#e3f2fd', padding: '10px', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#0d47a1' }}>
                            <strong>実行内容:</strong><br />
                            1. 現在の在庫状況を「履歴」として保存します。<br />
                            2. {resetAfterSnapshot ? (
                                <><strong>全ての在庫数(手入力)を0にリセット</strong>し、来月の入力準備をします。</>
                            ) : (
                                <><strong>在庫数はそのまま保持</strong>します。（リセットしません）</>
                            )}<br />
                            （※マスタデータは消えません）
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px' }}>
                                棚卸し後の在庫数
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', marginBottom: '6px' }}>
                                <input
                                    type="radio"
                                    name="inventory-reset"
                                    checked={resetAfterSnapshot}
                                    disabled={snapshotSaving}
                                    onChange={() => setResetAfterSnapshot(true)}
                                />
                                <span style={{ fontSize: '0.95rem', color: '#333' }}>
                                    在庫数を<strong>0にリセット</strong>する
                                </span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="radio"
                                    name="inventory-reset"
                                    checked={!resetAfterSnapshot}
                                    disabled={snapshotSaving}
                                    onChange={() => setResetAfterSnapshot(false)}
                                />
                                <span style={{ fontSize: '0.95rem', color: '#333' }}>
                                    在庫数は<strong>そのまま保持</strong>する
                                </span>
                            </label>
                            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '6px', lineHeight: 1.4 }}>
                                どちらかを選択してください。保存内容には影響しません。
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                保存名 (タイトル)
                            </label>
                            <input
                                type="text"
                                value={snapshotTitle}
                                onChange={(e) => setSnapshotTitle(e.target.value)}
                                disabled={snapshotSaving}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    fontSize: '1rem'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                onClick={() => {
                                    if (snapshotSaving) return;
                                    setSnapshotModalOpen(false);
                                }}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    background: '#f5f5f5',
                                    color: '#333',
                                    cursor: snapshotSaving ? 'not-allowed' : 'pointer',
                                    opacity: snapshotSaving ? 0.6 : 1,
                                    fontSize: '0.9rem'
                                }}
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleCompleteInventory}
                                disabled={snapshotSaving}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: snapshotSaving ? '#94a3b8' : '#2ecc71',
                                    color: 'white',
                                    cursor: snapshotSaving ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold'
                                }}
                            >
                                {snapshotSaving ? '登録中...' : (resetAfterSnapshot ? '確定してリセット' : '確定して保存')}
                            </button>
                        </div>
                        {snapshotSaving && (
                            <div style={{ marginTop: '10px', fontSize: '0.85rem', color: '#475569', textAlign: 'right' }}>
                                登録中です。しばらくお待ちください。
                            </div>
                        )}
                    </div>
                </Modal>

                {/* Snapshot History Modal */}
                <Modal
                    isOpen={snapshotHistoryModalOpen}
                    onClose={() => setSnapshotHistoryModalOpen(false)}
                    title="📜 棚卸し履歴"
                    size="large"
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ color: '#555', fontSize: '0.9rem' }}>
                            {snapshotHistoryTab === 'history'
                                ? <>保存済み: <strong>{historySnapshots.length}</strong> 件</>
                                : <>ゴミ箱: <strong>{deletedSnapshots.length}</strong> 件</>
                            }
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setSnapshotHistoryTab('history')}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #ccc',
                                        background: snapshotHistoryTab === 'history' ? '#111' : '#fff',
                                        color: snapshotHistoryTab === 'history' ? '#fff' : '#333',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    履歴
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSnapshotHistoryTab('trash')}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #ccc',
                                        background: snapshotHistoryTab === 'trash' ? '#111' : '#fff',
                                        color: snapshotHistoryTab === 'trash' ? '#fff' : '#333',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    ゴミ箱
                                </button>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => loadData(true)}
                                title="最新のデータを読み込み直します"
                            >
                                ↻ 更新
                            </Button>
                        </div>
                    </div>

                    {snapshotHistoryTab === 'history' && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.85rem', color: '#555' }}>対象月:</span>
                                <select
                                    value={historyMonth}
                                    onChange={(e) => setHistoryMonth(e.target.value)}
                                    disabled={monthOptions.length === 0}
                                    style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.85rem' }}
                                >
                                    {monthOptions.length === 0 ? (
                                        <option value="">棚卸し履歴がありません</option>
                                    ) : (
                                        monthOptions.map((m) => (
                                            <option key={m.key} value={m.key}>{m.label}</option>
                                        ))
                                    )}
                                </select>
                            </div>
                            {historyMonthInfo && (
                                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                                    期間: {historyMonthInfo.rangeLabel}
                                </div>
                            )}
                        </div>
                    )}

                    {snapshotHistoryTab === 'history' && historySnapshots.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', padding: '24px 0' }}>
                            この月の棚卸し履歴がありません
                        </div>
                    ) : snapshotHistoryTab === 'trash' && deletedSnapshots.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', padding: '24px 0' }}>
                            ゴミ箱は空です
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f0f0f0' }}>
                                        <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                            {snapshotHistoryTab === 'trash' ? '削除日' : '日付'}
                                        </th>
                                        <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>タイトル</th>
                                        <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>件数</th>
                                        <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>在庫金額(税込)</th>
                                        <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', width: '120px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(snapshotHistoryTab === 'history' ? historySnapshots : deletedSnapshots).map((s) => {
                                        const visibleItems = getSnapshotItemsArray(s).filter((it) => !isHiddenVendor(it?.vendor));
                                        const itemCount = visibleItems.length;
                                        const totalValue = Math.round(visibleItems.reduce((sum, it) => {
                                            const price = parseFloat(it?.price) || 0;
                                            const qty = it?.quantity === '' ? 0 : (parseFloat(it?.quantity) || 0);
                                            return sum + (price * qty * getTaxMultiplier(it));
                                        }, 0));
                                        const key = snapshotHistoryTab === 'trash' ? `trash-${s.id}` : s.id;
                                        const dateLabel = snapshotHistoryTab === 'trash'
                                            ? formatDateTime(s.deleted_at)
                                            : formatDateTime(s.snapshot_date);
                                        const isMoveLoading = snapshotActionLoading?.type === 'move' && snapshotActionLoading?.id === s.id;
                                        const isRestoreLoading = snapshotActionLoading?.type === 'restore' && snapshotActionLoading?.id === s.id;
                                        const isHardDeleteLoading = snapshotActionLoading?.type === 'hard-delete' && snapshotActionLoading?.id === s.id;
                                        const isRowActionLoading = isMoveLoading || isRestoreLoading || isHardDeleteLoading;

                                        return (
                                            <tr key={key} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{dateLabel}</td>
                                                <td style={{ padding: '10px' }}>{s.title || '-'}</td>
                                                <td style={{ padding: '10px', textAlign: 'right' }}>{itemCount.toLocaleString()}</td>
                                                <td style={{ padding: '10px', textAlign: 'right' }}>¥{totalValue.toLocaleString()}</td>
                                                <td style={{ padding: '10px', textAlign: 'right' }}>
                                                    {snapshotHistoryTab === 'history' ? (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => downloadSnapshotCsv(s)}
                                                                disabled={itemCount === 0 || isRowActionLoading}
                                                                title={itemCount === 0 ? 'items が空のためCSV出力できません' : 'この棚卸しをCSVでダウンロード'}
                                                            >
                                                                📥 CSV
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => setSelectedSnapshot(s)}
                                                                disabled={isRowActionLoading}
                                                            >
                                                                詳細
                                                            </Button>
                                                            <Button
                                                                variant="danger"
                                                                size="sm"
                                                                onClick={() => handleMoveSnapshotToTrash(s)}
                                                                disabled={isRowActionLoading}
                                                                title="ゴミ箱に移動"
                                                            >
                                                                {isMoveLoading ? '削除中...' : '削除'}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => downloadSnapshotCsv(s)}
                                                                disabled={itemCount === 0 || isRowActionLoading}
                                                            >
                                                                📥 CSV
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => setSelectedSnapshot(s)}
                                                                disabled={isRowActionLoading}
                                                            >
                                                                詳細
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => handleRestoreSnapshot(s)}
                                                                disabled={isRowActionLoading}
                                                                title="履歴に復元"
                                                            >
                                                                {isRestoreLoading ? '復元中...' : '復元'}
                                                            </Button>
                                                            <Button
                                                                variant="danger"
                                                                size="sm"
                                                                onClick={() => handleHardDeleteSnapshot(s)}
                                                                disabled={isRowActionLoading}
                                                                title="ゴミ箱から完全削除"
                                                            >
                                                                {isHardDeleteLoading ? '削除中...' : '完全削除'}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Modal>

                {/* Snapshot Confirm Modal */}
                <Modal
                    isOpen={!!snapshotConfirm}
                    onClose={() => {
                        if (snapshotConfirmLoading) return;
                        setSnapshotConfirm(null);
                    }}
                    title={snapshotConfirm?.title || '確認'}
                    size="small"
                >
                    <div style={{ color: '#333' }}>
                        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{snapshotConfirm?.message}</p>

                        {snapshotConfirm?.requireText && (
                            <div style={{ marginTop: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                    確認のため <span style={{ fontFamily: 'monospace', background: '#eee', padding: '2px 4px' }}>{snapshotConfirm.requireText}</span> と入力してください
                                </label>
                                <input
                                    type="text"
                                    value={snapshotConfirmInput}
                                    onChange={(e) => setSnapshotConfirmInput(e.target.value)}
                                    placeholder={snapshotConfirm.requireText}
                                    disabled={snapshotConfirmLoading}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '4px',
                                        border: '1px solid #ccc',
                                        fontSize: '1rem'
                                    }}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <Button
                                variant="ghost"
                                disabled={snapshotConfirmLoading}
                                onClick={() => {
                                    if (snapshotConfirmLoading) return;
                                    setSnapshotConfirm(null);
                                }}
                            >
                                キャンセル
                            </Button>
                            <Button
                                variant="danger"
                                disabled={
                                    snapshotConfirmLoading ||
                                    (!!snapshotConfirm?.requireText && snapshotConfirmInput !== snapshotConfirm.requireText)
                                }
                                onClick={() => snapshotConfirm?.onConfirm && snapshotConfirm.onConfirm()}
                            >
                                {snapshotConfirmLoading
                                    ? (snapshotConfirm?.loadingLabel || '処理中...')
                                    : (snapshotConfirm?.confirmLabel || '実行')}
                            </Button>
                        </div>
                    </div>
                </Modal>

                {/* Snapshot Detail Modal */}
                <Modal
                    isOpen={!!selectedSnapshot}
                    onClose={() => setSelectedSnapshot(null)}
                    title={selectedSnapshot ? `📦 ${selectedSnapshot.title || '棚卸し詳細'}` : '📦 棚卸し詳細'}
                    size="large"
                >
                    {(() => {
                        const s = selectedSnapshot;
                        if (!s) return null;
                        const list = getSnapshotItemsArray(s);

                        const filteredRows = list.filter((it) => {
                            if (isHiddenVendor(it?.vendor)) return false;
                            if (!hideZeroSnapshotItems) return true;
                            const qty = it?.quantity === '' ? 0 : (parseFloat(it?.quantity) || 0);
                            return qty !== 0;
                        });

                        const sortedRows = [...filteredRows].sort((a, b) => {
                            const dir = snapshotDetailSort.direction === 'desc' ? -1 : 1;
                            if (snapshotDetailSort.key === 'vendor') {
                                const av = (a?.vendor || '').toString();
                                const bv = (b?.vendor || '').toString();
                                const cmp = av.localeCompare(bv, 'ja');
                                if (cmp !== 0) return cmp * dir;
                                const an = (a?.name || '').toString();
                                const bn = (b?.name || '').toString();
                                return an.localeCompare(bn, 'ja') * dir;
                            }
                            const an = (a?.name || '').toString();
                            const bn = (b?.name || '').toString();
                            const cmp = an.localeCompare(bn, 'ja');
                            if (cmp !== 0) return cmp * dir;
                            const av = (a?.vendor || '').toString();
                            const bv = (b?.vendor || '').toString();
                            return av.localeCompare(bv, 'ja') * dir;
                        });
                        const totals = sortedRows.reduce((sum, it) => {
                            const price = parseFloat(it?.price) || 0;
                            const qty = it?.quantity === '' ? 0 : (parseFloat(it?.quantity) || 0);
                            const base = price * qty;
                            sum.net += base;
                            sum.taxed += base * getTaxMultiplier(it);
                            return sum;
                        }, { net: 0, taxed: 0 });

                        return (
                            <div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', color: '#555', fontSize: '0.9rem' }}>
                                    <div>日付: <strong>{formatDateTime(s.snapshot_date)}</strong></div>
                                    <div>件数: <strong>{sortedRows.length.toLocaleString()}</strong></div>
                                    <div style={{ marginLeft: 'auto' }}>
                                        在庫金額（税抜 / 税込）: <strong>¥{Math.round(totals.net).toLocaleString()} / ¥{Math.round(totals.taxed).toLocaleString()}</strong>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#555' }}>
                                        <input
                                            type="checkbox"
                                            checked={hideZeroSnapshotItems}
                                            onChange={(e) => setHideZeroSnapshotItems(e.target.checked)}
                                        />
                                        在庫0を非表示
                                    </label>
                                    <Button variant="secondary" size="sm" onClick={() => downloadSnapshotCsv(s)}>
                                        📥 CSV出力 (.csv)
                                    </Button>
                                </div>

                                {sortedRows.length === 0 ? (
                                    <div style={{ color: '#666', textAlign: 'center', padding: '24px 0' }}>
                                        表示できるデータがありません
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#f0f0f0' }}>
                                                    <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>品名</th>
                                                    <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap' }}>区分</th>
                                                    <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>仕入れ値</th>
                                                    <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap' }}>単位</th>
                                                    <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>在庫数</th>
                                                    <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', whiteSpace: 'nowrap' }}>在庫金額(税込)</th>
                                                    <th
                                                        style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                        title="クリックで業者名ソート"
                                                        onClick={() => {
                                                            setSnapshotDetailSort((prev) => {
                                                                if (prev.key === 'vendor') {
                                                                    return { key: 'vendor', direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                                                                }
                                                                return { key: 'vendor', direction: 'asc' };
                                                            });
                                                        }}
                                                    >
                                                        業者名 {snapshotDetailSort.key === 'vendor' && (snapshotDetailSort.direction === 'asc' ? '▲' : '▼')}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedRows.map((it, idx) => {
                                                    const price = parseFloat(it?.price) || 0;
                                                    const qty = it?.quantity === '' ? 0 : (parseFloat(it?.quantity) || 0);
                                                    const rowTotal = Math.round(price * qty * getTaxMultiplier(it));
                                                    const itemCategory = resolveSnapshotItemCategory(it);
                                                    const categoryLabel = getItemCategoryLabel(itemCategory);
                                                    return (
                                                        <tr key={it?.id || `${it?.name || 'item'}-${idx}`} style={{ borderBottom: '1px solid #eee' }}>
                                                            <td style={{ padding: '10px' }}>
                                                                {it?.name || '-'}
                                                                {isTax10(it?.tax10) && (
                                                                    <span className="snapshot-tax-badge" title="10%対象">10%</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '10px' }}>{categoryLabel}</td>
                                                            <td style={{ padding: '10px', textAlign: 'right' }}>
                                                                {price ? `¥${Number(price).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}` : '-'}
                                                            </td>
                                                            <td style={{ padding: '10px' }}>{it?.unit || '-'}</td>
                                                            <td style={{ padding: '10px', textAlign: 'right' }}>{qty ? qty.toLocaleString() : '0'}</td>
                                                            <td style={{ padding: '10px', textAlign: 'right' }}>{rowTotal ? `¥${rowTotal.toLocaleString()}` : '-'}</td>
                                                            <td style={{ padding: '10px' }}>{it?.vendor || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </Modal>

                {/* Unit Sync Modal */}
                <Modal
                    isOpen={unitSyncModalOpen}
                    onClose={closeUnitSyncModal}
                    title="単位をマスターに合わせる"
                    size="small"
                >
                    {(() => {
                        const item = unitSyncTarget;
                        const masterUnit = item?._master?.packetUnit || '';
                        const currentUnit = item?.unit || '';
                        const factor = unitConversionFactor(currentUnit, masterUnit);
                        const canConvert = factor !== null && factor !== 1;

                        const price = parseFloat(item?.price) || 0;
                        const qty = item?.quantity === '' ? 0 : (parseFloat(item?.quantity) || 0);
                        const taxMultiplier = item ? getTaxMultiplier(item) : 1.08;
                        const currentTotal = price * qty * taxMultiplier;

                        const nextPrice = masterUnit ? masterUnitPriceFor(item?._master, masterUnit) : null;
                        const nextTotalKeep = nextPrice === null ? null : (nextPrice * qty * taxMultiplier);
                        const nextTotalConvert = (nextPrice === null || !canConvert) ? null : (nextPrice * (qty * factor) * taxMultiplier);

                        const money = (v) => `¥${Math.round(v).toLocaleString()}`;
                        const num = (v) => Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 });

                        return (
                            <div style={{ color: '#333' }}>
                                <div style={{ marginBottom: '12px', lineHeight: 1.6 }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>{item?.name || '-'}</div>
                                    <div style={{ color: '#666', fontSize: '0.9rem' }}>
                                        現在: {num(qty)} {currentUnit} / 単価 ¥{price.toLocaleString()} / 合計 {money(currentTotal)}
                                    </div>
                                    {!!masterUnit && (
                                        <div style={{ color: '#666', fontSize: '0.9rem' }}>
                                            マスター単位: {masterUnit}
                                        </div>
                                    )}
                                </div>

                                <div style={{ background: '#f7fafc', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', marginBottom: '14px' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
                                        「材料マスター」の単位変更は、既存の在庫データ（単位/数量）までは自動で書き換えません。<br />
                                        ここで同期できます。
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                                    <Button variant="ghost" type="button" onClick={closeUnitSyncModal} disabled={unitSyncSaving}>
                                        キャンセル
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        type="button"
                                        onClick={() => executeUnitSync({ convertQuantity: false })}
                                        isLoading={unitSyncSaving}
                                        disabled={unitSyncSaving || !masterUnit || nextPrice === null}
                                        title={nextTotalKeep === null ? '' : `同期後: 合計 ${money(nextTotalKeep)}`}
                                    >
                                        数量はそのまま
                                    </Button>

                                    {canConvert && (
                                        <Button
                                            variant="primary"
                                            type="button"
                                            onClick={() => executeUnitSync({ convertQuantity: true })}
                                            isLoading={unitSyncSaving}
                                            disabled={unitSyncSaving || !masterUnit || nextPrice === null}
                                            title={nextTotalConvert === null ? '' : `同期後: 合計 ${money(nextTotalConvert)}`}
                                        >
                                            数量も換算
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </Modal>

                {/* Delete Confirmation Modal */}
                <Modal
                    isOpen={deleteModalOpen}
                    onClose={() => setDeleteModalOpen(false)}
                    title="削除の確認"
                    size="small"
                >
                    <div style={{ color: '#333' }}>
                        <p style={{ fontSize: '1.1rem', marginBottom: '1rem', lineHeight: '1.6' }}>
                            「<strong>{itemToDelete?.name}</strong>」をリストから削除しますか？
                        </p>
                        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                            この操作は<strong>棚卸し一覧（現在の画面）から一時的に非表示</strong>にするだけです。<br />
                            CSVファイルや在庫マスタのデータは変更しません（次回以降は通常どおり表示されます）。
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    background: '#f5f5f5',
                                    color: '#333',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={executeDelete}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#d32f2f',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold'
                                }}
                            >
                                この一覧から除外
                            </button>
                        </div>
                    </div>
                </Modal>

                {/* Completion Success Modal */}
                <Modal
                    isOpen={completeSuccessModalOpen}
                    onClose={() => setCompleteSuccessModalOpen(false)}
                    title="🎉 棚卸し完了"
                    size="small"
                >
                    <div style={{ color: '#333', textAlign: 'center', padding: '1rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <h3 style={{ marginBottom: '1rem' }}>{snapshotTitle} を保存しました</h3>
                        <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                            現在の在庫状況を履歴に保存し、<br />
                            すべての在庫数をリセットしました。
                        </p>
                        <button
                            onClick={() => setCompleteSuccessModalOpen(false)}
                            style={{
                                padding: '8px 24px',
                                borderRadius: '4px',
                                border: 'none',
                                background: '#2ecc71',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: 'bold'
                            }}
                        >
                            OK
                        </button>
                    </div>
                </Modal>

                {/* Generic Notification Modal (replacing alerts) */}
                <Modal
                    isOpen={!!notification}
                    onClose={() => setNotification(null)}
                    title={notification?.title || 'お知らせ'}
                    size="small"
                >
                    <div style={{ color: '#333', textAlign: 'center', padding: '1rem' }}>
                        {notification?.type === 'success' && <div style={{ fontSize: '2rem', marginBottom: '10px' }}>✅</div>}
                        {notification?.type === 'error' && <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⚠️</div>}
                        <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                            {notification?.message}
                        </p>
                        <button
                            onClick={() => setNotification(null)}
                            style={{
                                padding: '8px 24px',
                                borderRadius: '4px',
                                border: 'none',
                                background: notification?.type === 'error' ? '#e74c3c' : '#2ecc71',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: 'bold'
                            }}
                        >
                            OK
                        </button>
                    </div>
                </Modal>
            </div>
        </DndContext>
    );
};
