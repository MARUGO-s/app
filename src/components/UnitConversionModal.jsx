import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { unitConversionService } from '../services/unitConversionService';
import { purchasePriceService } from '../services/purchasePriceService';
import { Button } from './Button';
import './UnitConversionModal.css';

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
    const [vendor, setVendor] = useState('');
    const [saveDefault, setSaveDefault] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const loadDefaults = useCallback(async () => {
        setIsLoading(true);
        setVendor('');

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
                setVendor(saved.vendor || '');
            } else {
                setPacketUnit(unit);
                try {
                    const masterData = await purchasePriceService.getPrice(ingredientName);
                    setVendor(masterData?.vendor || '');
                } catch {
                    // ignore
                }
            }
        } else {
            // Priority 2: Global Saved Default
            const saved = await unitConversionService.getConversion(ingredientName);
            if (saved) {
                setPacketSize(saved.packetSize);
                setPacketUnit(saved.packetUnit || unit);
                if (saved.lastPrice) setPacketPrice(saved.lastPrice);
                setVendor(saved.vendor || '');
            } else {
                // Priority 3: Master Data / Heuristics
                // Try to find in master CSV data
                try {
                    const masterData = await purchasePriceService.getPrice(ingredientName);

                    if (masterData) {
                        setPacketPrice(currentCost || masterData.price);
                        setVendor(masterData.vendor || '');

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
                        setVendor('');
                    }
                } catch (err) {
                    console.warn('Failed to load master price:', err);
                    setPacketSize('');
                    setPacketPrice(currentCost || '');
                    setPacketUnit(unit);
                    setVendor('');
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
                await unitConversionService.saveConversion(ingredientName, packetSize, packetUnit, packetPrice, null, vendor);
            } catch (err) {
                console.error('Failed to save default conversion:', err);
            }
        }

        // Pass back all details needed for persistence
        onApply(normalizedCost, packetUnit, packetPrice, packetSize, vendor);
        onClose();
    };

    if (!isOpen) return null;

    const normalizedCost = calculateNormalizedCost();
    // Preview usage cost
    const usageCost = currentQuantity ? (normalizedCost * (currentQuantity / (['g', 'ml'].includes(unit) ? 1000 : 1))) : 0;

    const modal = (
        <div
            className="unit-conversion-modal__overlay"
            role="dialog"
            aria-modal="true"
            aria-label="原価計算アシスト"
            onClick={onClose}
        >
            <div className="unit-conversion-modal__card" onClick={(e) => e.stopPropagation()}>
                <div className="unit-conversion-modal__body">
                    <h3 className="unit-conversion-modal__title">原価計算アシスト</h3>

                    <div className="unit-conversion-modal__field">
                        <span className="unit-conversion-modal__label">材料名</span>
                        <div className="unit-conversion-modal__value">{ingredientName || '(未入力)'}</div>
                    </div>

	                    <div className="unit-conversion-modal__inputs">
	                        <div>
	                            <label className="unit-conversion-modal__label">仕入れ値 (円)</label>
	                            <input
                                type="number"
                                value={packetPrice}
                                onChange={(e) => setPacketPrice(e.target.value)}
                                className="input-field unit-conversion-modal__input"
                                placeholder="例: 1000"
                            />
                        </div>

	                        <div>
	                            <label className="unit-conversion-modal__label">内容量</label>
	                            <div className="unit-conversion-modal__row">
	                                <input
                                    type="number"
                                    value={packetSize}
                                    onChange={(e) => setPacketSize(e.target.value)}
                                    className="input-field unit-conversion-modal__input"
                                    placeholder="例: 1000"
                                />
                                <select
                                    value={packetUnit}
                                    onChange={(e) => setPacketUnit(e.target.value)}
                                    className="unit-conversion-modal__select"
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

                            <div>
                                <label className="unit-conversion-modal__label">業者名</label>
                                <input
                                    type="text"
                                    value={vendor}
                                    onChange={(e) => setVendor(e.target.value)}
                                    className="input-field unit-conversion-modal__input"
                                    placeholder="例: ◯◯商会"
                                />
                            </div>
	                    </div>

                    <div className="unit-conversion-modal__summary" aria-live="polite">
                        {isLoading ? (
                            <div className="unit-conversion-modal__summary-sub" style={{ textAlign: 'center' }}>CSVデータを検索中...</div>
                        ) : (
                            <>
                                <div className="unit-conversion-modal__summary-row">
                                    <span className="unit-conversion-modal__summary-label">換算単価 (1kg/1単位):</span>
                                    <span className="unit-conversion-modal__summary-value">¥{Math.round(normalizedCost).toLocaleString()}</span>
                                </div>
                                {currentQuantity && (
                                    <div className="unit-conversion-modal__summary-row unit-conversion-modal__summary-sub">
                                        <span>今回分 ({currentQuantity}{unit}):</span>
                                        <span>¥{Math.round(usageCost).toLocaleString()}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <label className="unit-conversion-modal__checkbox" htmlFor="saveDefault">
                        <input
                            type="checkbox"
                            id="saveDefault"
                            checked={saveDefault}
                            onChange={(e) => setSaveDefault(e.target.checked)}
                        />
                        <span>この容量({packetSize}{packetUnit})を保存する</span>
                    </label>

                    <div className="unit-conversion-modal__actions">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            キャンセル
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleApply}
                            disabled={!packetPrice || !packetSize || isLoading}
                        >
                            反映する
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );

    // Render via portal so `position: fixed` is relative to the viewport (not a transformed/scroll container).
    return createPortal(modal, document.body);
};

export default UnitConversionModal;
