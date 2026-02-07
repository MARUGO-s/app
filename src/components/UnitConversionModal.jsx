import React, { useState, useEffect, useCallback } from 'react';
import { unitConversionService } from '../services/unitConversionService';
import { purchasePriceService } from '../services/purchasePriceService';

const UnitConversionModal = ({
    isOpen,
    onClose,
    onApply,
    ingredientName,
    currentCost,
    currentQuantity,
    unit = 'g',
    initialPurchaseCost, // New prop
    initialContentAmount // New prop
}) => {
    const [packetPrice, setPacketPrice] = useState('');
    const [packetSize, setPacketSize] = useState('');
    const [packetUnit, setPacketUnit] = useState(unit);
    const [saveDefault, setSaveDefault] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const loadDefaults = useCallback(async () => {
        setIsLoading(true);

        // Priority 1: Use values passed from the specific ingredient instance (if they exist)
        if (initialPurchaseCost && initialContentAmount) {
            setPacketPrice(initialPurchaseCost);
            setPacketSize(initialContentAmount);
            // Verify if packetUnit needs to be stored/passed too. 
            // For now assume same unit or inferred. 
            // Ideally we should store contentUnit too, but let's stick to current scope logic 
            // or try to infer/load default unit.
            const saved = await unitConversionService.getConversion(ingredientName);
            if (saved) {
                setPacketUnit(saved.packetUnit || unit);
            } else {
                setPacketUnit(unit);
            }
        } else {
            // Priority 2: Global Saved Default
            const saved = await unitConversionService.getConversion(ingredientName);
            if (saved) {
                setPacketSize(saved.packetSize);
                setPacketUnit(saved.packetUnit || unit);
                if (saved.lastPrice) setPacketPrice(saved.lastPrice);
            } else {
                // Priority 3: Master Data / Heuristics
                // Try to find in master CSV data
                try {
                    const masterData = await purchasePriceService.getPrice(ingredientName);

                    if (masterData) {
                        setPacketPrice(currentCost || masterData.price);

                        if (masterData.unit) {
                            const match = masterData.unit.match(/^(\d+(?:\.\d+)?)?\s*(.*)$/);
                            if (match) {
                                let size = match[1] ? parseFloat(match[1]) : 1;
                                let u = match[2] ? match[2].trim().toLowerCase() : '';

                                if (u === 'kg') { size *= 1000; u = 'g'; }
                                else if (u === 'l') { size *= 1000; u = 'ml'; }
                                else if (u === 'pk' || u === 'pack') u = 'パック';
                                else if (u === 'bag') u = '袋';
                                else if (u === 'pc' || u === 'pcs') u = '個';

                                setPacketSize(size);
                                setPacketUnit(u || unit);
                            } else {
                                setPacketSize(1);
                                setPacketUnit(masterData.unit);
                            }
                        } else {
                            setPacketSize('');
                            setPacketUnit(unit);
                        }
                    } else {
                        setPacketSize('');
                        setPacketPrice(currentCost || '');
                        setPacketUnit(unit);
                    }
                } catch (err) {
                    console.warn('Failed to load master price:', err);
                    setPacketSize('');
                    setPacketPrice(currentCost || '');
                    setPacketUnit(unit);
                }
            }
        }
        setIsLoading(false);
    }, [ingredientName, initialPurchaseCost, initialContentAmount, unit, currentCost]);

    useEffect(() => {
        if (!isOpen || !ingredientName) return undefined;

        // Avoid calling setState synchronously inside an effect body.
        const t = setTimeout(() => {
            void loadDefaults();
        }, 0);
        return () => clearTimeout(t);
    }, [isOpen, ingredientName, loadDefaults]);

    const calculateNormalizedCost = () => {
        const price = parseFloat(packetPrice);
        const size = parseFloat(packetSize);
        if (!price || !size) return 0;

        if (['g', 'ml', 'cc'].includes(packetUnit)) {
            return (price / size) * 1000;
        }
        return price / size;
    };

    const handleApply = async () => {
        const normalizedCost = calculateNormalizedCost();

        if (saveDefault && packetSize) {
            try {
                await unitConversionService.saveConversion(ingredientName, packetSize, packetUnit, packetPrice);
            } catch (err) {
                console.error('Failed to save default conversion:', err);
            }
        }

        // Pass back all details needed for persistence
        onApply(normalizedCost, packetUnit, packetPrice, packetSize);
        onClose();
    };

    if (!isOpen) return null;

    const normalizedCost = calculateNormalizedCost();
    // Preview usage cost
    const usageCost = currentQuantity ? (normalizedCost * (currentQuantity / (['g', 'ml'].includes(unit) ? 1000 : 1))) : 0;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: 'white', padding: '20px', borderRadius: '8px',
                width: '90%', maxWidth: '350px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#000' }}>原価計算アシスト</h3>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#666' }}>材料名</label>
                    <div style={{ fontWeight: 'bold' }}>{ingredientName || '(未入力)'}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666' }}>仕入れ値 (円)</label>
                        <input
                            type="number"
                            value={packetPrice}
                            onChange={(e) => setPacketPrice(e.target.value)}
                            className="input-field"
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                            placeholder="例: 1000"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666' }}>内容量</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <input
                                type="number"
                                value={packetSize}
                                onChange={(e) => setPacketSize(e.target.value)}
                                className="input-field"
                                style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                                placeholder="例: 1000"
                            />
                            <select
                                value={packetUnit}
                                onChange={(e) => setPacketUnit(e.target.value)}
                                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: 'white' }}
                            >
                                <option value="g">g</option>
                                <option value="ml">ml</option>
                                <option value="個">個</option>
                                <option value="袋">袋</option>
                                <option value="本">本</option>
                                <option value="枚">枚</option>
                                <option value="パック">p</option>
                                <option value="cc">cc</option>
                                {!['g', 'ml', '個', '袋', '本', '枚', 'パック', 'cc'].includes(packetUnit) && (
                                    <option value={packetUnit}>{packetUnit}</option>
                                )}
                            </select>
                        </div>
                    </div>
                </div>

                <div style={{ backgroundColor: '#f5f5f5', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>CSVデータを検索中...</div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.9rem' }}>換算単価 (1kg/1単位):</span>
                                <span style={{ fontWeight: 'bold' }}>¥{Math.round(normalizedCost).toLocaleString()}</span>
                            </div>
                            {currentQuantity && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.85rem' }}>
                                    <span>今回分 ({currentQuantity}{unit}):</span>
                                    <span>¥{Math.round(usageCost).toLocaleString()}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                    <input
                        type="checkbox"
                        id="saveDefault"
                        checked={saveDefault}
                        onChange={(e) => setSaveDefault(e.target.checked)}
                        style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="saveDefault" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                        この容量({packetSize}{packetUnit})を保存する
                    </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ flex: 1, padding: '10px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        キャンセル
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!packetPrice || !packetSize}
                        style={{
                            flex: 1, padding: '10px', border: 'none',
                            background: (!packetPrice || !packetSize) ? '#ccc' : '#D2691E',
                            color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                        }}
                    >
                        反映する
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UnitConversionModal;
