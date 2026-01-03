import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import './RecipeDetail.css';

export const RecipeDetail = ({ recipe, onBack, onEdit, onDelete, onHardDelete, isDeleted }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [showHardDeleteConfirm, setShowHardDeleteConfirm] = React.useState(false);

    if (!recipe) return null;
    // Mock ingredients/steps if not present in simple mock data
    const ingredients = recipe.ingredients || []; // Empty fallback or Japanese sample if needed

    const steps = recipe.steps || [];

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
                {recipe.image ? (
                    <img src={recipe.image} alt={recipe.title} className="recipe-detail__image" />
                ) : (
                    <div className="recipe-detail__image-placeholder" style={{ height: '300px', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                        画像なし
                    </div>
                )}
                <div className="recipe-detail__title-card glass-panel">
                    <h1>{recipe.title}</h1>
                    <p className="recipe-detail__desc">{recipe.description}</p>
                    <div className="recipe-detail__meta">
                        <div className="meta-item">
                            <span className="meta-label">準備時間</span>
                            <span className="meta-value">{recipe.prepTime}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">調理時間</span>
                            <span className="meta-value">{recipe.cookTime}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">分量</span>
                            <span className="meta-value">{recipe.servings}人分</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="recipe-detail__content">
                <div className="recipe-detail__main">
                    <section className="detail-section">
                        <h2>材料</h2>
                        <Card className="ingredients-card">
                            <table className="ingredients-table">
                                <thead>
                                    <tr>
                                        <th className="th-name">材料名</th>
                                        <th className="th-amount">分量</th>
                                        <th className="th-unit">単位</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ingredients.map((ing, i) => (
                                        <tr key={i} className="ingredient-row">
                                            <td className="td-name">
                                                <div className="ingredient-name">
                                                    <input type="checkbox" id={`ing-${i}`} />
                                                    <label htmlFor={`ing-${i}`}>{typeof ing === 'string' ? ing : ing.name}</label>
                                                </div>
                                            </td>
                                            <td className="td-amount">{ing.quantity}</td>
                                            <td className="td-unit">{ing.unit}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    </section>

                    <section className="detail-section">
                        <h2>作り方</h2>
                        <div className="steps-list">
                            {steps.map((step, i) => (
                                <Card key={i} className="step-card">
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
