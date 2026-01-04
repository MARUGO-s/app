import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { translationService } from '../services/translationService';
import { SUPPORTED_LANGUAGES } from '../constants';
import './RecipeDetail.css';

export const RecipeDetail = ({ recipe, onBack, onEdit, onDelete, onHardDelete, isDeleted, onView }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [showHardDeleteConfirm, setShowHardDeleteConfirm] = React.useState(false);
    const [completedSteps, setCompletedSteps] = React.useState(new Set());

    // Translation State
    const [translationCache, setTranslationCache] = React.useState({}); // { [langCode]: recipeObj }
    const [currentLang, setCurrentLang] = React.useState('ORIGINAL'); // 'ORIGINAL' is source text
    const [isTranslating, setIsTranslating] = React.useState(false);

    // ISO duration formatter (PT10M -> 10分)
    const formatDuration = (isoString) => {
        if (!isoString) return '';
        if (!isoString.startsWith('P')) return isoString; // Not ISO format

        try {
            const match = isoString.match(/PT(\d+H)?(\d+M)?/);
            if (!match) return isoString;

            const hours = match[1] ? parseInt(match[1]) : 0;
            const minutes = match[2] ? parseInt(match[2]) : 0;

            if (hours > 0) return `${hours}時間${minutes > 0 ? ` ${minutes}分` : ''}`;
            return `${minutes}分`;
        } catch (e) {
            return isoString;
        }
    };

    // Determines which data to show
    const displayRecipe = currentLang === 'ORIGINAL' ? recipe : (translationCache[currentLang] || recipe);


    const toggleStep = (index) => {
        const next = new Set(completedSteps);
        if (next.has(index)) {
            next.delete(index);
        } else {
            next.add(index);
        }
        setCompletedSteps(next);
    };

    const handleLanguageChange = async (e) => {
        const targetLang = e.target.value;

        if (targetLang === 'ORIGINAL') {
            setCurrentLang('ORIGINAL');
            return;
        }

        // Check cache first
        if (translationCache[targetLang]) {
            setCurrentLang(targetLang);
            return;
        }

        try {
            setIsTranslating(true);
            const translated = await translationService.translateRecipe(recipe, targetLang);
            setTranslationCache(prev => ({ ...prev, [targetLang]: translated }));
            setCurrentLang(targetLang);
        } catch (error) {
            alert("翻訳に失敗しました。");
            console.error(error);
            // Revert to JA if failed
            setCurrentLang('ORIGINAL');
        } finally {
            setIsTranslating(false);
        }
    };

    React.useEffect(() => {
        if (onView && recipe && !isDeleted) {
            onView(recipe.id);
        }
        // Reset translation on recipe change
        setTranslationCache({});
        // Reset translation on recipe change
        setTranslationCache({});
        setCurrentLang('ORIGINAL');
        setCompletedSteps(new Set());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipe.id]);

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

    if (!recipe) return null;

    // Safety check for array rendering
    const ingredients = displayRecipe.ingredients || [];
    const steps = displayRecipe.steps || [];

    return (
        <div className="recipe-detail fade-in">
            {showHardDeleteConfirm && (
                <div className="modal-overlay fade-in" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', border: '2px solid var(--color-danger)' }}>
                        <h3 style={{ marginTop: 0, color: 'var(--color-danger)' }}>⚠️ 完全に削除しますか？</h3>
                        <p style={{ margin: '1rem 0' }}>
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
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem' }}>
                        <h3 style={{ marginTop: 0, color: 'var(--color-danger)' }}>レシピの削除</h3>
                        <p style={{ margin: '1rem 0' }}>
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
                <Button variant="ghost" onClick={onBack} size="sm">← 戻る</Button>
                {!isDeleted && (
                    <div className="recipe-detail__actions">
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
                        <Button variant="secondary" size="sm" onClick={() => window.print()}>🖨️ 印刷 / PDF</Button>
                        <Button variant="secondary" size="sm" onClick={onEdit}>編集</Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteClick} style={{ marginLeft: '0.5rem' }}>削除</Button>
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
                <h1>{displayRecipe.title}</h1>
                <p className="recipe-detail__desc">{displayRecipe.description}</p>
                <div className="recipe-detail__meta">
                    {displayRecipe.course && (
                        <div className="meta-item">
                            <span className="meta-label">コース</span>
                            <span className="meta-value">{displayRecipe.course}</span>
                        </div>
                    )}
                    {displayRecipe.category && (
                        <div className="meta-item">
                            <span className="meta-label">カテゴリー</span>
                            <span className="meta-value">{displayRecipe.category}</span>
                        </div>
                    )}
                    {displayRecipe.prepTime && (
                        <div className="meta-item">
                            <span className="meta-label">準備時間</span>
                            <span className="meta-value">{formatDuration(displayRecipe.prepTime)}</span>
                        </div>
                    )}
                    {displayRecipe.cookTime && (
                        <div className="meta-item">
                            <span className="meta-label">調理時間</span>
                            <span className="meta-value">{formatDuration(displayRecipe.cookTime)}</span>
                        </div>
                    )}
                    <div className="meta-item">
                        <span className="meta-label">分量</span>
                        <span className="meta-value">{displayRecipe.servings}人分</span>
                    </div>
                </div>
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
                                        const calcPercent = (q) => totalFlour ? ((parseFloat(q) || 0) / totalFlour * 100).toFixed(1) : '0.0';

                                        return (
                                            <>
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
                                                        <span style={{ fontSize: '0.9rem', background: 'var(--color-primary)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold' }}>Total: {totalFlour}g (100%)</span>
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
                                                            {flours.map((item, i) => (
                                                                <tr key={`f-${i}`}>
                                                                    <td>{item.name}</td>
                                                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{item.quantity}</td>
                                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-primary)' }}>{calcPercent(item.quantity)}%</td>
                                                                    <td style={{ textAlign: 'right', color: '#666' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                                    <td style={{ textAlign: 'right' }}>{item.cost ? `¥${item.cost}` : '-'}</td>
                                                                </tr>
                                                            ))}
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
                                                            {others.map((item, i) => (
                                                                <tr key={`o-${i}`}>
                                                                    <td>{item.name}</td>
                                                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{item.quantity}</td>
                                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>{calcPercent(item.quantity)}%</td>
                                                                    <td style={{ textAlign: 'right', color: '#666' }}>{item.purchaseCost ? `¥${item.purchaseCost}` : '-'}</td>
                                                                    <td style={{ textAlign: 'right' }}>{item.cost ? `¥${item.cost}` : '-'}</td>
                                                                </tr>
                                                            ))}
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
                                                                return (flourCost + otherCost).toLocaleString();
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
                                            {ingredients.map((ing, i) => (
                                                <tr key={i} className="ingredient-row">
                                                    <td>
                                                        <div className="ingredient-name">
                                                            <input type="checkbox" id={`ing-${i}`} />
                                                            <label htmlFor={`ing-${i}`}>{typeof ing === 'string' ? ing : ing.name}</label>
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>{ing.quantity}</td>
                                                    <td style={{ paddingLeft: '0.5rem' }}>{ing.unit}</td>
                                                    <td style={{ textAlign: 'right', color: '#666' }}>{ing.purchaseCost ? `¥${ing.purchaseCost}` : '-'}</td>
                                                    <td style={{ textAlign: 'right' }}>{ing.cost ? `¥${ing.cost}` : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
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
                                            ¥{ingredients.reduce((sum, ing) => sum + (parseInt(ing.cost) || 0), 0).toLocaleString()}
                                        </span>
                                    </div>
                                </>
                            )}
                        </Card>
                    </section>
                    <section className="detail-section">
                        <h2>作り方</h2>
                        <div className="steps-list">
                            {steps.map((step, i) => (
                                <Card
                                    key={i}
                                    className={`step-card ${completedSteps.has(i) ? 'is-completed' : ''}`}
                                    onClick={() => toggleStep(i)}
                                >
                                    <div className="step-number">{i + 1}</div>
                                    <p className="step-text">{step}</p>
                                </Card>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
