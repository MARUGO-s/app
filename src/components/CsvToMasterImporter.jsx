
import React, { useState, useEffect } from 'react';
import { purchasePriceService } from '../services/purchasePriceService';
import { unitConversionService } from '../services/unitConversionService';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { useToast } from '../contexts/ToastContext';

const CsvToMasterImporter = () => {
    const [mergedData, setMergedData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // id of item being saved (or 'bulk' for bulk save)
    const [filter, setFilter] = useState('all'); // all, unregistered, registered
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null); // Critical error state

    // Toast
    const toast = useToast();

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null
    });

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

                uniqueCsvItems.push({
                    name: item.name,
                    csvPrice: item.price,
                    csvUnit: item.unit,
                    csvVendor: item.vendor,

                    // Master data (if exists)
                    masterSize: masterItem ? masterItem.packetSize : '',
                    masterUnit: masterItem ? masterItem.packetUnit : (item.unit || 'g'),
                    masterPrice: masterItem ? masterItem.lastPrice : (item.price || 0),

                    isRegistered: !!masterItem,

                    // Form state
                    inputSize: masterItem ? masterItem.packetSize : '',
                    inputUnit: masterItem ? masterItem.packetUnit : (item.unit || 'g'),
                    inputPrice: masterItem ? masterItem.lastPrice : (item.price || 0),

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
            const size = parseFloat(item.inputSize);
            const price = parseFloat(item.inputPrice);

            if (isNaN(size) || size <= 0) {
                toast.error("容量には正しい数値を入力してください。");
                return;
            }
            if (!item.inputUnit) {
                toast.error("単位を入力してください。");
                return;
            }

            // Save to master
            await unitConversionService.saveConversion(
                item.name,
                size,
                item.inputUnit,
                price
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
                        masterPrice: price
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
        setSaving('bulk');
        let successCount = 0;
        let failCount = 0;

        try {
            const results = await Promise.allSettled(modifiedItems.map(async (item) => {
                const size = parseFloat(item.inputSize);
                const price = parseFloat(item.inputPrice);

                // Basic validation
                if (isNaN(size) || size <= 0) throw new Error("Invalid size");
                if (!item.inputUnit) throw new Error("Invalid unit");

                await unitConversionService.saveConversion(
                    item.name,
                    size,
                    item.inputUnit,
                    price
                );
                return item;
            }));

            const successItems = [];
            results.forEach((res, idx) => {
                if (res.status === 'fulfilled') {
                    successCount++;
                    successItems.push(modifiedItems[idx]);
                } else {
                    failCount++;
                    console.error(`Failed to save ${modifiedItems[idx].name}: `, res.reason);
                }
            });

            // Update local state for successful items
            const successNames = new Set(successItems.map(i => i.name));
            setMergedData(prev => prev.map(d => {
                if (successNames.has(d.name)) {
                    const updated = modifiedItems.find(t => t.name === d.name);
                    return {
                        ...d,
                        isRegistered: true,
                        isModified: false, // Reset modification flag
                        masterSize: parseFloat(updated.inputSize),
                        masterUnit: updated.inputUnit,
                        masterPrice: parseFloat(updated.inputPrice)
                    };
                }
                return d;
            }));

            if (failCount === 0) {
                toast.success(`${successCount} 件のデータを一括登録しました`);
            } else {
                toast.warning(`処理完了: 成功 ${successCount} 件 / 失敗 ${failCount} 件`);
            }

        } catch (err) {
            console.error("Bulk save error:", err);
            toast.error("一括保存中にエラーが発生しました");
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

    const filteredData = mergedData.filter(item => {
        // Filter by status
        if (filter === 'unregistered' && item.isRegistered) return false;
        if (filter === 'registered' && !item.isRegistered) return false;

        // Filter by search term
        if (searchTerm && !item.name.includes(searchTerm)) return false;

        return true;
    });

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
                        全て ({mergedData.length})
                    </Button>
                    <Button
                        variant={filter === 'unregistered' ? 'primary' : 'secondary'}
                        onClick={() => setFilter('unregistered')}
                        size="sm"
                        style={{ marginRight: '0.5rem' }}
                    >
                        未登録 ({mergedData.filter(d => !d.isRegistered).length})
                    </Button>
                    <Button
                        variant={filter === 'registered' ? 'primary' : 'secondary'}
                        onClick={() => setFilter('registered')}
                        size="sm"
                    >
                        登録済 ({mergedData.filter(d => d.isRegistered).length})
                    </Button>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    {modifiedCount > 0 && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleBulkSaveClick}
                            disabled={saving === 'bulk'}
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
                            <th style={{ width: '25%' }}>材料名 (CSV)</th>
                            <th style={{ width: '15%' }}>参考価格 (CSV)</th>
                            <th style={{ width: '20%' }}>容量 (登録値) <span style={{ color: 'red' }}>*</span></th>
                            <th style={{ width: '15%' }}>単位 (登録値) <span style={{ color: 'red' }}>*</span></th>
                            <th style={{ width: '15%' }}>価格 (登録値)</th>
                            <th style={{ width: '10%' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="no-data">データが見つかりません</td>
                            </tr>
                        ) : (
                            filteredData.map((item, index) => (
                                <tr key={item.name + index} style={{
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
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <Input
                                                type="number"
                                                value={item.inputSize}
                                                onChange={(e) => handleInputChange(item.name, 'inputSize', e.target.value)}
                                                placeholder={['個', '本', '枚', 'PC', '箱', '缶', '包'].includes(item.inputUnit) ? '数量 (例: 1)' : '例: 1000'}
                                                style={{ width: '100%' }}
                                            />
                                            {['個', '本', '枚', 'PC', '箱', '缶', '包'].includes(item.inputUnit) && (
                                                <span style={{ fontSize: '0.7rem', color: '#e67e22', whiteSpace: 'nowrap' }}>
                                                    ※1{item.inputUnit}単位の価格なら「1」
                                                </span>
                                            )}
                                        </div>
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
        </div>
    );
};

export default CsvToMasterImporter;

