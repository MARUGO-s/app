import React, { useState, useEffect, useCallback, useRef } from 'react';
import { plannerService } from '../services/plannerService';
import { recipeService } from '../services/recipeService'; // Need access to recipes
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import './Planner.css';

const getMealQtyStr = (meal) => {
    const { totalWeight, multiplier } = meal || {};
    if (totalWeight) return `${totalWeight}g`;
    if (multiplier && multiplier !== 1) return `x${multiplier}`;
    return '';
};

// Draggable Recipe Item
const DraggableRecipe = ({ recipe }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `recipe-${recipe.id}`,
        data: { recipe }
    });

    const style = isDragging
        ? { opacity: 0.35 }
        : transform
            ? {
                transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
                position: 'relative',
                zIndex: 999
            }
            : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="draggable-recipe">
            {recipe.title}
        </div>
    );
};

// Draggable Meal Item (for moving existing plans)
const DraggableMeal = ({ meal, dateStr, children }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `meal-${meal.id}`,
        data: { meal, dateStr, type: 'meal' } // Pass dateStr to know source
    });

    const style = isDragging
        ? { opacity: 0.35 }
        : transform
            ? {
                transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
                position: 'relative',
                zIndex: 999
            }
            : undefined;

    const qtyStr = getMealQtyStr(meal);

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="draggable-meal-wrapper">
            {children}
            {qtyStr && (
                <div style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: '#666',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    padding: '0 2px',
                    borderRadius: '2px',
                    pointerEvents: 'none' // Click through to whatever
                }}>
                    {qtyStr}
                </div>
            )}
        </div>
    );
};

// Droppable Calendar Cell
const CalendarCell = ({ dateStr, dayNum, isToday, isOutside, children }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: `date-${dateStr}`,
        data: { dateStr }
    });

    return (
        <div
            ref={setNodeRef}
            className={`calendar-cell ${isToday ? 'today' : ''} ${isOutside ? 'outside-month' : ''}`}
            style={{ backgroundColor: isOver ? '#ffe0b2' : undefined }}
        >
            <div className="day-number">{dayNum}</div>
            {children}
        </div>
    );
};

// Helper for date formatting (YYYY-MM-DD)
const formatDateStr = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const Planner = ({ onBack, onSelectRecipe, onNavigateToOrderList }) => {
    const { user } = useAuth();
    const toast = useToast();
    const toastRef = useRef(toast);
    const [recipes, setRecipes] = useState([]);
    const [plans, setPlans] = useState({});
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingMeal, setDeletingMeal] = useState(null);

    const [showQuantityModal, setShowQuantityModal] = useState(false);
    const [pendingDrop, setPendingDrop] = useState(null); // { type: 'new'|'move', ...data }
    const [inputMultiplier, setInputMultiplier] = useState(1);
    const [inputTotalWeight, setInputTotalWeight] = useState('');
    const [activeDrag, setActiveDrag] = useState(null);

    // Bulk Delete State
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [deleteStartDate, setDeleteStartDate] = useState(formatDateStr(new Date()));
    const [deleteEndDate, setDeleteEndDate] = useState(formatDateStr(new Date()));

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 6,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 70,
                tolerance: 8,
            },
        }),
    );

    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);

    const flushPlannerWarnings = useCallback(() => {
        const warnings = plannerService.consumeWarnings?.() || [];
        if (warnings.length === 0) return;
        [...new Set(warnings)].forEach((message) => {
            toastRef.current.warning(message);
        });
    }, []);

    const loadData = useCallback(async () => {
        if (!user) {
            setRecipes([]);
            setPlans({});
            return;
        }

        let fetchedRecipes = [];
        try {
            fetchedRecipes = await recipeService.fetchRecipes(user);
        } catch (error) {
            console.error('Planner: failed to fetch recipes', error);
            toastRef.current.error('レシピの読み込みに失敗しました');
            fetchedRecipes = [];
        }

        setRecipes(fetchedRecipes);
        if (user?.id) {
            try {
                let nextPlans;
                // Guard: avoid cleanup when recipe fetch fails (0 items), otherwise all plans can be removed.
                if (Array.isArray(fetchedRecipes) && fetchedRecipes.length > 0) {
                    const validIds = fetchedRecipes.map((x) => x.id);
                    nextPlans = await plannerService.cleanupInvalidPlans(user.id, validIds);
                } else {
                    nextPlans = await plannerService.getAll(user.id);
                }
                setPlans(nextPlans);
            } finally {
                flushPlannerWarnings();
            }
        }
    }, [flushPlannerWarnings, user]);

    useEffect(() => {
        // Avoid calling setState synchronously inside an effect body.
        const t = setTimeout(() => {
            void loadData();
        }, 0);
        return () => clearTimeout(t);
    }, [loadData]);

    const handleDragStart = useCallback((event) => {
        const active = event?.active;
        if (!active?.id) {
            setActiveDrag(null);
            return;
        }

        const activeId = String(active.id);
        if (activeId.startsWith('recipe-')) {
            const recipe = active.data.current?.recipe;
            setActiveDrag({
                kind: 'recipe',
                title: recipe?.title || 'レシピ',
                qtyStr: '',
            });
            return;
        }

        if (activeId.startsWith('meal-')) {
            const meal = active.data.current?.meal;
            const recipe = recipes.find((r) => r.id === meal?.recipeId);
            setActiveDrag({
                kind: 'meal',
                title: recipe?.title || 'Unknown',
                qtyStr: getMealQtyStr(meal),
            });
            return;
        }

        setActiveDrag(null);
    }, [recipes]);

    const handleDragCancel = useCallback(() => {
        setActiveDrag(null);
    }, []);

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        try {
            if (!over) return;

            if (over.id.startsWith('date-')) {
                const targetDateStr = over.data.current.dateStr;

                // Case 1: Dragging a Recipe from Sidebar (New)
                if (active.id.startsWith('recipe-')) {
                    const recipe = active.data.current.recipe;
                    // Open modal to ask for Details
                    setPendingDrop({
                        type: 'new',
                        recipe,
                        targetDateStr
                    });
                    setInputMultiplier(1);
                    setInputTotalWeight('');
                    setShowQuantityModal(true);
                }
                // Case 2: Dragging an existing Meal (Move)
                else if (active.id.startsWith('meal-')) {
                    const { meal, dateStr: sourceDateStr } = active.data.current;

                    // If dropped on same day, do nothing
                    if (sourceDateStr === targetDateStr) return;

                    // Move logic: Add to target, Remove from source
                    const options = {
                        multiplier: meal.multiplier,
                        totalWeight: meal.totalWeight
                    };

                    await plannerService.addMeal(user.id, targetDateStr, meal.recipeId, meal.type || 'dinner', options);
                    await plannerService.removeMeal(user.id, sourceDateStr, meal.id);
                    loadData();
                }
            }
        } finally {
            setActiveDrag(null);
        }
    };

    const confirmQuantity = async () => {
        if (!pendingDrop) return;
        const { type, recipe, targetDateStr } = pendingDrop;

        if (type === 'new') {
            const options = {};
            if (recipe.type === 'bread') {
                const w = parseFloat(inputTotalWeight);
                options.totalWeight = Number.isFinite(w) ? w : null;
                options.multiplier = 1; // Default
            } else {
                const m = parseFloat(inputMultiplier);
                options.multiplier = Number.isFinite(m) ? m : 1;
                options.totalWeight = null;
            }

            await plannerService.addMeal(user.id, targetDateStr, recipe.id, 'dinner', options);
        }

        setShowQuantityModal(false);
        setPendingDrop(null);
        loadData();
    };

    const cancelQuantity = () => {
        setShowQuantityModal(false);
        setPendingDrop(null);
    };

    const handleDeleteMeal = async (dateStr, mealId, e) => {
        // Prevent drag start when clicking delete
        if (e) e.stopPropagation();

        setDeletingMeal({ dateStr, mealId });
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        if (!deletingMeal) return;

        const { dateStr, mealId } = deletingMeal;
        setShowDeleteConfirm(false);
        setDeletingMeal(null);

        try {
            await plannerService.removeMeal(user.id, dateStr, mealId);
            await loadData();
            toast.success('仕込みを削除しました');
        } catch (error) {
            toast.error('削除に失敗しました');
            console.error('Delete meal error:', error);
        }
    };

    const cancelDelete = () => {
        setShowDeleteConfirm(false);
        setDeletingMeal(null);
    };

    const handleOpenBulkDelete = () => {
        setDeleteStartDate(formatDateStr(new Date()));
        setDeleteEndDate(formatDateStr(new Date()));
        setShowBulkDeleteModal(true);
    };

    const handleBulkDelete = async () => {
        if (!user?.id) return;
        try {
            await plannerService.clearPeriod(user.id, deleteStartDate, deleteEndDate);
            await loadData();
            setShowBulkDeleteModal(false);
            toast.success(`${deleteStartDate}〜${deleteEndDate}の全予定を削除しました`);
        } catch (e) {
            console.error(e);
            toast.error('一括削除に失敗しました');
        }
    };

    // Calendar generation
    const getCalendarDays = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days = [];

        // Prev month padding
        const startPad = firstDay.getDay(); // 0 is Sunday
        for (let i = startPad - 1; i >= 0; i--) {
            const d = new Date(year, month, -i);
            days.push({ date: d, isOutside: true });
        }

        // Current month
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const d = new Date(year, month, i);
            days.push({ date: d, isOutside: false });
        }

        // Next month padding to fill 35 or 42 cells
        const remaining = 42 - days.length; // Ensure 6 rows
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            days.push({ date: d, isOutside: true });
        }

        return days;
    };



    const filteredRecipes = recipes.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()));



    const changeMonth = (delta) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1));
    };

    return (
        <div className={`planner-container fade-in ${activeDrag ? 'dragging' : ''}`}>
            {showDeleteConfirm && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', border: '2px solid var(--color-danger)', backgroundColor: 'white' }}>
                        <h3 style={{ marginTop: 0, color: '#dc3545', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>⚠️</span> 仕込みの削除
                        </h3>
                        <p style={{ margin: '1rem 0', color: '#333' }}>
                            この仕込み予定を削除しますか？<br />
                            <strong>この操作は取り消せません。</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                            <Button variant="ghost" onClick={cancelDelete}>キャンセル</Button>
                            <Button variant="danger" onClick={confirmDelete}>削除する</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Bulk Delete Modal */}
            {showBulkDeleteModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Card style={{ width: '90%', maxWidth: '500px', padding: '1.5rem', border: '2px solid var(--color-danger)', backgroundColor: 'white' }}>
                        <h3 style={{ marginTop: 0, color: '#dc3545', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🗑️</span> 仕込み一括削除
                        </h3>
                        <p style={{ margin: '1rem 0', color: '#333' }}>
                            指定した期間内の全ての仕込み予定を削除します。<br />
                            <strong>この操作は取り消せません。ご注意ください。</strong>
                        </p>

                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 'bold' }}>開始日</label>
                                <Input type="date" value={deleteStartDate} onChange={e => setDeleteStartDate(e.target.value)} />
                            </div>
                            <span style={{ paddingTop: '24px' }}>〜</span>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 'bold' }}>終了日</label>
                                <Input type="date" value={deleteEndDate} onChange={e => setDeleteEndDate(e.target.value)} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <Button variant="ghost" onClick={() => setShowBulkDeleteModal(false)}>キャンセル</Button>
                            <Button variant="danger" onClick={handleBulkDelete}>一括削除実行</Button>
                        </div>
                    </Card>
                </div>
            )}
            {/* Quantity Modal */}
            {showQuantityModal && pendingDrop && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', backgroundColor: 'white' }}>
                        <h3 style={{ marginTop: 0 }}>
                            {pendingDrop.recipe.type === 'bread' ? 'パンの仕込み量' : '仕込み倍率'}
                        </h3>
                        <p style={{ margin: '1rem 0', color: '#666' }}>
                            {pendingDrop.recipe.title}
                        </p>

                        <div style={{ marginBottom: '1.5rem' }}>
                            {pendingDrop.recipe.type === 'bread' ? (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>総量 (g)</label>
                                    <Input
                                        type="number"
                                        value={inputTotalWeight}
                                        onChange={e => setInputTotalWeight(e.target.value)}
                                        placeholder="例: 1200"
                                        autoFocus
                                    />
                                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                                        ※ 生地全体の総重量を入力してください
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>倍率</label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={inputMultiplier}
                                        onChange={e => setInputMultiplier(e.target.value)}
                                        placeholder="例: 1, 1.5, 2"
                                        autoFocus
                                    />
                                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                                        ※ 基本レシピに対する倍率 (1 = そのまま)
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <Button variant="ghost" onClick={cancelQuantity}>キャンセル</Button>
                            <Button variant="primary" onClick={confirmQuantity}>決定</Button>
                        </div>
                    </Card>
                </div>
            )}
            <div className="container-header">
                <h2 className="section-title">📅 仕込みカレンダー</h2>
                <div className="header-actions">
                    <Button variant="secondary" onClick={onNavigateToOrderList} style={{ marginRight: '8px' }}>📋 発注リストへ</Button>
                    <Button variant="danger" onClick={handleOpenBulkDelete} style={{ marginRight: '8px' }}>🗑️ 一括削除</Button>
                    <Button variant="ghost" onClick={onBack}>← メニュー</Button>
                </div>
            </div>

            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragCancel={handleDragCancel}
                onDragEnd={handleDragEnd}
                autoScroll={true}
            >
                <div className="planner-layout">
                    {/* Sidebar */}
                    <div className="recipe-sidebar">
                        <div className="sidebar-search">
                            <Input
                                placeholder="レシピ検索..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="draggable-list">
                            {filteredRecipes.map(r => (
                                <DraggableRecipe key={r.id} recipe={r} />
                            ))}
                        </div>
                    </div>

                    {/* Calendar */}
                    <div className="planner-calendar">
                        <div className="calendar-header">
                            <Button variant="ghost" onClick={() => changeMonth(-1)}>← 前月</Button>
                            <h3 style={{ margin: 0 }}>
                                {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
                            </h3>
                            <Button variant="ghost" onClick={() => changeMonth(1)}>翌月 →</Button>
                        </div>
                        <div className="calendar-grid">
                            {/* Headers */}
                            {['日', '月', '火', '水', '木', '金', '土'].map(d => (
                                <div key={d} className="calendar-day-header">{d}</div>
                            ))}

                            {/* Days */}
                            {getCalendarDays().map((dObj, i) => {
                                const dateStr = formatDateStr(dObj.date);
                                const dayPlans = plans[dateStr] || [];
                                const isToday = dateStr === formatDateStr(new Date());

                                return (
                                    <CalendarCell
                                        key={i}
                                        dateStr={dateStr}
                                        dayNum={dObj.date.getDate()}
                                        isToday={isToday}
                                        isOutside={dObj.isOutside}
                                    >
                                        {dayPlans.map(meal => {
                                            const recipe = recipes.find(r => r.id === meal.recipeId);
                                            return (
                                                <DraggableMeal key={meal.id} meal={meal} dateStr={dateStr}>
                                                    <div
                                                        className="planned-meal"
                                                        title={recipe?.title}
                                                        onClick={() => recipe && onSelectRecipe && onSelectRecipe(recipe)}
                                                    >
                                                        <span>{recipe?.title || 'Unknown'}</span>
                                                        <span
                                                            className="delete-meal-btn"
                                                            onPointerDown={(e) => {
                                                                // Important: stop propagation on pointer down to prevent drag start
                                                                e.stopPropagation();
                                                            }}
                                                            onClick={(e) => handleDeleteMeal(dateStr, meal.id, e)}
                                                        >
                                                            ×
                                                        </span>
                                                    </div>
                                                </DraggableMeal>
                                            );
                                        })}
                                    </CalendarCell>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <DragOverlay>
                    {activeDrag ? (
                        <div className={`drag-overlay-card ${activeDrag.kind === 'meal' ? 'meal' : ''}`}>
                            <span className="drag-overlay-title">{activeDrag.title}</span>
                            {activeDrag.qtyStr && (
                                <span className="drag-overlay-qty">{activeDrag.qtyStr}</span>
                            )}
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
};
