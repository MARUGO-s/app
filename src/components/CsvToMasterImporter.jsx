
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { useToast } from '../contexts/useToast';

const ALL_VENDORS_KEY = '__all_vendors__';
const UNKNOWN_VENDOR_KEY = '__unknown_vendor__';
const ALL_CATEGORIES_KEY = '__all_categories__';
const DEFAULT_ITEM_CATEGORY = 'food';
const ITEM_CATEGORY_OPTIONS = [
    { value: 'food', label: '食材' },
    { value: 'alcohol', label: 'アルコール' },
    { value: 'soft_drink', label: 'ソフトドリンク' },
    { value: 'supplies', label: '備品' },
];
const ITEM_CATEGORY_LABELS = ITEM_CATEGORY_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
}, {});
const COUNTABLE_UNITS = new Set(['個', '本', '枚', '袋', 'PC', '箱', '缶', '包']);

const toOptionalNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeVendorKey = (vendor) => {
    const value = typeof vendor === 'string' ? vendor.trim() : '';
    return value || UNKNOWN_VENDOR_KEY;
};

const normalizeItemCategory = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return DEFAULT_ITEM_CATEGORY;
    if (normalized === 'food_alcohol') return DEFAULT_ITEM_CATEGORY;
    return ITEM_CATEGORY_LABELS[normalized] ? normalized : DEFAULT_ITEM_CATEGORY;
};

const CsvToMasterImporter = () => {
    const [mergedData, setMergedData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // id of item being saved (or 'bulk' for bulk save)
    // Bulk progress modal state:
    // null = closed
    // { phase: 'running'|'done'|'error', total, processed, success, failed, currentName, failedNames, errorMessage? }
    const [bulkProgress, setBulkProgress] = useState(null);
    const [filter, setFilter] = useState('all'); // all, unregistered, registered
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' }); // key: name,csvPrice,inputCategory,inputSize,inputUnit,inputPrice
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_KEY);
    const [selectedVendor, setSelectedVendor] = useState(ALL_VENDORS_KEY);
    const [isVendorMenuOpen, setIsVendorMenuOpen] = useState(false);
    const [error, setError] = useState(null); // Critical error state
    const vendorMenuRef = useRef(null);

    // Toast
    const toast = useToast();

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null
    });

    const closeBulkProgressModal = () => {
        setBulkProgress((prev) => {
            if (!prev) return prev;
            if (prev.phase === 'running') return prev;
            return null;
        });
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log("Starting data load for CsvToMasterImporter...");

            // Fetch data
            const [csvData, masterDataMap] = await Promise.all([
                purchasePriceService.getPriceListArray().catch(e => {
                    console.error("Error fetching price list:", e);
                    return [];
                }),
                unitConversionService.getAllConversions().catch(e => {
                    console.error("Error fetching conversions:", e);
                    return new Map();
                })
            ]);

            console.log("Data fetched:", { csvCount: csvData?.length, masterSize: masterDataMap?.size });

            // Validate data types
            if (!Array.isArray(csvData)) {
                throw new Error("CSVデータの形式が不正です（配列ではありません）");
            }
            if (!(masterDataMap instanceof Map)) {
                throw new Error("マスターデータの形式が不正です（Mapではありません）");
            }

            // Merge data based on CSV
            const uniqueCsvItems = [];

            for (const item of csvData) {
                if (!item || !item.name) continue;

                // masterDataMap keys are ingredient_name
                const masterItem = masterDataMap.get(item.name);
                const baseCategory = normalizeItemCategory(masterItem?.itemCategory);
                const masterSizeValue = masterItem?.packetSize ?? '';
                const masterUnitValue = masterItem?.packetUnit || item.unit || '';
                const masterPriceValue = masterItem?.lastPrice ?? '';
                const suggestedSize = masterItem
                    ? masterSizeValue
                    : (COUNTABLE_UNITS.has(masterUnitValue) ? 1 : '');

                uniqueCsvItems.push({
                    name: item.name,
                    csvPrice: item.price,
                    csvUnit: item.unit,
                    csvVendor: item.vendor,
                    masterCategory: baseCategory,

                    // Master data (if exists)
                    masterSize: masterSizeValue,
                    masterUnit: masterUnitValue,
                    masterPrice: masterPriceValue,

                    isRegistered: !!masterItem,

                    // Form state
                    inputSize: suggestedSize,
                    inputUnit: masterUnitValue,
                    inputPrice: masterItem ? masterPriceValue : (item.price ?? ''),
                    inputCategory: baseCategory,

                    // Modification tracking
                    isModified: false
                });
            }

            console.log("Merge completed. Items:", uniqueCsvItems.length);
            setMergedData(uniqueCsvItems);

        } catch (error) {
            console.error("Failed to load data for importer:", error);
            setError(error.message || "予期せぬエラーが発生しました");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (item) => {
        setSaving(item.name);
        try {
            const size = toOptionalNumber(item.inputSize);
            const price = toOptionalNumber(item.inputPrice);

            if (size === null || size <= 0) {
                toast.error("容量には正しい数値を入力してください。");
                return;
            }
            if (!item.inputUnit) {
                toast.error("単位を入力してください。");
                return;
            }
            if (!item.inputCategory) {
                toast.error("区分を選択してください。");
                return;
            }

            // Save to master
            await unitConversionService.saveConversion(
                item.name,
                size,
                item.inputUnit,
                price,
                item.inputCategory
            );

            // Refresh local state to show "Registered" and reset modification flag
            setMergedData(prev => prev.map(d => {
                if (d.name === item.name) {
                    return {
                        ...d,
                        isRegistered: true,
                        isModified: false, // Reset modification flag on save
                        masterSize: size,
                        masterUnit: item.inputUnit,
                        masterPrice: price ?? '',
                        masterCategory: item.inputCategory,
                        inputCategory: item.inputCategory
                    };
                }
                return d;
            }));

            toast.success("登録しました");

        } catch (error) {
            console.error("Failed to save ingredient:", error);
            toast.error("保存に失敗しました。");
        } finally {
            setSaving(null);
        }
    };

    const executeBulkSave = async (modifiedItems) => {
        setConfirmModal(prev => ({ ...prev, isOpen: false })); // Close modal first

        try {
            const invalidItems = modifiedItems.filter((item) => {
                const size = toOptionalNumber(item.inputSize);
                const hasValidSize = size !== null && size > 0;
                return !hasValidSize || !item.inputUnit || !item.inputCategory;
            });

            if (invalidItems.length > 0) {
                const names = invalidItems.slice(0, 5).map(i => i.name).join('、');
                const suffix = invalidItems.length > 5 ? ` ほか${invalidItems.length - 5}件` : '';
                toast.error(`未入力があります（容量・単位・区分）: ${names}${suffix}`);
                return;
            }

            setSaving('bulk');

            const total = modifiedItems.length;
            setBulkProgress({
                phase: 'running',
                total,
                processed: 0,
                success: 0,
                failed: 0,
                currentName: '',
                failedNames: []
            });

            // Concurrency-limited bulk save (avoid firing huge amounts of requests at once).
            const CONCURRENCY = 5;
            const UI_THROTTLE_MS = 120;

            let processed = 0;
            let successCount = 0;
            let failCount = 0;
            let lastUiUpdateAt = 0;

            const successItems = [];
            const failedNames = [];

            const updateUi = (force = false, currentName = '') => {
                const now = Date.now();
                if (!force && now - lastUiUpdateAt < UI_THROTTLE_MS) return;
                lastUiUpdateAt = now;

                setBulkProgress((prev) => {
                    if (!prev) return prev;
                    if (prev.phase !== 'running') return prev;
                    return {
                        ...prev,
                        processed,
                        success: successCount,
                        failed: failCount,
                        currentName: currentName || prev.currentName
                    };
                });
            };

            let nextIndex = 0;
            const worker = async () => {
                while (true) {
                    const idx = nextIndex++;
                    if (idx >= modifiedItems.length) return;

                    const item = modifiedItems[idx];
                    const name = item?.name ? String(item.name) : '';

                    try {
                        const size = toOptionalNumber(item.inputSize);
                        const price = toOptionalNumber(item.inputPrice);

                        // Basic validation (guard; already checked above).
                        if (size === null || size <= 0) throw new Error("Invalid size");
                        if (!item.inputUnit) throw new Error("Invalid unit");
                        if (!item.inputCategory) throw new Error("Invalid category");

                        await unitConversionService.saveConversion(
                            item.name,
                            size,
                            item.inputUnit,
                            price,
                            item.inputCategory
                        );

                        successCount++;
                        successItems.push(item);
                    } catch (err) {
                        failCount++;
                        failedNames.push(name || `#${idx + 1}`);
                        console.error(`Failed to save ${name}:`, err);
                    } finally {
                        processed++;
                        updateUi(false, name);
                    }
                }
            };

            const workerCount = Math.min(CONCURRENCY, modifiedItems.length);
            await Promise.all(Array.from({ length: workerCount }, () => worker()));
            updateUi(true);

            // Update local state for successful items
            const successNames = new Set(successItems.map(i => i.name));
            const updatedByName = new Map(modifiedItems.map(i => [i.name, i]));
            setMergedData(prev => prev.map(d => {
                if (successNames.has(d.name)) {
                    const updated = updatedByName.get(d.name);
                    return {
                        ...d,
                        isRegistered: true,
                        isModified: false, // Reset modification flag
                        masterSize: toOptionalNumber(updated.inputSize) ?? '',
                        masterUnit: updated.inputUnit,
                        masterPrice: toOptionalNumber(updated.inputPrice) ?? '',
                        masterCategory: updated.inputCategory,
                        inputCategory: updated.inputCategory
                    };
                }
                return d;
            }));

            if (failCount === 0) {
                toast.success(`${successCount} 件のデータを一括登録しました`);
            } else {
                toast.warning(`処理完了: 成功 ${successCount} 件 / 失敗 ${failCount} 件`);
            }

            setBulkProgress({
                phase: 'done',
                total,
                processed,
                success: successCount,
                failed: failCount,
                currentName: '',
                failedNames: failedNames.slice(0, 10)
            });
        } catch (err) {
            console.error("Bulk save error:", err);
            toast.error("一括保存中にエラーが発生しました");
            setBulkProgress((prev) => ({
                phase: 'error',
                total: prev?.total ?? modifiedItems.length,
                processed: prev?.processed ?? 0,
                success: prev?.success ?? 0,
                failed: prev?.failed ?? 0,
                currentName: '',
                failedNames: prev?.failedNames ?? [],
                errorMessage: err?.message ? String(err.message) : '不明なエラー'
            }));
        } finally {
            setSaving(null);
        }
    };

    const handleBulkSaveClick = () => {
        const modifiedItems = mergedData.filter(d => d.isModified);
        if (modifiedItems.length === 0) return;

        setConfirmModal({
            isOpen: true,
            title: '一括登録の確認',
            message: `${modifiedItems.length} 件の変更データを一括登録・更新しますか？`,
            onConfirm: () => executeBulkSave(modifiedItems)
        });
    };

    const handleInputChange = (name, field, value) => {
        setMergedData(prev => prev.map(d => {
            if (d.name === name) {
                return {
                    ...d,
                    [field]: value,
                    isModified: true // Mark as modified
                };
            }
            return d;
        }));
    };

    const preventNumberArrowChange = (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
        }
    };

    const handleSort = (key) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const sortMark = (key) => {
        if (sortConfig.key !== key) return '';
        return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    };

    const vendorTabs = useMemo(() => {
        const tabMap = new Map();

        mergedData.forEach((item) => {
            const key = normalizeVendorKey(item.csvVendor);
            const label = key === UNKNOWN_VENDOR_KEY ? '業者未設定' : key;
            const prev = tabMap.get(key);
            if (prev) {
                prev.count += 1;
            } else {
                tabMap.set(key, { key, label, count: 1 });
            }
        });

        const tabs = Array.from(tabMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
        return [{ key: ALL_VENDORS_KEY, label: '全業者', count: mergedData.length }, ...tabs];
    }, [mergedData]);

    useEffect(() => {
        const isSelectedVendorAvailable = vendorTabs.some(tab => tab.key === selectedVendor);
        if (!isSelectedVendorAvailable) {
            setSelectedVendor(ALL_VENDORS_KEY);
        }
    }, [vendorTabs, selectedVendor]);

    useEffect(() => {
        if (!isVendorMenuOpen) return undefined;

        const handlePointerDown = (event) => {
            if (vendorMenuRef.current && !vendorMenuRef.current.contains(event.target)) {
                setIsVendorMenuOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsVendorMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('touchstart', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isVendorMenuOpen]);

    const vendorScopedData = useMemo(() => {
        if (selectedVendor === ALL_VENDORS_KEY) return mergedData;
        return mergedData.filter(item => normalizeVendorKey(item.csvVendor) === selectedVendor);
    }, [mergedData, selectedVendor]);

    const categoryCounts = useMemo(() => {
        const counts = {
            [ALL_CATEGORIES_KEY]: vendorScopedData.length
        };
        ITEM_CATEGORY_OPTIONS.forEach(option => {
            counts[option.value] = 0;
        });
        vendorScopedData.forEach(item => {
            const key = normalizeItemCategory(item.inputCategory);
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }, [vendorScopedData]);

    const categoryScopedData = useMemo(() => {
        if (categoryFilter === ALL_CATEGORIES_KEY) return vendorScopedData;
        return vendorScopedData.filter(item => normalizeItemCategory(item.inputCategory) === categoryFilter);
    }, [vendorScopedData, categoryFilter]);

    const statusCounts = useMemo(() => ({
        all: categoryScopedData.length,
        unregistered: categoryScopedData.filter(d => !d.isRegistered).length,
        registered: categoryScopedData.filter(d => d.isRegistered).length
    }), [categoryScopedData]);

    const selectedVendorTab = useMemo(
        () => vendorTabs.find(tab => tab.key === selectedVendor) || vendorTabs[0],
        [vendorTabs, selectedVendor]
    );

    const filteredData = useMemo(() => categoryScopedData.filter(item => {
        // Filter by status
        if (filter === 'unregistered' && item.isRegistered) return false;
        if (filter === 'registered' && !item.isRegistered) return false;

        // Filter by search term
        if (searchTerm && !item.name.includes(searchTerm)) return false;

        return true;
    }), [categoryScopedData, filter, searchTerm]);

    const sortedData = useMemo(() => {
        if (!sortConfig.key) return filteredData;

        const getString = (value) => String(value ?? '');
        const getNumber = (value) => {
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
        };

        const data = [...filteredData];
        data.sort((a, b) => {
            let cmp = 0;
            switch (sortConfig.key) {
                case 'name':
                    cmp = getString(a.name).localeCompare(getString(b.name), 'ja');
                    break;
                case 'csvPrice':
                    cmp = getNumber(a.csvPrice) - getNumber(b.csvPrice);
                    break;
                case 'inputCategory': {
                    const aLabel = ITEM_CATEGORY_LABELS[normalizeItemCategory(a.inputCategory)] || '';
                    const bLabel = ITEM_CATEGORY_LABELS[normalizeItemCategory(b.inputCategory)] || '';
                    cmp = aLabel.localeCompare(bLabel, 'ja');
                    break;
                }
                case 'inputSize':
                    cmp = getNumber(a.inputSize) - getNumber(b.inputSize);
                    break;
                case 'inputUnit':
                    cmp = getString(a.inputUnit).localeCompare(getString(b.inputUnit), 'ja');
                    break;
                case 'inputPrice':
                    cmp = getNumber(a.inputPrice) - getNumber(b.inputPrice);
                    break;
                default:
                    cmp = 0;
                    break;
            }

            if (cmp === 0) {
                cmp = getString(a.name).localeCompare(getString(b.name), 'ja');
            }
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
        return data;
    }, [filteredData, sortConfig]);

    const modifiedCount = mergedData.filter(d => d.isModified).length;

    if (loading) return (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#666', padding: '2rem' }}>
            読み込み中...
        </div>
    );

    if (error) return (
        <div style={{ padding: '2rem', color: '#c62828', background: '#ffebee', borderRadius: '4px' }}>
            <h3>エラーが発生しました</h3>
            <p>{error}</p>
            <Button variant="secondary" onClick={loadData}>再試行</Button>
        </div>
    );

    return (
        <div className="csv-importer">

            <div className="importer-header">
                <Input
                    placeholder="材料名で検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ maxWidth: '300px' }}
                />

                <div className="filter-buttons">
                    <Button
                        variant={filter === 'all' ? 'primary' : 'secondary'}
                        onClick={() => setFilter('all')}
                        size="sm"
                        style={{ marginRight: '0.5rem' }}
                    >
                        全て ({statusCounts.all})
                    </Button>
                    <Button
                        variant={filter === 'unregistered' ? 'primary' : 'secondary'}
                        onClick={() => setFilter('unregistered')}
                        size="sm"
                        style={{ marginRight: '0.5rem' }}
                    >
                        未登録 ({statusCounts.unregistered})
                    </Button>
                    <Button
                        variant={filter === 'registered' ? 'primary' : 'secondary'}
                        onClick={() => setFilter('registered')}
                        size="sm"
                    >
                        登録済 ({statusCounts.registered})
                    </Button>
                </div>

                <div className="vendor-dropdown" ref={vendorMenuRef}>
                    <button
                        type="button"
                        className="vendor-dropdown-trigger"
                        onClick={() => setIsVendorMenuOpen(prev => !prev)}
                        aria-haspopup="listbox"
                        aria-expanded={isVendorMenuOpen}
                    >
                        <span>業者: {selectedVendorTab?.label} ({selectedVendorTab?.count ?? 0})</span>
                        <span className={`vendor-dropdown-chevron ${isVendorMenuOpen ? 'open' : ''}`}>▼</span>
                    </button>

                    {isVendorMenuOpen && (
                        <div className="vendor-dropdown-menu" role="listbox" aria-label="業者で絞り込み">
                            {vendorTabs.map(tab => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className={`vendor-tab ${selectedVendor === tab.key ? 'active' : ''}`}
                                    onClick={() => {
                                        setSelectedVendor(tab.key);
                                        setIsVendorMenuOpen(false);
                                    }}
                                    role="option"
                                    aria-selected={selectedVendor === tab.key}
                                >
                                    {tab.label} ({tab.count})
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="category-filter-row">
                    <label htmlFor="csv-item-category-filter" className="category-filter-label">区分:</label>
                    <select
                        id="csv-item-category-filter"
                        className="input-field category-filter-select"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value={ALL_CATEGORIES_KEY}>全て ({categoryCounts[ALL_CATEGORIES_KEY] || 0})</option>
                        {ITEM_CATEGORY_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label} ({categoryCounts[option.value] || 0})
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    {modifiedCount > 0 && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleBulkSaveClick}
                            disabled={saving !== null}
                            style={{ fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                        >
                            {saving === 'bulk' ? '処理中...' : `変更を一括登録(${modifiedCount})`}
                        </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={loadData}>↻ 最新データ取得</Button>
                </div>
            </div>

            <div className="table-wrapper" style={{ overflowX: 'auto', flex: 1 }}>
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th style={{ width: '22%' }} onClick={() => handleSort('name')}>材料名 (CSV){sortMark('name')}</th>
                            <th style={{ width: '14%' }} onClick={() => handleSort('csvPrice')}>参考価格 (CSV){sortMark('csvPrice')}</th>
                            <th style={{ width: '14%' }} onClick={() => handleSort('inputCategory')}>区分 <span style={{ color: 'red' }}>*</span>{sortMark('inputCategory')}</th>
                            <th style={{ width: '18%' }} onClick={() => handleSort('inputSize')}>容量 (登録値) <span style={{ color: 'red' }}>*</span>{sortMark('inputSize')}</th>
                            <th style={{ width: '13%' }} onClick={() => handleSort('inputUnit')}>単位 (登録値) <span style={{ color: 'red' }}>*</span>{sortMark('inputUnit')}</th>
                            <th style={{ width: '12%' }} onClick={() => handleSort('inputPrice')}>価格 (登録値){sortMark('inputPrice')}</th>
                            <th style={{ width: '7%' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="no-data">データが見つかりません</td>
                            </tr>
                        ) : (
                            sortedData.map((item) => (
                                <tr key={item.name} style={{
                                    backgroundColor: item.isModified ? '#fff8e1' : (item.isRegistered ? '#f9fff9' : 'inherit'),
                                    transition: 'background-color 0.3s'
                                }}>
                                    <td style={{ fontWeight: '500' }}>
                                        {item.name}
                                        {item.csvVendor && <div style={{ fontSize: '0.75rem', color: '#888' }}>{item.csvVendor}</div>}
                                    </td>
                                    <td>
                                        {item.csvPrice ? `¥${item.csvPrice.toLocaleString()} ` : '-'}
                                        {item.csvUnit && <span style={{ fontSize: '0.8rem', color: '#888' }}> / {item.csvUnit}</span>}
                                    </td>
                                    <td>
                                        <select
                                            className="input-field"
                                            value={normalizeItemCategory(item.inputCategory)}
                                            onChange={(e) => handleInputChange(item.name, 'inputCategory', e.target.value)}
                                            style={{ width: '100%', padding: '8px', cursor: 'pointer' }}
                                        >
                                            {ITEM_CATEGORY_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <Input
                                            type="number"
                                            value={item.inputSize}
                                            onChange={(e) => handleInputChange(item.name, 'inputSize', e.target.value)}
                                            onKeyDown={preventNumberArrowChange}
                                            placeholder={['個', '本', '枚', 'PC', '箱', '缶', '包'].includes(item.inputUnit) ? '数量 (例: 1)' : '例: 1000'}
                                            style={{ width: '100%' }}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="input-field"
                                            value={item.inputUnit}
                                            onChange={(e) => handleInputChange(item.name, 'inputUnit', e.target.value)}
                                            style={{ width: '100%', padding: '8px', cursor: 'pointer' }}
                                        >
                                            {/* If current unit is not in list, show it as an option to preserve data */}
                                            {!['g', 'kg', 'ml', 'L', 'cc', '個', '本', '枚', '袋', 'PC', '箱', '缶', '包'].includes(item.inputUnit) && item.inputUnit && (
                                                <option value={item.inputUnit}>{item.inputUnit} (CSVの値)</option>
                                            )}
                                            <option value="">単位を選択</option>
                                            <option value="g">g</option>
                                            <option value="kg">kg</option>
                                            <option value="ml">ml</option>
                                            <option value="L">L</option>
                                            <option value="cc">cc</option>
                                            <option value="個">個</option>
                                            <option value="本">本</option>
                                            <option value="枚">枚</option>
                                            <option value="袋">袋</option>
                                            <option value="PC">PC</option>
                                            <option value="箱">箱</option>
                                            <option value="缶">缶</option>
                                            <option value="包">包</option>
                                        </select>
                                    </td>
                                    <td>
                                        <Input
                                            type="number"
                                            value={item.inputPrice}
                                            onChange={(e) => handleInputChange(item.name, 'inputPrice', e.target.value)}
                                            placeholder="価格"
                                            style={{ width: '100%' }}
                                        />
                                    </td>
                                    <td>
                                        <Button
                                            variant={item.isRegistered ? "secondary" : "primary"}
                                            size="sm"
                                            onClick={() => handleSave(item)}
                                            disabled={saving === item.name || saving === 'bulk'}
                                            block
                                        >
                                            {saving === item.name ? '...' : (item.isRegistered ? '更新' : '登録')}
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#666' }}>
                <p>※ CSVデータに存在していても、単位や容量などの情報が不足しているため、ここで補完して登録することで、レシピ作成時に自動計算が可能になります。</p>
                <p>※ データを編集すると自動的に「変更を一括登録」ボタンの対象になります。</p>
            </div>

            <Modal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                title={confirmModal.title}
                size="small"
            >
                <div style={{ marginBottom: '1.5rem' }}>
                    {confirmModal.message}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <Button variant="secondary" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}>
                        キャンセル
                    </Button>
                    <Button variant="primary" onClick={confirmModal.onConfirm}>
                        実行する
                    </Button>
                </div>
            </Modal>

            <Modal
                isOpen={!!bulkProgress}
                onClose={closeBulkProgressModal}
                title={
                    bulkProgress?.phase === 'running'
                        ? '一括登録中'
                        : bulkProgress?.phase === 'error'
                            ? '一括登録エラー'
                            : '一括登録結果'
                }
                size="small"
                showCloseButton={bulkProgress?.phase !== 'running'}
            >
                {bulkProgress?.phase === 'running' ? (
                    <div className="bulk-progress">
                        <div className="bulk-progress-head">
                            <div className="bulk-progress-spinner" aria-hidden="true" />
                            <div>
                                <div className="bulk-progress-title">処理中です。しばらくお待ちください。</div>
                                <div className="bulk-progress-subtitle">
                                    {(bulkProgress.processed || 0).toLocaleString()} / {(bulkProgress.total || 0).toLocaleString()} 件
                                </div>
                            </div>
                        </div>

                        <div className="bulk-progress-bar" aria-label="進捗">
                            <div
                                className="bulk-progress-bar-inner"
                                style={{
                                    width: bulkProgress.total > 0
                                        ? `${Math.min(100, Math.round(((bulkProgress.processed || 0) / bulkProgress.total) * 100))}%`
                                        : '0%'
                                }}
                            />
                        </div>

                        <div className="bulk-progress-meta">
                            <div>成功: {(bulkProgress.success || 0).toLocaleString()} 件</div>
                            <div>失敗: {(bulkProgress.failed || 0).toLocaleString()} 件</div>
                            {bulkProgress.currentName && (
                                <div className="bulk-progress-current" title={bulkProgress.currentName}>
                                    現在: {bulkProgress.currentName}
                                </div>
                            )}
                        </div>
                    </div>
                ) : bulkProgress?.phase === 'error' ? (
                    <div className="bulk-progress">
                        <div style={{ color: '#991b1b', fontWeight: 700, marginBottom: '0.25rem' }}>
                            処理中にエラーが発生しました。
                        </div>
                        {bulkProgress.errorMessage && (
                            <div style={{ color: '#444', fontSize: '0.9rem' }}>
                                {bulkProgress.errorMessage}
                            </div>
                        )}
                        <div className="bulk-progress-meta" style={{ marginTop: '0.75rem' }}>
                            <div>完了: {(bulkProgress.processed || 0).toLocaleString()} / {(bulkProgress.total || 0).toLocaleString()} 件</div>
                            <div>成功: {(bulkProgress.success || 0).toLocaleString()} 件</div>
                            <div>失敗: {(bulkProgress.failed || 0).toLocaleString()} 件</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <Button variant="primary" onClick={closeBulkProgressModal}>閉じる</Button>
                        </div>
                    </div>
                ) : (
                    <div className="bulk-progress">
                        <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                            処理が完了しました。
                        </div>
                        <div className="bulk-progress-meta">
                            <div>合計: {(bulkProgress?.total || 0).toLocaleString()} 件</div>
                            <div>成功: {(bulkProgress?.success || 0).toLocaleString()} 件</div>
                            <div>失敗: {(bulkProgress?.failed || 0).toLocaleString()} 件</div>
                        </div>
                        {Array.isArray(bulkProgress?.failedNames) && bulkProgress.failedNames.length > 0 && (
                            <div className="bulk-progress-failures">
                                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>失敗した材料（先頭10件）</div>
                                <div style={{ lineHeight: 1.5 }}>
                                    {bulkProgress.failedNames.join('、')}
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <Button variant="primary" onClick={closeBulkProgressModal}>閉じる</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default CsvToMasterImporter;
