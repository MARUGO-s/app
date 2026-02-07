import React, { useState, useEffect, useCallback } from 'react';
import { plannerService } from '../services/plannerService';
import { recipeService } from '../services/recipeService'; // Need access to recipes
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../contexts/useToast';
import { DndContext, useDraggable, useDroppable, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import './Planner.css';

// Draggable Recipe Item
const DraggableRecipe = ({ recipe }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `recipe-${recipe.id}`,
        data: { recipe }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        position: 'relative',
        zIndex: 999
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="draggable-recipe">
            {recipe.title}
        </div>
    );
};

// Draggable Meal Item (for moving existing plans)
const DraggableMeal = ({ meal, dateStr, children }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `meal-${meal.id}`,
        data: { meal, dateStr, type: 'meal' } // Pass dateStr to know source
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        position: 'relative',
        zIndex: 999
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="draggable-meal-wrapper">
            {children}
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

export const Planner = ({ onBack, onSelectRecipe }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [recipes, setRecipes] = useState([]);
    const [plans, setPlans] = useState({});
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingMeal, setDeletingMeal] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const loadData = useCallback(async () => {
        const r = await recipeService.fetchRecipes(user);
        setRecipes(r);
        if (user?.id) {
            // Cleanup plans that have invalid recipe IDs (Unknown items)
            // This fixes the issue where data from other users (via legacy fallback) shows up as Unknown.
            const validIds = r.map(x => x.id);
            const cleanedPlans = await plannerService.cleanupInvalidPlans(user.id, validIds);
            setPlans(cleanedPlans);
        }
    }, [user]);

    useEffect(() => {
        // Avoid calling setState synchronously inside an effect body.
        const t = setTimeout(() => {
            void loadData();
        }, 0);
        return () => clearTimeout(t);
    }, [loadData]);

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (!over) return;

        if (over.id.startsWith('date-')) {
            const targetDateStr = over.data.current.dateStr;

            // Case 1: Dragging a Recipe from Sidebar (New)
            if (active.id.startsWith('recipe-')) {
                const recipe = active.data.current.recipe;
                await plannerService.addMeal(user.id, targetDateStr, recipe.id, 'dinner');
                loadData();
            }
            // Case 2: Dragging an existing Meal (Move)
            else if (active.id.startsWith('meal-')) {
                const { meal, dateStr: sourceDateStr } = active.data.current;

                // If dropped on same day, do nothing
                if (sourceDateStr === targetDateStr) return;

                // Move logic: Add to target, Remove from source
                // (Ideally atomic, but sequential is fine here)
                await plannerService.addMeal(user.id, targetDateStr, meal.recipeId, meal.type || 'dinner');
                await plannerService.removeMeal(user.id, sourceDateStr, meal.id);
                loadData();
            }
        }
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

    const formatDateStr = (date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const filteredRecipes = recipes.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()));



    const changeMonth = (delta) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1));
    };

    return (
        <div className="planner-container fade-in">
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
            <div className="container-header">
                <h2 className="section-title">📅 仕込みカレンダー</h2>
                <div className="header-actions">

                    <Button variant="ghost" onClick={onBack}>← メニュー</Button>
                </div>
            </div>

            <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
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
            </DndContext>
        </div>
    );
};
