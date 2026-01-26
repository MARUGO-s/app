import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { translationService } from '../services/translationService';
import { recipeService } from '../services/recipeService';
import { useAuth } from '../contexts/AuthContext';
import { SUPPORTED_LANGUAGES } from '../constants';
import './RecipeDetail.css';
import QRCode from "react-qr-code";

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export const RecipeDetail = ({ recipe, onBack, onEdit, onDelete, onHardDelete, isDeleted, onView, onDuplicate }) => {
    const { user } = useAuth();
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [showDuplicateConfirm, setShowDuplicateConfirm] = React.useState(false);
    const [showHardDeleteConfirm, setShowHardDeleteConfirm] = React.useState(false);
    const [completedSteps, setCompletedSteps] = React.useState(new Set());

    const [translationCache, setTranslationCache] = React.useState({}); // {[langCode]: recipeObj }
    const [currentLang, setCurrentLang] = React.useState('ORIGINAL'); // 'ORIGINAL' is source text
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [showOriginal, setShowOriginal] = React.useState(true); // Default to showing original

    // Scaling State
    const [targetTotal, setTargetTotal] = React.useState(''); // For Bread
    const [multiplier, setMultiplier] = React.useState(1);    // For Normal

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
        const num = parseInt(cost, 10);
        if (isNaN(num)) return cost;
        return Math.round(num * parseFloat(mult)).toString();
    };

    // Determines which data to show
    const displayRecipe = currentLang === 'ORIGINAL' ? recipe : (translationCache[currentLang] || recipe);

    const [isPublic, setIsPublic] = React.useState(recipe.tags?.includes('public') || false);
    const isOwner = user?.id === 'admin' || (recipe.tags && recipe.tags.includes(`owner:${user?.id}`));
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
            await recipeService.updateRecipe({ ...recipe, tags: newTags });

            // Ideally notify update parent, but local state is fine for switch
        } catch (e) {
            console.error("Failed to toggle public", e);
            alert("公開設定の変更に失敗しました");
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

    // ... (toggleStep, handleLanguageChange kept same)

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
        // Reset public state based on new recipe
        setIsPublic(recipe.tags?.includes('public') || false);

        // Revert title on unmount or recipe change
        return () => {
            document.title = originalTitle;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipe.id, recipe.title]);

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
            alert("複製に失敗しました。");
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

    if (!recipe) return null;

    // Safety check for array rendering
    const ingredients = displayRecipe.ingredients || [];
    const steps = displayRecipe.steps || [];

    return (
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
                <Button variant="secondary" onClick={onBack} size="sm">← 戻る</Button>
                {!isDeleted && (
                    <div className="recipe-detail__actions">

                        {/* Public Toggle (Owner Only) */}
                        {canEdit && (user?.id === 'yoshito' || user?.id === 'admin') && (
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
                        <Button variant="secondary" size="sm" onClick={() => {
                            // Check for iOS Standalone mode (Home Screen app)
                            const isIOSStandalone = window.navigator.standalone === true;
                            if (isIOSStandalone) {
                                alert("iPhoneのホーム画面アプリモードでは印刷がサポートされていません。\nSafariで開き直してから印刷してください。");
                                return;
                            }
                            window.print();
                        }}>🖨️ 印刷 / PDF</Button>
                        <Button variant="secondary" size="sm" onClick={handleDuplicateClick}>複製</Button>

                        {canEdit && (
                            <>
                                <Button variant="secondary" size="sm" onClick={onEdit}>編集</Button>
                                <Button variant="danger" size="sm" onClick={handleDeleteClick} style={{ marginLeft: '0.5rem' }}>削除</Button>
                            </>
                        )}
                        <Button variant="primary" size="sm">クッキングモード</Button>
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
                            <QRCode value={displayRecipe.sourceUrl} size={64} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
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
                                        const flours = displayRecipe.flours || [];
                                        const others = displayRecipe.breadIngredients || [];
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
                                                                        <td style={{ textAlign: 'right', color: '#666' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                                        <td style={{ textAlign: 'right' }}>{item.cost ? `¥${item.cost}` : '-'}</td>
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
                                                                        <td style={{ textAlign: 'right', color: '#666' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                                        <td style={{ textAlign: 'right' }}>{item.cost ? `¥${item.cost}` : '-'}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>

                                                    <div style={{
                                                        marginTop: '2rem',
                                                        padding: '1rem',
                                                        background: 'var(--color-bg-surface)',
                                                        borderRadius: 'var(--radius-md)',
                                                        border: '1px solid var(--color-border)',
                                                        display: 'flex',
                                                        justifyContent: 'flex-end',
                                                        alignItems: 'center',
                                                        gap: '1rem'
                                                    }}>
                                                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>合計原価:</span>
                                                        <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                                            ¥{(() => {
                                                                const flourCost = flours.reduce((sum, item) => sum + (parseInt(item.cost) || 0), 0);
                                                                const otherCost = others.reduce((sum, item) => sum + (parseInt(item.cost) || 0), 0);
                                                                const total = flourCost + otherCost;
                                                                return Math.round(total * scaleFactor).toLocaleString();
                                                            })()}
                                                        </span>
                                                    </div>
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
                                                                    // Find original index for reference
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
                                                                            <td style={{ textAlign: 'right', color: '#666' }}>{ing.purchaseCost ? `¥${ing.purchaseCost}` : '-'}</td>
                                                                            <td style={{ textAlign: 'right' }}>{scaledCost ? `¥${scaledCost}` : '-'}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            });
                                        }

                                        // Legacy Flat View
                                        return (
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
                                                                <td style={{ textAlign: 'right', color: '#666' }}>{ing.purchaseCost ? `¥${ing.purchaseCost}` : '-'}</td>
                                                                <td style={{ textAlign: 'right' }}>{scaledCost ? `¥${scaledCost}` : '-'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        );
                                    })()}
                                    <div style={{
                                        marginTop: '1.5rem',
                                        paddingTop: '1rem',
                                        borderTop: '2px dashed var(--color-border)',
                                        display: 'flex',
                                        justifyContent: 'flex-end',
                                        alignItems: 'center',
                                        gap: '1rem'
                                    }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>合計原価:</span>
                                        <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                            ¥{ingredients.reduce((sum, ing) => sum + (parseInt(getScaledCost(ing.cost, multiplier), 10) || 0), 0).toLocaleString()}
                                        </span>
                                    </div>
                                </>
                            )}
                        </Card>
                    </section>
                    <section className="detail-section">
                        <h2>作り方</h2>
                        {(() => {
                            const stepGroups = displayRecipe.stepGroups && displayRecipe.stepGroups.length > 0 ? displayRecipe.stepGroups : null;

                            if (stepGroups) {
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
        </div >
    );
};
