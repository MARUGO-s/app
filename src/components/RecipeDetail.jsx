import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import { translationService } from '../services/translationService';
import { recipeService } from '../services/recipeService';
import { unitConversionService } from '../services/unitConversionService';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { SUPPORTED_LANGUAGES } from '../constants';
import './RecipeDetail.css';
import QRCode from "react-qr-code";

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const ALLOWED_ITEM_CATEGORIES = new Set(['food', 'alcohol', 'soft_drink', 'supplies']);
const TAX10_ITEM_CATEGORIES = new Set(['alcohol', 'supplies']);

const normalizeItemCategory = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'food_alcohol') return 'food';
    if (ALLOWED_ITEM_CATEGORIES.has(normalized)) return normalized;
    return '';
};

const isTax10Item = (item) => {
    const category = normalizeItemCategory(item?.itemCategory ?? item?.item_category);
    if (category) return TAX10_ITEM_CATEGORIES.has(category);
    return Boolean(item?.isAlcohol);
};

const getItemTaxRate = (item) => (isTax10Item(item) ? 1.10 : 1.08);

const normalizeIngredientName = (value) =>
    String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

const findConversionByName = (conversionMap, ingredientName) => {
    if (!conversionMap || conversionMap.size === 0) return null;
    if (!ingredientName) return null;

    const direct = conversionMap.get(ingredientName);
    if (direct) return direct;

    const target = normalizeIngredientName(ingredientName);
    if (!target) return null;

    for (const [key, value] of conversionMap.entries()) {
        if (normalizeIngredientName(key) === target) {
            return value;
        }
    }
    return null;
};

const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
};

const normalizeYieldPercent = (value) => {
    const n = toFiniteNumber(value);
    if (!Number.isFinite(n)) return 100;
    if (n <= 0) return 100;
    if (n > 100) return 100;
    return n;
};

const getYieldRate = (item, conversion) => {
    const raw = conversion?.yieldPercent ?? conversion?.yield_percent ?? item?.yieldPercent ?? item?.yield_percent;
    return normalizeYieldPercent(raw) / 100;
};

const normalizePurchaseCostByConversion = (basePrice, packetSize, packetUnit) => {
    const safeBase = toFiniteNumber(basePrice);
    const safePacketSize = toFiniteNumber(packetSize);
    if (!Number.isFinite(safeBase) || !Number.isFinite(safePacketSize) || safePacketSize <= 0) return NaN;

    const pu = String(packetUnit || '').trim().toLowerCase();
    if (['g', 'ｇ', 'ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(pu)) {
        return (safeBase / safePacketSize) * 1000;
    }
    if (['kg', 'ｋｇ', 'l', 'ｌ'].includes(pu)) {
        return safeBase / safePacketSize;
    }
    return safeBase / safePacketSize;
};

const calculateCostByUnit = (quantity, purchaseCost, unit, { defaultWeightWhenUnitEmpty = false, forceWeightBased = false, yieldRate = 1 } = {}) => {
    const qty = toFiniteNumber(quantity);
    const pCost = toFiniteNumber(purchaseCost);
    if (!Number.isFinite(qty) || !Number.isFinite(pCost)) return NaN;

    const safeYieldRate = (Number.isFinite(yieldRate) && yieldRate > 0) ? yieldRate : 1;

    const normalizedUnit = String(unit || '').trim().toLowerCase();
    if (forceWeightBased) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    if (!normalizedUnit && defaultWeightWhenUnitEmpty) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    if (['g', 'ｇ', 'ml', 'ｍｌ', 'cc', 'ｃｃ'].includes(normalizedUnit)) {
        return ((qty / 1000) * pCost) / safeYieldRate;
    }
    return (qty * pCost) / safeYieldRate;
};

const isLikelyLegacyPackPrice = (item, normalizedCost) => {
    const stored = toFiniteNumber(item?.purchaseCost);
    const ref = toFiniteNumber(item?.purchaseCostRef ?? item?.purchase_cost);
    if (!Number.isFinite(normalizedCost)) return false;
    if (!Number.isFinite(stored)) return true;

    // Legacy case: purchaseCost was saved as pack price (= purchaseCostRef), not normalized unit cost.
    if (Number.isFinite(ref) && Math.abs(stored - ref) < 0.0001 && Math.abs(stored - normalizedCost) > 0.01) {
        return true;
    }
    return false;
};

export const RecipeDetail = ({ recipe, ownerLabel, onBack, onEdit, onDelete, onHardDelete, isDeleted, onView, onDuplicate, backLabel, onList }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [showDuplicateConfirm, setShowDuplicateConfirm] = React.useState(false);
    const [showHardDeleteConfirm, setShowHardDeleteConfirm] = React.useState(false);
    const [completedSteps, setCompletedSteps] = React.useState(new Set());
    const [previewCompletedSteps, setPreviewCompletedSteps] = React.useState(new Set());
    const [previewCompletedIngredients, setPreviewCompletedIngredients] = React.useState(new Set());

    const [translationCache, setTranslationCache] = React.useState({}); // {[langCode]: recipeObj }
    const [currentLang, setCurrentLang] = React.useState('ORIGINAL'); // 'ORIGINAL' is source text
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [showOriginal, setShowOriginal] = React.useState(true); // Default to showing original
    const [showPrintModal, setShowPrintModal] = React.useState(false);
    const [conversionMap, setConversionMap] = React.useState(new Map());

    // Scaling State
    const [targetTotal, setTargetTotal] = React.useState(''); // For Bread
    const [multiplier, setMultiplier] = React.useState(1);    // For Normal

    // Profit Calculator State
    const [salesPrice, setSalesPrice] = React.useState('');
    const [calcServings, setCalcServings] = React.useState('');

    const multiplierValue = React.useMemo(() => {
        const parsed = parseFloat(multiplier);
        return isNaN(parsed) ? 1 : parsed;
    }, [multiplier]);

    // Helper for Normal Recipe Scaling
    const getScaledQty = (qty, mult) => {
        if (!qty) return '';
        const num = parseFloat(qty);
        if (isNaN(num)) return qty;
        // Float precision handling could be better but simple for now
        const val = num * parseFloat(mult);
        // Avoid .00 if integer
        return Number.isInteger(val) ? val.toString() : val.toFixed(1).replace(/\.0$/, '');
    };

    const getScaledCost = (cost, mult) => {
        if (!cost) return '';
        const num = parseFloat(cost);
        if (isNaN(num)) return cost;
        // Round to 2 decimals for display consistency? Or integer for yen?
        // User wants decimal input, but maybe integer display scaled?
        // Let's keep decimal precision for accurate totals, verify display later.
        // If the cost is small (e.g. 0.5), scaling by 1 should be 0.5.
        // parseInt was truncating 0.5 to 0.
        return (num * parseFloat(mult)).toFixed(2).replace(/\.00$/, '');
    };

    // State for full recipe data (fetched if steps are missing)
    const [fullRecipe, setFullRecipe] = React.useState(recipe);
    const [_loadingDetail, setLoadingDetail] = React.useState(false);

    // Determines which data to show
    const displayRecipe = currentLang === 'ORIGINAL' ? fullRecipe : (translationCache[currentLang] || fullRecipe);

    React.useEffect(() => {
        let mounted = true;
        unitConversionService.getAllConversions()
            .then((map) => {
                if (mounted) setConversionMap(map);
            })
            .catch(() => {
                if (mounted) setConversionMap(new Map());
            });
        return () => {
            mounted = false;
        };
    }, []);

    const costAdjustedRecipe = React.useMemo(() => {
        const adjustItem = (item, options = {}) => {
            if (!item || typeof item !== 'object') return item;

            const conv = findConversionByName(conversionMap, item.name);
            const normalizedCategory = normalizeItemCategory(item.itemCategory ?? item.item_category ?? conv?.itemCategory);
            const yieldRate = getYieldRate(item, conv);

            let nextItem = item;
            if (normalizedCategory) {
                nextItem = {
                    ...nextItem,
                    itemCategory: normalizedCategory,
                    isAlcohol: TAX10_ITEM_CATEGORIES.has(normalizedCategory),
                };
            }

            if (!conv || !conv.packetSize) {
                const unitRaw = String(item.unit || '').trim();
                const shouldWeightBased =
                    options.forceWeightBased || (options.defaultWeightWhenUnitEmpty && !unitRaw);
                if (shouldWeightBased) {
                    const expectedCostRaw = calculateCostByUnit(item.quantity, nextItem.purchaseCost, item.unit, { ...options, yieldRate });
                    const expectedCost = Number.isFinite(expectedCostRaw)
                        ? Math.round(expectedCostRaw * 100) / 100
                        : NaN;
                    const currentCost = toFiniteNumber(nextItem.cost);
                    if (Number.isFinite(expectedCost) && (!Number.isFinite(currentCost) || Math.abs(currentCost - expectedCost) > 0.01)) {
                        return {
                            ...nextItem,
                            cost: expectedCost,
                        };
                    }
                }
                return nextItem;
            }

            const basePriceCandidates = [
                conv.lastPrice,
                item.purchaseCostRef,
                item.purchase_cost,
                item.purchaseCost,
            ];
            const basePrice = basePriceCandidates.find((v) => Number.isFinite(toFiniteNumber(v)));
            const normalizedCost = normalizePurchaseCostByConversion(basePrice, conv.packetSize, conv.packetUnit);
            if (!Number.isFinite(normalizedCost)) return nextItem;

            if (!isLikelyLegacyPackPrice(item, normalizedCost)) {
                return nextItem;
            }

            const recalculatedCost = calculateCostByUnit(item.quantity, normalizedCost, item.unit, { ...options, yieldRate });

            return {
                ...nextItem,
                purchaseCost: Math.round(normalizedCost * 100) / 100,
                cost: Number.isFinite(recalculatedCost)
                    ? Math.round(recalculatedCost * 100) / 100
                    : nextItem.cost,
            };
        };

        return {
            ...displayRecipe,
            ingredients: (displayRecipe.ingredients || []).map((item) => adjustItem(item)),
            flours: (displayRecipe.flours || []).map((item) =>
                adjustItem(item, { forceWeightBased: true })
            ),
            breadIngredients: (displayRecipe.breadIngredients || []).map((item) =>
                adjustItem(item, { forceWeightBased: true })
            ),
        };
    }, [conversionMap, displayRecipe]);

    React.useEffect(() => {
        // If recipe prop changes, reset fullRecipe to it initially
        setFullRecipe(recipe);

        // If steps are missing, fetch full details
        if (!recipe.steps && !isDeleted) {
            setLoadingDetail(true);
            recipeService.getRecipe(recipe.id)
                .then(data => {
                    setFullRecipe(data);
                })
                .catch(err => {
                    console.error("Failed to load details", err);
                })
                .finally(() => {
                    setLoadingDetail(false);
                });
        }
    }, [recipe, isDeleted]);

    const [isPublic, setIsPublic] = React.useState(recipe.tags?.includes('public') || false);
    const isOwner =
        user?.role === 'admin' ||
        (recipe.tags && recipe.tags.includes(`owner:${user?.id}`)) ||
        (user?.displayId && recipe.tags && recipe.tags.includes(`owner:${user.displayId}`));
    // If no owner tag, assume public/legacy, but for safety treat as owner if no tag present? 
    // Actually, logic in service says "No owner tag -> Visible". So let's say "Can Edit" if (No Owner OR Owner is Me OR Admin).
    const hasOwnerTag = recipe.tags && recipe.tags.some(t => t.startsWith('owner:'));
    const canEdit = !hasOwnerTag || isOwner;

    // Toggle Public Handler
    const handleTogglePublic = async () => {
        const newStatus = !isPublic;
        try {
            const currentTags = recipe.tags || [];
            let newTags;
            if (newStatus) {
                newTags = [...currentTags, 'public'];
            } else {
                newTags = currentTags.filter(t => t !== 'public');
            }

            // Optimistic update
            setIsPublic(newStatus);

            // Save
            // Update tags only (avoid overwriting steps/sourceUrl when the list-view recipe is partial).
            await recipeService.updateRecipe({ id: recipe.id, tags: newTags });

            // Ideally notify update parent, but local state is fine for switch
        } catch (e) {
            console.error("Failed to toggle public", e);
            toast.error("公開設定の変更に失敗しました");
            setIsPublic(!newStatus); // Revert
        }
    };


    const renderText = (text, originalText, isLongText = false) => {
        if (currentLang === 'ORIGINAL' || !showOriginal || !originalText || text === originalText) {
            return text;
        }
        return (
            <>
                {text}
                {isLongText ? <br /> : ' '}
                <span className="original-text-sub" style={{ opacity: 0.6, fontSize: '0.85em', fontWeight: 'normal' }}>
                    ({originalText})
                </span>
            </>
        );
    };

    const handleLanguageChange = async (e) => {
        const langCode = e.target.value;
        setCurrentLang(langCode);

        if (langCode === 'ORIGINAL') {
            return;
        }

        if (translationCache[langCode]) {
            return;
        }

        setIsTranslating(true);
        try {
            const translated = await translationService.translateRecipe(recipe, langCode);
            setTranslationCache(prev => ({ ...prev, [langCode]: translated }));
        } catch (err) {
            console.error(err);
            toast.error("翻訳に失敗しました");
            setCurrentLang('ORIGINAL');
        } finally {
            setIsTranslating(false);
        }
    };

    const toggleStep = (index) => {
        setCompletedSteps(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const togglePreviewStep = (index) => {
        setPreviewCompletedSteps(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const togglePreviewIngredient = (id) => {
        setPreviewCompletedIngredients(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    React.useEffect(() => {
        window.scrollTo(0, 0);
        if (onView && recipe && !isDeleted) {
            onView(recipe.id);
        }

        // Update document title for printing/PDF filename
        const originalTitle = document.title;
        if (recipe && recipe.title) {
            document.title = recipe.title;
        }

        // Reset translation on recipe change
        setTranslationCache({});
        setCurrentLang('ORIGINAL');
        setCompletedSteps(new Set());
        setPreviewCompletedSteps(new Set());
        setPreviewCompletedIngredients(new Set());
        // Reset public state based on new recipe
        setIsPublic(recipe.tags?.includes('public') || false);

        // Revert title on unmount or recipe change
        return () => {
            document.title = originalTitle;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipe.id, recipe.title]);

    // Initialize calcServings when recipe changes
    React.useEffect(() => {
        if (recipe && recipe.servings) {
            setCalcServings(recipe.servings.toString());
        } else {
            setCalcServings('');
        }
        setSalesPrice('');
    }, [recipe]);

    // ... (handlers kept same)

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
    };

    const confirmDelete = () => {
        setShowDeleteConfirm(false);
        onDelete(recipe);
    };

    const cancelDelete = () => {
        setShowDeleteConfirm(false);
    };

    const handleHardDeleteClick = () => {
        setShowHardDeleteConfirm(true);
    };

    const confirmHardDelete = () => {
        setShowHardDeleteConfirm(false);
        onHardDelete(recipe);
    };

    const cancelHardDelete = () => {
        setShowHardDeleteConfirm(false);
    };

    const handleDuplicateClick = () => {
        setShowDuplicateConfirm(true);
    };

    const confirmDuplicate = async () => {
        setShowDuplicateConfirm(false);
        try {
            const newRecipe = await recipeService.duplicateRecipe(recipe, user);
            if (onDuplicate) onDuplicate(newRecipe);
        } catch (e) {
            console.error("Duplication failed", e);
            toast.error("複製に失敗しました");
        }
    };

    const cancelDuplicate = () => {
        setShowDuplicateConfirm(false);
    };

    // ... (rest of logic)

    // Swipe to back logic
    const touchStartRef = React.useRef(null);
    const touchEndRef = React.useRef(null);

    const onTouchStart = (e) => {
        touchEndRef.current = null;
        touchStartRef.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e) => {
        touchEndRef.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        if (!touchStartRef.current || !touchEndRef.current) return;
        const distance = touchStartRef.current - touchEndRef.current;
        const isLeftEdge = touchStartRef.current < 50;
        const isRightSwipe = distance < -100;

        if (isLeftEdge && isRightSwipe) {
            onBack();
        }
    };

    // --- Helper for Profit Calculation UI ---
    // Note: totalCost passed here usually represents Tax Excluded (sum of ingredients).
    // We will apply 8% tax (consumption tax for food ingredients) to get the "Actual Cost".
    const renderProfitCalculator = (totalCostTaxIncluded) => {
        // totalCostTaxIncluded is already tax included
        const costNum = Math.round(parseFloat(totalCostTaxIncluded));
        const priceNum = parseFloat(salesPrice);
        const servingsNum = parseFloat(calcServings);

        let costRate = null;
        let totalSales = null;
        let unitCost = null;

        if (!isNaN(costNum) && !isNaN(servingsNum) && servingsNum > 0) {
            unitCost = costNum / servingsNum;
        }

        if (!isNaN(costNum) && !isNaN(priceNum) && !isNaN(servingsNum) && priceNum > 0 && servingsNum > 0) {
            totalSales = priceNum * servingsNum;
            costRate = (costNum / totalSales) * 100;
        }

        return (
            <div className="profit-calculator screen-only" style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
            }}>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '1rem', color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>💰 原価率シミュレーター <small style={{ fontSize: '0.7em', fontWeight: 'normal' }}>(税込計算)</small></span>
                    <span style={{ fontSize: '0.7em', fontWeight: 'normal' }}>※原価は材料ごとに税率(8% or 10%)を適用</span>
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>販売価格 (1個/1人)</label>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}>¥</span>
                            <input
                                type="number"
                                value={salesPrice}
                                onChange={(e) => setSalesPrice(e.target.value)}
                                placeholder="0"
                                style={{
                                    padding: '6px 6px 6px 20px',
                                    width: '100px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    fontSize: '1rem'
                                }}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>個数 (人分)</label>
                        <input
                            type="number"
                            value={calcServings}
                            onChange={(e) => setCalcServings(e.target.value)}
                            placeholder="0"
                            style={{
                                padding: '6px',
                                width: '60px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                fontSize: '1rem',
                                textAlign: 'center'
                            }}
                        />
                    </div>

                    {unitCost !== null && (
                        <div style={{
                            marginLeft: 'auto',
                            padding: '8px 12px',
                            background: costRate !== null ? (costRate > 40 ? '#ffebee' : '#e8f5e9') : '#eef3ff',
                            borderRadius: '6px',
                            border: `1px solid ${costRate !== null ? (costRate > 40 ? '#ffcdd2' : '#c8e6c9') : '#d6e3ff'}`,
                            textAlign: 'right'
                        }}>
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: costRate !== null ? '6px' : '0' }}>
                                1個あたり原価(税込): <strong>¥{unitCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                            </div>
                            {costRate !== null && (
                                <>
                                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>
                                        予想売上: ¥{totalSales.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px', fontWeight: 'bold' }}>
                                        粗利益: ¥{(totalSales - costNum).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: costRate > 40 ? '#d32f2f' : '#2e7d32' }}>
                                        原価率: {costRate.toFixed(1)}%
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Safety check for array rendering
    const ingredients = costAdjustedRecipe.ingredients || [];
    // Normalization: Check if steps are hidden in ingredient groups (common in this app's data)
    let normalizedSteps = displayRecipe.steps || [];
    const normalizeGroupName = (name) => String(name || '').trim().toLowerCase();
    const isStepGroupName = (name) => {
        const normalized = normalizeGroupName(name);
        if (!normalized) return false;
        return ['作り方', '手順', 'steps', 'method'].some(keyword => normalized === keyword || normalized.includes(keyword));
    };

    // If no standard steps, look for an ingredient group named "作り方" or similar
    if (!normalizedSteps.length && displayRecipe.ingredientGroups) {
        const stepGroup = displayRecipe.ingredientGroups.find(g => isStepGroupName(g.name));
        if (stepGroup) {
            // Found a group that should be steps
            const stepItems = ingredients.filter(ing => ing.groupId === stepGroup.id);
            // Convert to simple strings or objects as expected by renderer
            // Ingredient items usually have 'name' property
            normalizedSteps = stepItems.map(item => {
                if (typeof item === 'string') return item;
                // Preserve all properties (including groupId) and ensure text property exists
                return {
                    ...item,
                    text: item.name || item.text || ""
                };
            });
        } else {
            // Fallback: legacy items may carry group name directly on the item
            const stepItems = ingredients.filter(ing => isStepGroupName(ing.group) || isStepGroupName(ing.groupName));
            if (stepItems.length) {
                normalizedSteps = stepItems.map(item => {
                    if (typeof item === 'string') return item;
                    return {
                        ...item,
                        text: item.name || item.text || ""
                    };
                });
            }
        }
    }

    const steps = normalizedSteps;

    const printIngredientSections = React.useMemo(() => {
        const rawGroups = displayRecipe.ingredientGroups || [];
        const skipNames = ['作り方', 'steps', 'method', '手順'];
        const normalizeName = (name) => String(name || '').trim().toLowerCase();
        const skipGroupIds = new Set(
            rawGroups
                .filter(group => skipNames.includes(normalizeName(group.name)))
                .map(group => group.id)
        );

        const groups = rawGroups.filter(group => !skipGroupIds.has(group.id));

        if (!groups.length) {
            return [{ id: 'default', name: null, items: ingredients.filter(ing => !skipGroupIds.has(ing.groupId)) }];
        }

        const mapped = groups.map(group => {
            const items = ingredients.filter(ing => ing.groupId === group.id);
            return { id: group.id, name: group.name === '材料' ? null : group.name, items };
        }).filter(section => section.items.length > 0);

        const ungrouped = ingredients.filter(ing => {
            if (!ing.groupId) return true;
            if (skipGroupIds.has(ing.groupId)) return false;
            return !groups.some(g => g.id === ing.groupId);
        });
        if (ungrouped.length) {
            mapped.push({ id: 'ungrouped', name: null, items: ungrouped });
        }

        return mapped.length ? mapped : [{ id: 'default', name: null, items: ingredients.filter(ing => !skipGroupIds.has(ing.groupId)) }];
    }, [displayRecipe.ingredientGroups, ingredients]);

    const breadPrintContext = React.useMemo(() => {
        if (displayRecipe.type !== 'bread') return null;
        const flours = costAdjustedRecipe.flours || [];
        const others = costAdjustedRecipe.breadIngredients || [];
        const totalFlour = flours.reduce((sum, f) => sum + (parseFloat(f.quantity) || 0), 0);
        const grandTotal = totalFlour + others.reduce((sum, o) => sum + (parseFloat(o.quantity) || 0), 0);
        const target = parseFloat(targetTotal);
        const scaleFactor = target && grandTotal ? (target / grandTotal) : 1;
        const calcPercent = (qty) => totalFlour ? ((parseFloat(qty) || 0) / totalFlour * 100).toFixed(1) : '0.0';
        const getScaledQtyValue = (qty) => {
            if (!target) return qty;
            return ((parseFloat(qty) || 0) * scaleFactor).toFixed(1);
        };
        const getScaledCostValue = (cost) => {
            const raw = parseFloat(cost) || 0;
            if (!target) return raw;
            const scaled = raw * scaleFactor;
            return Math.round(scaled * 100) / 100;
        };
        const formatCostValue = (cost) => {
            const val = getScaledCostValue(cost);
            if (!Number.isFinite(val)) return '';
            return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
        };
        const calcTaxedCost = (items) => {
            return items.reduce((sum, item) => {
                const rawCost = parseFloat(item.cost) || 0;
                const scaledCost = rawCost * (target ? scaleFactor : 1);
                const taxRate = getItemTaxRate(item);
                return sum + (scaledCost * taxRate);
            }, 0);
        };

        return {
            flours,
            others,
            totalFlour,
            grandTotal,
            calcPercent,
            getScaledQtyValue,
            getScaledCostValue,
            formatCostValue,
            scaleFactor,
            totalTaxIncluded: calcTaxedCost(flours) + calcTaxedCost(others)
        };
    }, [costAdjustedRecipe.breadIngredients, costAdjustedRecipe.flours, displayRecipe.type, targetTotal]);

    const normalPrintTotal = React.useMemo(() => {
        if (displayRecipe.type === 'bread') return 0;
        return ingredients.reduce((sum, ing) => {
            const rawCost = parseFloat(ing.cost) || 0;
            const scaledCost = rawCost * multiplierValue;
            const taxRate = getItemTaxRate(ing);
            return sum + (scaledCost * taxRate);
        }, 0);
    }, [displayRecipe.type, ingredients, multiplierValue]);

    const printCostTotalDisplay = displayRecipe.type === 'bread'
        ? (breadPrintContext ? Math.round(breadPrintContext.totalTaxIncluded).toLocaleString() : '0')
        : Math.round(normalPrintTotal).toLocaleString();

    const printDescription = displayRecipe.description || recipe.description;

    return (
        <>
            <div
                className="recipe-detail fade-in"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
            {/* ... (modals kept same) */}
                {showDuplicateConfirm && (
                    <div className="modal-overlay fade-in" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', color: '#333' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--color-primary)' }}>レシピの複製</h3>
                            <p style={{ margin: '1rem 0', color: '#333' }}>
                                このレシピのコピーを作成しますか？
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                                <Button variant="ghost" onClick={cancelDuplicate}>キャンセル</Button>
                                <Button variant="primary" onClick={confirmDuplicate}>複製する</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {showHardDeleteConfirm && (
                    <div className="modal-overlay fade-in" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', border: '2px solid var(--color-danger)', color: '#333' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--color-danger)' }}>⚠️ 完全に削除しますか？</h3>
                            <p style={{ margin: '1rem 0', color: '#333' }}>
                                この操作は取り消せません。<br />
                                永久に削除され、二度と復元できなくなります。
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                                <Button variant="ghost" onClick={cancelHardDelete}>キャンセル</Button>
                                <Button variant="danger" onClick={confirmHardDelete}>完全に削除する</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {showDeleteConfirm && (
                    <div className="modal-overlay fade-in" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', color: '#333' }}>
                            <h3 style={{ marginTop: 0, color: 'var(--color-danger)' }}>レシピの削除</h3>
                            <p style={{ margin: '1rem 0', color: '#333' }}>
                                本当にこのレシピを削除しますか？<br />
                                <small style={{ color: '#666' }}>（削除済みアイテムとしてゴミ箱に移動します）</small>
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                                <Button variant="ghost" onClick={cancelDelete}>キャンセル</Button>
                                <Button variant="danger" onClick={confirmDelete}>削除する</Button>
                            </div>
                        </Card>
                    </div>
                )}

                <div className="recipe-detail__header">
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" onClick={onBack} size="sm">{backLabel || "← 戻る"}</Button>
                        {onList && (
                            <Button variant="secondary" onClick={onList} size="sm">レシピ一覧</Button>
                        )}
                    </div>
                    {!isDeleted && (
                        <div className="recipe-detail__actions">

                            {/* Public Toggle (Owner Only) */}
                            {canEdit && (user?.displayId === 'yoshito' || user?.role === 'admin') && (
                                <div style={{ marginRight: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label className="switch" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={isPublic}
                                            onChange={handleTogglePublic}
                                            style={{ accentColor: '#4CAF50', transform: 'scale(1.2)' }}
                                        />
                                        <span style={{ marginLeft: '4px', fontSize: '0.9rem', fontWeight: 'bold', color: isPublic ? '#4CAF50' : '#888' }}>
                                            {isPublic ? '公開中' : '非公開'}
                                        </span>
                                    </label>
                                </div>
                            )}

                            {!canEdit && (
                                <span style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#e0e0e0',
                                    color: '#555',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    marginRight: '0.5rem'
                                }}>
                                    🔒 マスターデータ (閲覧のみ)
                                </span>
                            )}

                            <select
                                className="language-select"
                                value={currentLang}
                                onChange={handleLanguageChange}
                                disabled={isTranslating}
                                style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc', marginRight: '0.5rem', cursor: 'pointer' }}
                            >
                                <option value="ORIGINAL">📄 Original (原文)</option>
                                {SUPPORTED_LANGUAGES.map(lang => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.label}
                                    </option>
                                ))}
                            </select>
                            {currentLang !== 'ORIGINAL' && (
                                <label style={{ display: 'flex', alignItems: 'center', marginRight: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={showOriginal}
                                        onChange={(e) => setShowOriginal(e.target.checked)}
                                        style={{ marginRight: '4px' }}
                                    />
                                    原文表示
                                </label>
                            )}
                        <Button variant="secondary" size="sm" onClick={() => setShowPrintModal(true)}>🖨️ プレビュー</Button>
                        <Button variant="secondary" size="sm" onClick={() => window.print()}>🖨️ 印刷</Button>
                        <Button variant="secondary" size="sm" onClick={handleDuplicateClick}>複製</Button>

                            {canEdit && (
                                <>
                                    <Button variant="secondary" size="sm" onClick={onEdit}>編集</Button>
                                <Button variant="danger" size="sm" onClick={handleDeleteClick} style={{ marginLeft: '0.5rem' }}>削除</Button>
                            </>
                        )}

                        </div>
                    )}
                    {isDeleted && (
                        <div className="recipe-detail__actions">
                            <Button variant="ghost" size="sm" onClick={handleHardDeleteClick} style={{ color: 'var(--color-danger)', marginRight: 'auto' }}>完全に削除</Button>
                            <Button variant="primary" size="sm" onClick={() => onDelete(recipe, true)}>復元する</Button>
                        </div>
                    )}
                </div>

                <div className="recipe-detail__hero">
                    {displayRecipe.image ? (
                        <img src={displayRecipe.image} alt={displayRecipe.title} className="recipe-detail__image" />
                    ) : (
                        <div className="recipe-detail__image-placeholder" style={{ height: '100%', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                            画像なし
                        </div>
                    )}
                </div>

                <div className="recipe-detail__title-card glass-panel">
                    <h1>{renderText(displayRecipe.title, recipe.title)}</h1>
                    <p className="recipe-detail__desc">{renderText(displayRecipe.description, recipe.description, true)}</p>
                    {user?.role === 'admin' && ownerLabel && (
                        <div className="recipe-detail__owner">
                            👤 作成者: {ownerLabel}
                        </div>
                    )}
                    <div className="recipe-detail__meta">
                        {displayRecipe.course && (
                            <div className="meta-item">
                                <span className="meta-label">コース</span>
                                <span className="meta-value">{renderText(displayRecipe.course, recipe.course)}</span>
                            </div>
                        )}
                        {displayRecipe.category && (
                            <div className="meta-item">
                                <span className="meta-label">カテゴリー</span>
                                <span className="meta-value">{renderText(displayRecipe.category, recipe.category)}</span>
                            </div>
                        )}
                        {displayRecipe.storeName && (
                            <div className="meta-item">
                                <span className="meta-label">店舗名</span>
                                <span className="meta-value">{renderText(displayRecipe.storeName, recipe.storeName)}</span>
                            </div>
                        )}
                        <div className="meta-item">
                            <span className="meta-label">分量</span>
                            <span className="meta-value">{displayRecipe.servings}人分</span>
                        </div>
                    </div>

                    {displayRecipe.sourceUrl && (
                        <div className="print-qr-container" style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.85rem' }}>
                                <a href={displayRecipe.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    🔗 <span className="screen-only">元レシピを見る</span>
                                    <span className="print-only">元のレシピを見る</span>
                                </a>
                            </div>
                            {/* QR Code */}
                            <div style={{ background: 'white', padding: '4px', width: 'fit-content' }}>
                                <QRCode value={displayRecipe.sourceUrl} size={128} style={{ display: 'block' }} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="recipe-detail-dates" style={{ marginTop: '0.5rem', marginBottom: '1.5rem', borderTop: 'none', paddingRight: '0.5rem' }}>
                    <span>📅 登録: {formatDate(recipe.created_at)}</span>
                    {recipe.updated_at && <span>🔄 更新: {formatDate(recipe.updated_at)}</span>}
                </div>

                <div className="recipe-detail__content">
                    <div className="recipe-detail__main">
                        <section className="detail-section">
                            <h2>材料</h2>
                            <Card className="ingredients-card">
                                {displayRecipe.type === 'bread' ? (
                                    <div className="bread-detail-view">
                                        {/* Helper for total calculation */}
                                        {(() => {
                                            const flours = costAdjustedRecipe.flours || [];
                                            const others = costAdjustedRecipe.breadIngredients || [];
                                            const totalFlour = flours.reduce((sum, f) => sum + (parseFloat(f.quantity) || 0), 0);
                                            const grandTotal = totalFlour + others.reduce((sum, o) => sum + (parseFloat(o.quantity) || 0), 0);
                                            const totalPercent = totalFlour ? (grandTotal / totalFlour * 100).toFixed(1) : '0.0';

                                            const calcPercent = (q) => totalFlour ? ((parseFloat(q) || 0) / totalFlour * 100).toFixed(1) : '0.0';

                                            // Scaling logic
                                            const target = parseFloat(targetTotal);
                                            const scaleFactor = (target && grandTotal) ? (target / grandTotal) : 1;

                                            const getScaledQty = (q) => {
                                                if (!target) return q;
                                                return ((parseFloat(q) || 0) * scaleFactor).toFixed(1);
                                            };
                                            const getScaledCost = (c) => {
                                                const raw = parseFloat(c) || 0;
                                                if (!target) return raw;
                                                const scaled = raw * scaleFactor;
                                                return Math.round(scaled * 100) / 100;
                                            };
                                            const formatCost = (value) => {
                                                if (!Number.isFinite(value)) return '-';
                                                return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
                                            };

                                            return (
                                                <>
                                                    {/* Scaling Controls */}
                                                    <div className="screen-only" style={{
                                                        background: '#f1f3f5',
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '6px',
                                                        marginBottom: '1rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem 1rem', // Smaller row gap
                                                        flexWrap: 'wrap',
                                                        border: '1px solid #dee2e6',
                                                        lineHeight: 1.2
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#000' }}>現在の総重量:</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#000' }}>{grandTotal.toLocaleString()}g</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#444' }}>({totalPercent}%)</span>
                                                        </div>
                                                        <div style={{ height: '16px', width: '1px', background: '#adb5bd' }}></div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <label htmlFor="target-total-input" style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#000' }}>仕上がり総重量:</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <input
                                                                    id="target-total-input"
                                                                    type="number"
                                                                    value={targetTotal}
                                                                    onChange={(e) => setTargetTotal(e.target.value)}
                                                                    placeholder="1000"
                                                                    style={{
                                                                        padding: '2px 20px 2px 6px',
                                                                        width: '80px',
                                                                        borderRadius: '4px',
                                                                        border: '1.5px solid #333',
                                                                        fontSize: '0.9rem',
                                                                        fontWeight: 'bold',
                                                                        textAlign: 'right',
                                                                        color: '#000',
                                                                        backgroundColor: '#fff'
                                                                    }}
                                                                />
                                                                <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#333' }}>g</span>
                                                            </div>
                                                            {targetTotal && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setTargetTotal('')}
                                                                    style={{ padding: '0 4px', fontSize: '0.7rem', color: '#555', height: '22px', border: '1px solid #dee2e6' }}
                                                                >
                                                                    リセット
                                                                </Button>
                                                            )}
                                                        </div>
                                                        {targetTotal && (
                                                            <div style={{ fontSize: '0.75rem', color: '#000', fontWeight: 'bold', marginLeft: 'auto' }}>
                                                                ← 倍率: ×{scaleFactor.toFixed(3)} で計算中
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="bread-section" style={{ marginBottom: '2rem' }}>
                                                        <h3 style={{
                                                            fontSize: '1.2rem',
                                                            borderLeft: '4px solid var(--color-primary)',
                                                            paddingLeft: '10px',
                                                            marginBottom: '1rem',
                                                            marginTop: 0,
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            color: 'var(--color-text-main)'
                                                        }}>
                                                            <span>粉グループ</span>
                                                            <span style={{ fontSize: '0.9rem', background: 'var(--color-primary)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold' }}>Total: {targetTotal ? getScaledQty(totalFlour) : totalFlour}g (100%)</span>
                                                        </h3>
                                                        <table className="ingredients-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>材料名</th>
                                                                    <th style={{ textAlign: 'right' }}>分量 (g)</th>
                                                                    <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>仕入れ</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>原価</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {flours.map((item, i) => {
                                                                    const originalItem = recipe.flours?.[i] || {};
                                                                    return (
                                                                        <tr key={i}>
                                                                            <td>
                                                                                <div className="ingredient-name">
                                                                                    <input type="checkbox" id={`flour-${i}`} />
                                                                                    <label htmlFor={`flour-${i}`}>{renderText(item.name, originalItem?.name)}</label>
                                                                                </div>
                                                                            </td>
                                                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                                                {targetTotal ? (
                                                                                    <span style={{ color: 'var(--color-primary)' }}>{getScaledQty(item.quantity)}</span>
                                                                                ) : (
                                                                                    item.quantity
                                                                                )}
                                                                            </td>
                                                                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                                                                {calcPercent(item.quantity)}%
                                                                            </td>
                                                                            <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                                            <td style={{ textAlign: 'right' }}>
                                                                                {item.cost ? `¥${formatCost(getScaledCost(item.cost))}` : '-'}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="bread-section" style={{ marginTop: '3rem' }}>
                                                        <h3 style={{
                                                            fontSize: '1.2rem',
                                                            borderLeft: '4px solid #f39c12',
                                                            paddingLeft: '10px',
                                                            marginBottom: '1rem',
                                                            color: 'var(--color-text-main)'
                                                        }}>
                                                            その他材料
                                                        </h3>
                                                        <table className="ingredients-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>材料名</th>
                                                                    <th style={{ textAlign: 'right' }}>分量 (g)</th>
                                                                    <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>仕入れ</th>
                                                                    <th style={{ textAlign: 'right', width: '80px' }}>原価</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {others.map((item, i) => {
                                                                    const originalItem = recipe.breadIngredients?.[i] || {};
                                                                    return (
                                                                        <tr key={i}>
                                                                            <td>
                                                                                <div className="ingredient-name">
                                                                                    <input type="checkbox" id={`ingredient-${i}`} />
                                                                                    <label htmlFor={`ingredient-${i}`}>{renderText(item.name, originalItem?.name)}</label>
                                                                                </div>
                                                                            </td>
                                                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                                                {targetTotal ? (
                                                                                    <span style={{ color: 'var(--color-primary)' }}>{getScaledQty(item.quantity)}</span>
                                                                                ) : (
                                                                                    item.quantity
                                                                                )}
                                                                            </td>
                                                                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>
                                                                                {calcPercent(item.quantity)}%
                                                                            </td>
                                                                            <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                                            <td style={{ textAlign: 'right' }}>
                                                                                {item.cost ? `¥${formatCost(getScaledCost(item.cost))}` : '-'}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>

                                                        <div className="cost-summary">
                                                            <span className="cost-summary__label">合計原価:</span>
                                                            <span className="cost-summary__value">
                                                                ¥{(() => {
                                                                    // Calculate Total Tax Included
                                                                    // Iterate all items, apply tax rate per item, then sum
                                                                    // Note: 'item.cost' is Tax Excluded unit cost * qty? No, in bread form logic:
                                                                    // item.cost = (qty/1000 * purchaseCost). This is Tax Excluded Total for that item.

                                                                    const calcTaxedCost = (items) => {
                                                                        return items.reduce((sum, item) => {
                                                                            const rawCost = parseFloat(item.cost) || 0;
                                                                            const taxRate = getItemTaxRate(item);
                                                                            // Scale applies to the raw cost (which depends on Quantity)
                                                                            const scaledCost = rawCost * scaleFactor;
                                                                            return sum + (scaledCost * taxRate);
                                                                        }, 0);
                                                                    }

                                                                    const totalTaxIncluded = calcTaxedCost(flours) + calcTaxedCost(others);
                                                                    return Math.round(totalTaxIncluded).toLocaleString();
                                                                })()}

                                                            </span>
                                                            <span className="cost-summary__note">(税込)</span>
                                                        </div>

                                                        {/* Profit Calculator for Bread */}
                                                        {(() => {
                                                            const calcTaxedCost = (items) => {
                                                                return items.reduce((sum, item) => {
                                                                    const rawCost = parseFloat(item.cost) || 0;
                                                                    const taxRate = getItemTaxRate(item);
                                                                    const scaledCost = rawCost * scaleFactor;
                                                                    return sum + (scaledCost * taxRate);
                                                                }, 0);
                                                            }
                                                            const total = calcTaxedCost(flours) + calcTaxedCost(others);
                                                            return renderProfitCalculator(total);
                                                        })()}
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <>
                                        {/* Normal Recipe Scaling UI */}
                                        <div className="screen-only no-print" style={{
                                            background: '#f8f9fa',
                                            color: '#333',
                                            padding: '0.8rem',
                                            borderRadius: '6px',
                                            marginBottom: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            border: '1px solid #e9ecef'
                                        }}>
                                            <label htmlFor="multiplier-input" style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#333' }}>分量倍率:</label>
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', marginRight: '4px', color: '#333' }}>×</span>
                                                <input
                                                    id="multiplier-input"
                                                    type="number"
                                                    min="0.1"
                                                    step="0.1"
                                                    value={multiplier}
                                                    onChange={(e) => setMultiplier(e.target.value)}
                                                    style={{
                                                        width: '60px',
                                                        padding: '4px',
                                                        fontSize: '1rem',
                                                        fontWeight: 'bold',
                                                        textAlign: 'center',
                                                        borderRadius: '4px',
                                                        border: '1px solid #ced4da',
                                                        background: '#fff',
                                                        color: '#333'
                                                    }}
                                                />
                                            </div>
                                            {parseFloat(multiplier) !== 1 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setMultiplier('1')}
                                                    style={{
                                                        fontSize: '0.8rem',
                                                        padding: '2px 8px',
                                                        height: 'auto',
                                                        color: '#555',
                                                        borderColor: '#ccc',
                                                        background: '#fff'
                                                    }}
                                                >
                                                    リセット
                                                </Button>
                                            )}
                                        </div>

                                        {(() => {
                                            // Grouping Logic
                                            const groups = displayRecipe.ingredientGroups && displayRecipe.ingredientGroups.length > 0
                                                ? displayRecipe.ingredientGroups
                                                : null;

                                            if (groups) {
                                                return groups.map((group) => {
                                                    const groupIngredients = ingredients.filter(ing => ing.groupId === group.id);
                                                    if (groupIngredients.length === 0) return null;

                                                    if (['作り方', 'Steps', 'Method', '手順'].includes(group.name)) return null;

                                                    return (
                                                        <div key={group.id} style={{ marginBottom: '1.5rem' }}>
                                                            <h3 style={{
                                                                fontSize: '1rem',
                                                                borderBottom: '2px solid var(--color-border)',
                                                                paddingBottom: '0.5rem',
                                                                marginBottom: '0.5rem',
                                                                marginTop: '0.5rem',
                                                                color: 'var(--color-text-main)',
                                                                display: ['材料', 'Ingredients', 'ingredients'].includes(group.name) ? 'none' : 'block'
                                                            }}>
                                                                {group.name}
                                                            </h3>
                                                            <table className="ingredients-table">
                                                                <thead>
                                                                    <tr>
                                                                        <th style={{ width: '40%' }}>材料名</th>
                                                                        <th style={{ width: '20%', textAlign: 'right', paddingRight: '0.5rem' }}>分量</th>
                                                                        <th style={{ width: '15%', paddingLeft: '0.5rem' }}>単位</th>
                                                                        <th style={{ width: '15%', textAlign: 'right' }}>仕入れ</th>
                                                                        <th style={{ width: '15%', textAlign: 'right' }}>原価</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {groupIngredients.map((ing, i) => {
                                                                        const originalIndex = ingredients.indexOf(ing);
                                                                        const originalIng = recipe.ingredients?.[originalIndex];
                                                                        const displayRef = typeof ing === 'string' ? ing : ing.name;
                                                                        const originalRef = originalIng ? (typeof originalIng === 'string' ? originalIng : originalIng.name) : '';

                                                                        const scaledQty = getScaledQty(ing.quantity, multiplier);
                                                                        const scaledCost = getScaledCost(ing.cost, multiplier);
                                                                        const isScaled = String(multiplier) !== '1';

                                                                        return (
                                                                            <tr key={i} className="ingredient-row">
                                                                                <td>
                                                                                    <div className="ingredient-name">
                                                                                        <input type="checkbox" id={`ing-${group.id}-${i}`} />
                                                                                        <label htmlFor={`ing-${group.id}-${i}`}>{renderText(displayRef, originalRef)}</label>
                                                                                    </div>
                                                                                </td>
                                                                                <td style={{ textAlign: 'right', paddingRight: '0.5rem', fontWeight: isScaled ? 'bold' : 'normal', color: isScaled ? 'var(--color-primary)' : 'inherit' }}>
                                                                                    {scaledQty}
                                                                                </td>
                                                                                <td style={{ paddingLeft: '0.5rem' }}>{ing.unit}</td>
                                                                                <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{ing.purchaseCost ? `¥${ing.purchaseCost}` : '-'}</td>
                                                                                <td style={{ textAlign: 'right' }}>
                                                                                    {scaledCost ? `¥${scaledCost}` : '-'}
                                                                                    {isTax10Item(ing) && <span style={{ fontSize: '0.7em', color: '#d35400', marginLeft: '2px' }}>(税10%)</span>}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    );
                                                });
                                            }

                                            // Fallback: Legacy Flat View
                                            return (
                                                <>
                                                    <table className="ingredients-table">
                                                        <thead>
                                                            <tr>
                                                                <th style={{ width: '40%' }}>材料名</th>
                                                                <th style={{ width: '20%', textAlign: 'right', paddingRight: '0.5rem' }}>分量</th>
                                                                <th style={{ width: '15%', paddingLeft: '0.5rem' }}>単位</th>
                                                                <th style={{ width: '15%', textAlign: 'right' }}>仕入れ</th>
                                                                <th style={{ width: '15%', textAlign: 'right' }}>原価</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {ingredients.map((ing, i) => {
                                                                const originalIng = recipe.ingredients?.[i];
                                                                const displayRef = typeof ing === 'string' ? ing : ing.name;
                                                                const originalRef = originalIng ? (typeof originalIng === 'string' ? originalIng : originalIng.name) : '';

                                                                const scaledQty = getScaledQty(ing.quantity, multiplier);
                                                                const scaledCost = getScaledCost(ing.cost, multiplier);
                                                                const isScaled = String(multiplier) !== '1';

                                                                return (
                                                                    <tr key={i} className="ingredient-row">
                                                                        <td>
                                                                            <div className="ingredient-name">
                                                                                <input type="checkbox" id={`ing-${i}`} />
                                                                                <label htmlFor={`ing-${i}`}>{renderText(displayRef, originalRef)}</label>
                                                                            </div>
                                                                        </td>
                                                                        <td style={{ textAlign: 'right', paddingRight: '0.5rem', fontWeight: isScaled ? 'bold' : 'normal', color: isScaled ? 'var(--color-primary)' : 'inherit' }}>
                                                                            {scaledQty}
                                                                        </td>
                                                                        <td style={{ paddingLeft: '0.5rem' }}>{ing.unit}</td>
                                                                        <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{ing.purchaseCost ? `¥${ing.purchaseCost}` : '-'}</td>
                                                                        <td style={{ textAlign: 'right' }}>
                                                                            {scaledCost ? `¥${scaledCost}` : '-'}
                                                                            {isTax10Item(ing) && <span style={{ fontSize: '0.7em', color: '#d35400', marginLeft: '2px' }}>(税10%)</span>}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                    <div className="cost-summary">
                                                        <span className="cost-summary__label">合計原価:</span>
                                                        <span className="cost-summary__value">
                                                            ¥{(() => {
                                                                const calcTaxedCostInternal = (items) => {
                                                                    return items.reduce((sum, item) => {
                                                                        const rawCost = parseFloat(item.cost) || 0;
                                                                        const taxRate = getItemTaxRate(item);
                                                                        const scaledCost = getScaledCost(rawCost, multiplier);
                                                                        const scCostVal = parseFloat(scaledCost) || 0;
                                                                        return sum + (scCostVal * taxRate);
                                                                    }, 0);
                                                                }
                                                                return Math.round(calcTaxedCostInternal(ingredients)).toLocaleString();
                                                            })()}
                                                        </span>
                                                    </div>
                                                </>
                                            );
                                        })()}

                                        <div className="screen-only no-print">
                                            <div className="cost-summary">
                                                <span className="cost-summary__label">合計原価:</span>
                                                <span className="cost-summary__value">
                                                    ¥{(() => {
                                                        const calcTaxedCostInternal = (items) => {
                                                            return items.reduce((sum, item) => {
                                                                const rawCost = parseFloat(item.cost) || 0;
                                                                const taxRate = getItemTaxRate(item);
                                                                const scaledCost = getScaledCost(rawCost, multiplier);
                                                                const scCostVal = parseFloat(scaledCost) || 0;
                                                                return sum + (scCostVal * taxRate);
                                                            }, 0);
                                                        }
                                                        return Math.round(calcTaxedCostInternal(ingredients)).toLocaleString();
                                                    })()}
                                                </span>
                                                <span className="cost-summary__note">(税込)</span>
                                            </div>
                                        </div>
                                        <p className="recipe-detail__subtle recipe-detail__tax-footnote">※原価は材料ごとに税率(8% or 10%)を適用</p>

                                        {(() => {
                                            const calcTaxedCostInternal = (items) => {
                                                return items.reduce((sum, item) => {
                                                    const rawCost = parseFloat(item.cost) || 0;
                                                    const taxRate = getItemTaxRate(item);
                                                    const scaledCost = parseFloat(getScaledCost(rawCost, multiplier)) || 0;
                                                    return sum + (scaledCost * taxRate);
                                                }, 0);
                                            }
                                            const total = calcTaxedCostInternal(ingredients);
                                            return renderProfitCalculator(total);
                                        })()}
                                    </>
                                )}
                            </Card>
                        </section>
                        <section className="detail-section">
                            <h2>作り方</h2>
                            {(() => {
                                const stepGroups = displayRecipe.stepGroups && displayRecipe.stepGroups.length > 0 ? displayRecipe.stepGroups : null;
                                const hasGroupedSteps = stepGroups && steps.some(s => {
                                    if (!s || typeof s !== 'object' || !s.groupId) return false;
                                    return stepGroups.some(g => g.id === s.groupId);
                                });

                                if (stepGroups && hasGroupedSteps) {
                                    return (
                                        <div className="steps-container">
                                            {stepGroups.map(group => {
                                                const groupSteps = steps.filter(s => {
                                                    const sGroupId = typeof s === 'object' ? s.groupId : null;
                                                    return sGroupId === group.id;
                                                });

                                                if (groupSteps.length === 0) return null;

                                                return (
                                                    <div key={group.id} className="step-group" style={{ marginBottom: '2rem' }}>
                                                        {/* Skip redundant group headers */}
                                                        {group.name !== '作り方' && group.name !== 'Steps' && (
                                                            <h3 style={{
                                                                fontSize: '1.1rem',
                                                                marginBottom: '1rem',
                                                                color: 'var(--color-text-main)',
                                                                borderLeft: '4px solid var(--color-primary)',
                                                                paddingLeft: '10px'
                                                            }}>
                                                                {group.name}
                                                            </h3>
                                                        )}
                                                        <div className="steps-list">
                                                            {groupSteps.map((step, i) => {
                                                                // Find original index relative to full list for correct translation mapping logic if needed
                                                                const originalIndex = steps.indexOf(step);
                                                                const stepText = typeof step === 'object' ? step.text : step;
                                                                const originalStep = recipe.steps?.[originalIndex];
                                                                const originalText = typeof originalStep === 'object' ? originalStep.text : originalStep;

                                                                // Strip HTML tags for safety and clean print
                                                                const cleanText = (txt) => {
                                                                    if (!txt) return '';
                                                                    return txt.replace(/<[^>]*>?/gm, '');
                                                                };

                                                                return (
                                                                    <Card
                                                                        key={i}
                                                                        className={`step-card ${completedSteps.has(originalIndex) ? 'is-completed' : ''}`}
                                                                        onClick={() => toggleStep(originalIndex)}
                                                                    >
                                                                        <div className="step-number">{originalIndex + 1}</div>
                                                                        <p className="step-text">{renderText(cleanText(stepText), cleanText(originalText), true)}</p>
                                                                    </Card>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                }

                                // Legacy Flat List
                                return (
                                    <div className="steps-list">
                                        {steps.map((step, i) => {
                                            const stepText = typeof step === 'object' ? step.text : step;
                                            const originalStep = recipe.steps?.[i];
                                            const originalText = typeof originalStep === 'object' ? originalStep.text : originalStep;

                                            return (
                                                <Card
                                                    key={i}
                                                    className={`step-card ${completedSteps.has(i) ? 'is-completed' : ''}`}
                                                    onClick={() => toggleStep(i)}
                                                >
                                                    <div className="step-number">{i + 1}</div>
                                                    <p className="step-text">{renderText(stepText, originalText, true)}</p>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </section>
                    </div>
                </div >

                {/* 印刷プレビューモーダル */}
                <Modal
                    isOpen={showPrintModal}
                    onClose={() => setShowPrintModal(false)}
                    title="🖨️ レシピプレビュー"
                    size="large"
                >
                    <div className="print-preview-recipe">
                        {/* ヘッダー */}
                        <div className="preview-header">
                            <h2>{displayRecipe.title}</h2>
                            {/* プレビューではレシピ画像を表示しない */}
                        </div>

                        {/* メタ情報 */}
                        <div className="preview-meta">
                            {displayRecipe.course && <div><strong>コース:</strong> {displayRecipe.course}</div>}
                            {displayRecipe.category && <div><strong>カテゴリー:</strong> {displayRecipe.category}</div>}
                            {displayRecipe.storeName && <div><strong>店舗名:</strong> {displayRecipe.storeName}</div>}
                            {displayRecipe.servings && <div><strong>分量:</strong> {displayRecipe.servings}人分</div>}
                        </div>

                        {displayRecipe.description && (
                            <div className="preview-description">
                                <p>{displayRecipe.description}</p>
                            </div>
                        )}

                        <div className="preview-controls">
                            {displayRecipe.type === 'bread' ? (
                                <div className="preview-control-row">
                                    <label className="preview-control-label" htmlFor="preview-target-total">
                                        仕上がり総重量(g)
                                    </label>
                                    <input
                                        id="preview-target-total"
                                        className="preview-control-input"
                                        type="number"
                                        value={targetTotal}
                                        onChange={(e) => setTargetTotal(e.target.value)}
                                        placeholder="1000"
                                    />
                                    {targetTotal && (
                                        <button
                                            type="button"
                                            className="preview-control-reset"
                                            onClick={() => setTargetTotal('')}
                                        >
                                            リセット
                                        </button>
                                    )}
                                    {breadPrintContext?.grandTotal ? (
                                        <span className="preview-control-note">
                                            現在: {breadPrintContext.grandTotal.toLocaleString()}g
                                        </span>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="preview-control-row">
                                    <label className="preview-control-label" htmlFor="preview-multiplier">
                                        分量倍率
                                    </label>
                                    <span className="preview-control-mult">×</span>
                                    <input
                                        id="preview-multiplier"
                                        className="preview-control-input"
                                        type="number"
                                        step="0.1"
                                        value={multiplier}
                                        onChange={(e) => setMultiplier(e.target.value)}
                                        placeholder="1"
                                    />
                                    {String(multiplier) !== '1' && (
                                        <button
                                            type="button"
                                            className="preview-control-reset"
                                            onClick={() => setMultiplier('1')}
                                        >
                                            リセット
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 材料 */}
                        <div className="preview-section">
                            <h3>材料</h3>
                            {displayRecipe.type === 'bread' ? (
                                <div className="preview-ingredients-bread">
                                    {/* パンレシピの場合 */}
                                    <div className="bread-group">
                                        <h4>粉グループ</h4>
                                        <table className="preview-table">
                                            <thead>
                                                <tr>
                                                    <th>材料名</th>
                                                    <th style={{ textAlign: 'right' }}>分量</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(costAdjustedRecipe.flours || []).map((item, i) => {
                                                    const itemId = `flour-${i}`;
                                                    const qty = breadPrintContext ? breadPrintContext.getScaledQtyValue(item.quantity) : item.quantity;
                                                    return (
                                                        <tr
                                                            key={i}
                                                            className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                            onClick={() => togglePreviewIngredient(itemId)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    togglePreviewIngredient(itemId);
                                                                }
                                                            }}
                                                        >
                                                            <td>{item.name}</td>
                                                            <td style={{ textAlign: 'right' }}>{qty}g</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="bread-group">
                                        <h4>その他材料</h4>
                                        <table className="preview-table">
                                            <thead>
                                                <tr>
                                                    <th>材料名</th>
                                                    <th style={{ textAlign: 'right' }}>分量</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(costAdjustedRecipe.breadIngredients || []).map((item, i) => {
                                                    const itemId = `bread-${i}`;
                                                    const qty = breadPrintContext ? breadPrintContext.getScaledQtyValue(item.quantity) : item.quantity;
                                                    return (
                                                        <tr
                                                            key={i}
                                                            className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                            onClick={() => togglePreviewIngredient(itemId)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    togglePreviewIngredient(itemId);
                                                                }
                                                            }}
                                                        >
                                                            <td>{item.name}</td>
                                                            <td style={{ textAlign: 'right' }}>{qty}g</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="preview-ingredients-normal">
                                    {(() => {
                                        const groups = displayRecipe.ingredientGroups && displayRecipe.ingredientGroups.length > 0
                                            ? displayRecipe.ingredientGroups
                                            : null;

                                        if (groups) {
                                            return groups.map((group) => {
                                                const groupIngredients = ingredients.filter(ing => ing.groupId === group.id);
                                                if (groupIngredients.length === 0) return null;
                                                if (['作り方', 'Steps', 'Method', '手順'].includes(group.name)) return null;

                                                return (
                                                    <div key={group.id} className="ingredient-group">
                                                        <h4>{group.name}</h4>
                                                        <table className="preview-table preview-table--normal">
                                                            <thead>
                                                                <tr>
                                                                    <th>材料名</th>
                                                                    <th style={{ textAlign: 'right' }}>分量</th>
                                                                    <th>単位</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {groupIngredients.map((ing, i) => {
                                                                    const itemId = `${group.id}-${i}`;
                                                                    const name = typeof ing === 'string' ? ing : ing.name;
                                                                    const qty = typeof ing === 'object' ? getScaledQty(ing.quantity, multiplierValue) : '';
                                                                    const unit = typeof ing === 'object' ? ing.unit : '';
                                                                    return (
                                                                        <tr
                                                                            key={i}
                                                                            className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                                            onClick={() => togglePreviewIngredient(itemId)}
                                                                            role="button"
                                                                            tabIndex={0}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                                    e.preventDefault();
                                                                                    togglePreviewIngredient(itemId);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <td>{name}</td>
                                                                            <td style={{ textAlign: 'right' }}>{qty}</td>
                                                                            <td>{unit}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            });
                                        } else {
                                            return (
                                                <table className="preview-table preview-table--normal">
                                                    <thead>
                                                        <tr>
                                                            <th>材料名</th>
                                                            <th style={{ textAlign: 'right' }}>分量</th>
                                                            <th>単位</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {ingredients.map((ing, i) => {
                                                            const itemId = `ungrouped-${i}`;
                                                            const name = typeof ing === 'string' ? ing : ing.name;
                                                            const qty = typeof ing === 'object' ? getScaledQty(ing.quantity, multiplierValue) : '';
                                                            const unit = typeof ing === 'object' ? ing.unit : '';
                                                            return (
                                                                <tr
                                                                    key={i}
                                                                    className={previewCompletedIngredients.has(itemId) ? 'is-completed' : ''}
                                                                    onClick={() => togglePreviewIngredient(itemId)}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                            e.preventDefault();
                                                                            togglePreviewIngredient(itemId);
                                                                        }
                                                                    }}
                                                                >
                                                                    <td>{name}</td>
                                                                    <td style={{ textAlign: 'right' }}>{qty}</td>
                                                                    <td>{unit}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            );
                                        }
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* 作り方 */}
                        {steps.length > 0 && (
                            <div className="preview-section">
                                <h3>作り方</h3>
                                <ol className="preview-steps">
                                    {steps.map((step, i) => {
                                        const stepText = typeof step === 'object' ? step.text : step;
                                        return (
                                            <li
                                                key={i}
                                                className={previewCompletedSteps.has(i) ? 'is-completed' : ''}
                                                onClick={() => togglePreviewStep(i)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        togglePreviewStep(i);
                                                    }
                                                }}
                                            >
                                                {stepText}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        )}

                        {/* アクションボタン */}
                        <div className="modal-actions">
                            <Button variant="primary" onClick={() => window.print()}>
                                🖨️ 印刷する
                            </Button>
                            <Button variant="ghost" onClick={() => setShowPrintModal(false)}>
                                閉じる
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div >

            <div className="print-layout">
                <div className="recipe-detail__hero">
                    {displayRecipe.image ? (
                        <img src={displayRecipe.image} alt={displayRecipe.title} className="recipe-detail__image" />
                    ) : (
                        <div className="recipe-detail__image-placeholder" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.8rem' }}>
                            No Image
                        </div>
                    )}
                </div>
                <div className="recipe-detail__title-card">
                    <h1>{displayRecipe.title}</h1>
                    {printDescription && (
                        <p className="recipe-detail__desc">{printDescription}</p>
                    )}
                </div>
                <div className="recipe-detail__meta">
                    {displayRecipe.category && (
                        <div className="meta-item">
                            <span className="meta-label">カテゴリ</span>
                            <span className="meta-value">{displayRecipe.category}</span>
                        </div>
                    )}
                    {displayRecipe.storeName && (
                        <div className="meta-item">
                            <span className="meta-label">店舗名</span>
                            <span className="meta-value meta-value--store">{displayRecipe.storeName}</span>
                        </div>
                    )}
                    {displayRecipe.course && (
                        <div className="meta-item">
                            <span className="meta-label">コース</span>
                            <span className="meta-value">{displayRecipe.course}</span>
                        </div>
                    )}
                    {displayRecipe.servings && (
                        <div className="meta-item">
                            <span className="meta-label">分量</span>
                            <span className="meta-value">{displayRecipe.servings}人分</span>
                        </div>
                    )}
                </div>
                <div className="recipe-detail__main">
                    <section className="detail-section">
                        <h2>材料</h2>
                        {displayRecipe.type === 'bread' && breadPrintContext ? (
                            <div>
                                <div className="bread-section" style={{ marginBottom: '1.5rem' }}>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>粉グループ</h3>
                                    <table className="ingredients-table">
                                        <thead>
                                            <tr>
                                                <th>材料名</th>
                                                <th style={{ textAlign: 'right' }}>分量 (g)</th>
                                                <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>仕入れ</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>原価</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {breadPrintContext.flours.map((item, idx) => (
                                                <tr key={`print-flour-${idx}`}>
                                                    <td>{item.name}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                        {breadPrintContext.getScaledQtyValue(item.quantity)}
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#555' }}>
                                                        {breadPrintContext.calcPercent(item.quantity)}%
                                                    </td>
                                                    <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {item.cost ? `¥${breadPrintContext.formatCostValue(item.cost)}` : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="bread-section">
                                    <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>その他材料</h3>
                                    <table className="ingredients-table">
                                        <thead>
                                            <tr>
                                                <th>材料名</th>
                                                <th style={{ textAlign: 'right' }}>分量 (g)</th>
                                                <th style={{ textAlign: 'center', width: '60px' }}>%</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>仕入れ</th>
                                                <th style={{ textAlign: 'right', width: '80px' }}>原価</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {breadPrintContext.others.map((item, idx) => (
                                                <tr key={`print-others-${idx}`}>
                                                    <td>{item.name}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                        {breadPrintContext.getScaledQtyValue(item.quantity)}
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#555' }}>
                                                        {breadPrintContext.calcPercent(item.quantity)}%
                                                    </td>
                                                    <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {item.cost ? `¥${breadPrintContext.formatCostValue(item.cost)}` : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            printIngredientSections.map(section => (
                                <div key={section.id} style={{ marginBottom: '1.2rem' }}>
                                    {section.name && (
                                        <div className="print-group-heading">{section.name}</div>
                                    )}
                                    <table className="ingredients-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '40%' }}>材料名</th>
                                                <th style={{ width: '20%', textAlign: 'right', paddingRight: '0.5rem' }}>分量</th>
                                                <th style={{ width: '15%', paddingLeft: '0.5rem' }}>単位</th>
                                                <th style={{ width: '15%', textAlign: 'right' }}>仕入れ</th>
                                                <th style={{ width: '15%', textAlign: 'right' }}>原価</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {section.items.map((ing, idx) => {
                                                const qty = typeof ing === 'object' ? ing.quantity : '';
                                                const unit = typeof ing === 'object' ? ing.unit : '';
                                                const purchase = typeof ing === 'object' ? ing.purchaseCost : null;
                                                const costVal = typeof ing === 'object' ? ing.cost : null;
                                                const name = typeof ing === 'string' ? ing : ing.name;
                                                const scaledQty = typeof ing === 'object' ? getScaledQty(ing.quantity, multiplierValue) : qty;
                                                return (
                                                    <tr key={`print-ing-${section.id}-${idx}`}>
                                                        <td>{name}</td>
                                                        <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>{scaledQty}</td>
                                                        <td style={{ paddingLeft: '0.5rem' }}>{unit}</td>
                                                        <td className="ingredient-cost-muted" style={{ textAlign: 'right' }}>{purchase ? `¥${purchase}` : '-'}</td>
                                                        <td style={{ textAlign: 'right' }}>{costVal ? `¥${costVal}` : '-'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ))
                        )}
                        <div className="cost-summary">
                            <span className="cost-summary__label">合計原価:</span>
                            <span className="cost-summary__value">¥{printCostTotalDisplay}</span>
                            <span className="cost-summary__note">(税込)</span>
                        </div>
                        <p className="recipe-detail__subtle recipe-detail__tax-footnote">※原価は材料ごとに税率(8% or 10%)を適用</p>
                    </section>
                    <section className="detail-section">
                        <h2>作り方</h2>
                        {steps.length > 0 ? (
                            <div className="steps-list">
                                {steps.map((step, index) => {
                                    const stepText = typeof step === 'object' ? step.text : step;
                                    return (
                                        <div className="step-card" key={`print-step-${index}`}>
                                            <div className="step-number">{index + 1}</div>
                                            <p className="step-text">{stepText}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p style={{ fontSize: '0.9rem', color: '#555' }}>手順情報がありません。</p>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
};
