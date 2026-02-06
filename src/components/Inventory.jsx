import React, { useState, useEffect } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { inventoryService } from '../services/inventoryService';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { InventoryList } from './InventoryList';
import './Inventory.css';
import { Modal } from './Modal';
import { useAuth } from '../contexts/AuthContext';

export const Inventory = ({ onBack }) => {
    const { user } = useAuth();
    const userId = user?.id;
    const [items, setItems] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [deletedSnapshots, setDeletedSnapshots] = useState([]);
    const [csvData, setCsvData] = useState([]); // Master data from CSV
    const [ingredientMasterMap, setIngredientMasterMap] = useState(new Map()); // unit_conversions (材料マスター)
    const [ignoredNames, setIgnoredNames] = useState(new Set()); // Ignored item names
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editingItem, setEditingItem] = useState(null); // null = create

    // Snapshot / Complete Modal State
    const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
    const [snapshotTitle, setSnapshotTitle] = useState('');
    const [resetAfterSnapshot, setResetAfterSnapshot] = useState(true); // true = reset qty to 0, false = keep as-is

    // Snapshot History Modal State
    const [snapshotHistoryModalOpen, setSnapshotHistoryModalOpen] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState(null);
    const [snapshotHistoryTab, setSnapshotHistoryTab] = useState('history'); // 'history' | 'trash'
    const [snapshotConfirm, setSnapshotConfirm] = useState(null); // { title, message, onConfirm }
    const [snapshotConfirmInput, setSnapshotConfirmInput] = useState('');
    const [hideZeroSnapshotItems, setHideZeroSnapshotItems] = useState(true);
    const [snapshotDetailSort, setSnapshotDetailSort] = useState({ key: 'name', direction: 'asc' });

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [excludedNames, setExcludedNames] = useState(new Set()); // only hide in current inventory check UI

    // Reset Modal State
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [resetInput, setResetInput] = useState('');

    // Completion Success Modal State
    const [completeSuccessModalOpen, setCompleteSuccessModalOpen] = useState(false);

    // Generic Notification State (for replacing alerts)
    const [notification, setNotification] = useState(null); // { title, message, type }

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

    const SummarySortableRow = ({ row }) => {
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
            <tr ref={setNodeRef} style={style} {...attributes}>
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
                <td>{row.vendor}</td>
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
            const [inventoryData, csvList, ignored, snapshotList, deletedList, conversions] = await Promise.all([
                inventoryService.getAll(userId),
                purchasePriceService.getPriceListArray(),
                inventoryService.getIgnoredItems(userId),
                inventoryService.getSnapshots(userId),
                inventoryService.getDeletedSnapshots(userId),
                unitConversionService.getAllConversions()
            ]);
            setItems(inventoryData);
            setCsvData(csvList);
            setIgnoredNames(ignored);
            setSnapshots(snapshotList || []);
            setDeletedSnapshots(deletedList || []);
            setIngredientMasterMap(conversions || new Map());

            // Initialize checkedItems with IDs of all existing inventory items
            // This ensures the count in "棚卸し一覧 ({checkedItems.size})" is correct after reload
            const existingIds = new Set(inventoryData.map(item => item.id));
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

    const getTaxMultiplier = (item) => (isTax10(item?.tax10) ? 1.1 : 1.08);

    const toMonthKey = (date) => {
        if (!date) return '';
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

    const summaryVendorTotalsBase = React.useMemo(() => {
        const map = new Map();
        const list = getSnapshotItemsArray(summarySnapshot);
        list.forEach((it) => {
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
    }, [summarySnapshot, isHiddenVendor, getTaxMultiplier]);

    const summaryVendorTotalsMap = React.useMemo(() => {
        const map = new Map();
        summaryVendorTotalsBase.forEach((row) => {
            map.set(row.vendor, row);
        });
        return map;
    }, [summaryVendorTotalsBase]);

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

    const handleMoveSnapshotToTrash = (snapshot) => {
        if (!snapshot?.id) return;
        if (!userId) return;
        setSnapshotConfirmInput('');
        setSnapshotConfirm({
            title: '削除の確認',
            message: `「${snapshot.title || '棚卸し'}」をゴミ箱に移動しますか？\n（ゴミ箱から復元できます）`,
            onConfirm: async () => {
                try {
                    await inventoryService.deleteSnapshotToTrash(userId, snapshot.id);
                    await loadData(true);
                    setNotification({ title: '完了', message: 'ゴミ箱に移動しました', type: 'success' });
                } catch (e) {
                    console.error(e);
                    setNotification({ title: 'エラー', message: '削除(ゴミ箱移動)に失敗しました', type: 'error' });
                } finally {
                    setSnapshotConfirm(null);
                }
            }
        });
    };

    const handleRestoreSnapshot = (deletedRow) => {
        if (!deletedRow?.id) return;
        if (!userId) return;
        setSnapshotConfirmInput('');
        setSnapshotConfirm({
            title: '復元の確認',
            message: `「${deletedRow.title || '棚卸し'}」を履歴に復元しますか？`,
            onConfirm: async () => {
                try {
                    await inventoryService.restoreSnapshotFromTrash(userId, deletedRow.id);
                    await loadData(true);
                    setNotification({ title: '完了', message: '復元しました', type: 'success' });
                } catch (e) {
                    console.error(e);
                    setNotification({ title: 'エラー', message: '復元に失敗しました', type: 'error' });
                } finally {
                    setSnapshotConfirm(null);
                }
            }
        });
    };

    const handleHardDeleteSnapshot = (deletedRow) => {
        if (!deletedRow?.id) return;
        if (!userId) return;
        setSnapshotConfirmInput('');
        setSnapshotConfirm({
            title: '⚠️ 完全削除の確認',
            message: `「${deletedRow.title || '棚卸し'}」を完全に削除しますか？\nこの操作は取り消せません。\n\n確認のため delete と入力してください。`,
            requireText: 'delete',
            onConfirm: async () => {
                try {
                    await inventoryService.hardDeleteSnapshotFromTrash(userId, deletedRow.id);
                    await loadData(true);
                    setNotification({ title: '完了', message: '完全に削除しました', type: 'success' });
                } catch (e) {
                    console.error(e);
                    setNotification({ title: 'エラー', message: '完全削除に失敗しました', type: 'error' });
                } finally {
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

    // Merge Inventory and CSV Data
    const mergedComponents = React.useMemo(() => {
        const normalize = (str) => str ? str.toString().trim() : '';
        const masterByName = new Map();
        try {
            for (const [name, row] of (ingredientMasterMap || new Map()).entries()) {
                masterByName.set(normalize(name), row);
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
            const normalizedName = normalize(base?.name);
            const m = normalizedName ? masterByName.get(normalizedName) : null;
            if (!m) return base;
            const next = { ...base };

            // 材料マスター（unit_conversions）の入力を優先
            // - price: must be per-unit (matching next.unit) to avoid huge totals
            // - unit/quantity: when inventory uses count-like units (本/袋/個...) but master is g/ml etc,
            //   normalize to master unit and convert quantity using packetSize (e.g., 1本 -> 500ml).
            const masterUnit = m.packetUnit || '';
            const packetSize = parseFloat(m.packetSize);

            if (next.isPhantom) {
                if (masterUnit) next.unit = masterUnit;
                const p = masterUnitPriceFor(m, next.unit || masterUnit);
                if (p !== null) next.price = p;
            } else {
                // If existing inventory row is in count-unit and master provides measurable unit,
                // convert quantity/threshold to master unit so calculations stay correct.
                const shouldConvertToMasterUnit =
                    !!masterUnit &&
                    Number.isFinite(packetSize) &&
                    packetSize > 0 &&
                    (isCountUnit(next.unit) || !next.unit);

                if (shouldConvertToMasterUnit) {
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
                    // Keep unit unless blank
                    if (!next.unit && masterUnit) next.unit = masterUnit;
                }

                const p = masterUnitPriceFor(m, next.unit || masterUnit);
                if (p !== null) next.price = p;
            }

            // Keep extra master info for future UI if needed
            next._master = {
                packetSize: m.packetSize,
                packetUnit: m.packetUnit,
                lastPrice: m.lastPrice,
                updatedAt: m.updatedAt
            };
            return next;
        };

        const effectiveItems = items.map(applyMasterPriority);
        const inventoryMap = new Map(effectiveItems.map(i => [normalize(i.name), i]));
        const merged = [...effectiveItems];

        csvData.forEach((csvItem, index) => {
            const normalizedName = normalize(csvItem.name);
            if (ignoredNames.has(csvItem.name) || ignoredNames.has(normalizedName)) return;

            if (!inventoryMap.has(normalizedName)) {
                const base = {
                    id: `phantom-${index}`,
                    isPhantom: true,
                    name: csvItem.name.trim(),
                    quantity: '',
                    unit: csvItem.unit || '',
                    category: '',
                    price: csvItem.price,
                    vendor: csvItem.vendor,
                    threshold: 0,
                    tax10: false
                };
                merged.push(applyMasterPriority(base));
            }
        });
        return merged.filter(i => {
            const name = normalize(i.name);
            if (ignoredNames.has(i.name) || ignoredNames.has(name)) return false;
            if (excludedNames.has(i.name) || excludedNames.has(name)) return false;
            if (isHiddenVendor(i.vendor)) return false;
            return true;
        });
    }, [items, csvData, ignoredNames, excludedNames, ingredientMasterMap, isHiddenVendor]);

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
                const normalize = (str) => str ? str.toString().trim() : '';
                const m = (ingredientMasterMap && ingredientMasterMap.get(normalize(item?.name))) || null;
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
                    isNewFromCsv: true
                });
                setIsEditing(true);
            }
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!userId) return;
        const formData = new FormData(e.target);
        const newItem = {
            name: formData.get('name'),
            quantity: parseFloat(formData.get('quantity')),
            unit: formData.get('unit'),
            category: formData.get('category'),
            threshold: parseFloat(formData.get('threshold')),
            vendor: editingItem.vendor || '',
            price: editingItem.price || 0
        };

        try {
            if (editingItem.id && !editingItem.isPhantom) {
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
                    tax10
                };
                await inventoryService.add(userId, newItem);
                await loadData(true);
            } else {
                setItems(prev => prev.map(i => (i.id === item.id ? { ...i, tax10 } : i)));
                await inventoryService.update(userId, { ...item, tax10 });
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

    const handleCompleteInventory = async () => {
        if (!snapshotTitle) return;
        if (!userId) return;
        try {
            // Use the same normalized view that the user sees (master overrides applied),
            // and strip UI-only fields before saving to DB snapshots.
            const snapshotItems = mergedComponents
                .filter(i => !i.isPhantom)
                .map(({ isPhantom, _master, ...rest }) => rest);

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

    const handleBulkTax = async (tax10) => {
        try {
            if (!userId) return;
            const targets = filteredItems;
            if (!targets.length) return;

            const toCreate = targets.filter(item => item.isPhantom);
            const toUpdate = targets.filter(item => !item.isPhantom);

            if (toUpdate.length) {
                setItems(prev => prev.map(i => {
                    const match = toUpdate.find(t => t.id === i.id);
                    return match ? { ...i, tax10 } : i;
                }));
                await Promise.allSettled(
                    toUpdate.map(item => inventoryService.update(userId, { ...item, tax10 }))
                );
            }

            if (toCreate.length) {
                await Promise.allSettled(
                    toCreate.map(item => inventoryService.add(userId, {
                        name: item.name.trim(),
                        quantity: item.quantity === '' ? 0 : (parseFloat(item.quantity) || 0),
                        unit: item.unit,
                        category: item.category || '',
                        price: item.price,
                        vendor: item.vendor,
                        threshold: 0,
                        tax10
                    }))
                );
            }

            if (toCreate.length) {
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
            setNotification({ title: 'エラー', message: `税率の一括更新に失敗しました\n${msg}`, type: 'error' });
            loadData();
        }
    };

    if (isEditing) {
        return (
            <div className="inventory-edit-container fade-in">
                <div className="container-header">
                    <h2 className="section-title">{editingItem && !editingItem.isNewFromCsv ? '在庫編集' : '新規在庫登録'}</h2>
                </div>
                <Card className="edit-form-card">
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label>材料名</label>
                            <Input name="name" defaultValue={editingItem?.name} required placeholder="例: 薄力粉" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>現在庫数</label>
                                <Input name="quantity" type="number" step="0.01" defaultValue={editingItem?.quantity} required />
                            </div>
                            <div className="form-group">
                                <label>単位</label>
                                <Input name="unit" defaultValue={editingItem?.unit || 'g'} required placeholder="g, ml, 個..." />
                            </div>
                        </div>
                        <div className="form-row">
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
                    <h2 className="section-title">📦 在庫管理 (一括登録対応)</h2>
                    <div className="header-actions inventory-header-actions">
                        <Button variant="ghost" onClick={onBack}>← メニュー</Button>
                        <Button
                            variant="danger"
                            className="inventory-header-actions__btn inventory-header-actions__btn--compact"
                            onClick={() => {
                                setResetInput('');
                                setResetModalOpen(true);
                            }}
                        >
                            🗑️ データリセット
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
                            onClick={() => { setEditingItem(null); setIsEditing(true); }}
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
                                    <>
                                        <button
                                            className="inventory-controls__btn"
                                            onClick={() => handleBulkTax(true)}
                                            title="表示中の品目を10%に一括設定"
                                        >
                                            10%一括
                                        </button>
                                        <button
                                            className="inventory-controls__btn"
                                            onClick={() => handleBulkTax(false)}
                                            title="表示中の品目を8%に一括設定"
                                        >
                                            8%一括
                                        </button>
                                    </>
                                )}

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
                                                この月は棚卸しが {summarySnapshots.length} 件あります。最新のみ集計しています。
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
                                                    {summaryVendorTotals.map((row) => (
                                                        <SummarySortableRow key={row.vendor} row={row} />
                                                    ))}
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
                                onEdit={(item) => { setEditingItem(item); setIsEditing(true); }}
                                onDelete={handleDelete}
                                onUpdateQuantity={handleUpdateQuantity}
                                onToggleTax={handleToggleTax}
                            />
                        )}
                    </div>
                </div>

                {/* Snapshot Confirmation Modal */}
                <Modal
                    isOpen={snapshotModalOpen}
                    onClose={() => setSnapshotModalOpen(false)}
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
                                onClick={() => setSnapshotModalOpen(false)}
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
                                onClick={handleCompleteInventory}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#2ecc71',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold'
                                }}
                            >
                                {resetAfterSnapshot ? '確定してリセット' : '確定して保存'}
                            </button>
                        </div>
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
                                                                disabled={itemCount === 0}
                                                                title={itemCount === 0 ? 'items が空のためCSV出力できません' : 'この棚卸しをCSVでダウンロード'}
                                                            >
                                                                📥 CSV
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => setSelectedSnapshot(s)}
                                                            >
                                                                詳細
                                                            </Button>
                                                            <Button
                                                                variant="danger"
                                                                size="sm"
                                                                onClick={() => handleMoveSnapshotToTrash(s)}
                                                                title="ゴミ箱に移動"
                                                            >
                                                                削除
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => downloadSnapshotCsv(s)}
                                                                disabled={itemCount === 0}
                                                            >
                                                                📥 CSV
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => setSelectedSnapshot(s)}
                                                            >
                                                                詳細
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => handleRestoreSnapshot(s)}
                                                                title="履歴に復元"
                                                            >
                                                                復元
                                                            </Button>
                                                            <Button
                                                                variant="danger"
                                                                size="sm"
                                                                onClick={() => handleHardDeleteSnapshot(s)}
                                                                title="ゴミ箱から完全削除"
                                                            >
                                                                完全削除
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
                    onClose={() => setSnapshotConfirm(null)}
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
                            <Button variant="ghost" onClick={() => setSnapshotConfirm(null)}>キャンセル</Button>
                            <Button
                                variant="danger"
                                disabled={!!snapshotConfirm?.requireText && snapshotConfirmInput !== snapshotConfirm.requireText}
                                onClick={() => snapshotConfirm?.onConfirm && snapshotConfirm.onConfirm()}
                            >
                                実行
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
                                                    return (
                                                        <tr key={it?.id || `${it?.name || 'item'}-${idx}`} style={{ borderBottom: '1px solid #eee' }}>
                                                            <td style={{ padding: '10px' }}>
                                                                {it?.name || '-'}
                                                                {isTax10(it?.tax10) && (
                                                                    <span className="snapshot-tax-badge" title="10%対象">10%</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '10px', textAlign: 'right' }}>{price ? `¥${Math.round(price).toLocaleString()}` : '-'}</td>
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

                {/* Reset Confirmation Modal */}
                <Modal
                    isOpen={resetModalOpen}
                    onClose={() => setResetModalOpen(false)}
                    title="⚠️ データリセットの確認"
                    size="small"
                >
                    <div style={{ color: '#333' }}>
                        <p style={{ fontSize: '1rem', marginBottom: '1rem', lineHeight: '1.6', color: '#d32f2f', fontWeight: 'bold' }}>
                            本当にすべての在庫データを削除しますか？
                        </p>
                        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                            この操作は取り消せません。<br />
                            CSV由来の入力データも含め、すべての在庫数がリセットされます。<br />
                            <span style={{ fontSize: '0.8rem' }}>（※マスタデータ設定や除外設定は残ります）</span>
                        </p>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                確認のため <span style={{ fontFamily: 'monospace', background: '#eee', padding: '2px 4px' }}>delete</span> と入力してください
                            </label>
                            <input
                                type="text"
                                value={resetInput}
                                onChange={(e) => setResetInput(e.target.value)}
                                placeholder="delete"
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
                                onClick={() => setResetModalOpen(false)}
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
                                onClick={async () => {
                                    if (resetInput !== 'delete') return;
                                    try {
                                        if (!userId) return;
                                        await inventoryService.clearAll(userId);
                                        loadData();
                                        setCheckedItems(new Set());
                                        setResetModalOpen(false);
                                        setNotification({ title: '完了', message: 'リセットしました', type: 'success' });
                                    } catch (e) {
                                        console.error(e);
                                        setNotification({ title: 'エラー', message: 'リセットに失敗しました', type: 'error' });
                                    }
                                }}
                                disabled={resetInput !== 'delete'}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: resetInput === 'delete' ? '#d32f2f' : '#ccc',
                                    color: 'white',
                                    cursor: resetInput === 'delete' ? 'pointer' : 'not-allowed',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    transition: 'background 0.2s'
                                }}
                            >
                                全削除を実行
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
