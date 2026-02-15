import React, { useEffect } from 'react';
import {
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    useDroppable,
    DragOverlay,
    defaultDropAnimationSideEffects,
    pointerWithin
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { VoiceInputButton } from './VoiceInputButton';

// --- Sortable Item Component ---
const SortableStepItem = ({
    id,
    index,
    item,
    groupId,
    voiceInputEnabled,
    onChange,
    onRemove,
    onVoiceAppend,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id, data: { groupId, index } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={{ ...style, display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }} className="step-row">
            <div
                {...attributes}
                {...listeners}
                className="step-drag-handle"
                style={{
                    cursor: 'grab',
                    padding: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ccc',
                    alignSelf: 'stretch',
                    touchAction: 'none'
                }}
            >
                ⋮⋮
            </div>

            <div className="step-count" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', height: '24px', borderRadius: '50%', background: '#eee', fontSize: '0.8rem', fontWeight: 'bold', marginTop: '8px' }}>
                {index + 1}
            </div>

            <div style={{ flex: 1 }}>
                <Input
                    textarea
                    value={item.text}
                    onChange={(e) => onChange(groupId, index, e.target.value)}
                    placeholder={`手順 ${index + 1}...`}
                    style={{ minHeight: '60px', width: '100%' }}
                />
                {voiceInputEnabled && (
                    <div className="step-row__voice-action">
                        <VoiceInputButton
                            label="手順を音声入力"
                            getCurrentValue={() => item.text}
                            onTranscript={(nextValue) => onVoiceAppend(groupId, index, nextValue)}
                        />
                    </div>
                )}
            </div>

            <div className="remove-button-cell">
                <button type="button" className="icon-btn-delete" onClick={() => onRemove(groupId, index)} title="削除">✕</button>
            </div>
        </div>
    );
};

// --- Sortable Section Component ---
const SortableSection = ({ section, sections, onSectionChange, onRemoveSection, children }) => {
    const { setNodeRef } = useDroppable({ id: section.id });

    return (
        <Card className="step-section mb-md" style={{ border: '1px solid #e0e0e0', boxShadow: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid #f0f0f0', paddingBottom: '0.5rem' }}>
                <Input
                    value={section.name}
                    onChange={(e) => onSectionChange(section.id, e.target.value)}
                    placeholder="グループ名 (例: 下準備)"
                    className="section-header-input"
                    style={{ fontWeight: 'bold', border: 'none', background: 'transparent', fontSize: '1.05rem', padding: '4px', width: '70%' }}
                />

                <div style={{ display: 'flex', gap: '8px' }}>
                    {sections.length > 1 && (
                        <button type="button" onClick={() => onRemoveSection(section.id)} className="group-delete-btn">
                            グループ削除
                        </button>
                    )}
                </div>
            </div>

            <div ref={setNodeRef} className="section-steps-list" style={{ minHeight: '50px', transition: 'min-height 0.2s', paddingBottom: '10px' }}>
                {children}
                {section.items.length === 0 && (
                    <div className="recipe-form-drop-placeholder" style={{ padding: '10px', textAlign: 'center', color: '#aaa', fontSize: '0.85rem', border: '1px dashed #ddd', borderRadius: '4px' }}>
                        ここに手順をドロップ
                    </div>
                )}
            </div>
        </Card>
    );
};


export const RecipeFormSteps = ({ formData, setFormData, voiceInputEnabled = false }) => {
    // Initialize sections from formData
    useEffect(() => {
        if (!formData.stepSections) {
            // Build initial sections
            const groups = formData.stepGroups || [{ id: 'default', name: '作り方' }];
            const items = formData.steps || [];

            // Note: formData.steps is currently array of strings or objects?
            // Existing implementation in RecipeForm uses `formData.steps` as array of objects {id, text} (see StepItem usage)
            // But persist logic converts to strings.
            // Let's assume we receive objects {id, text} from `RecipeForm` normalization
            // BUT wait, looking at `fromDbFormat`: it returns steps as array of strings!
            // `RecipeForm` likely hydrates them to objects with IDs on mount if needed, OR we do it here.

            // Let's handle string inputs by wrapping them
            const normalizedItems = (items || []).map(i =>
                (typeof i === 'string') ? { id: crypto.randomUUID(), text: i } : i
            );

            // If we have groups metadata (from saving previously), we need to check how to map checks.
            // Since steps are stored as flat array of strings, we don't have groupId on them.
            // WE NEED TO PERSIST GROUP ID ON ITEMS IF WE WANT TO RESTORE THEM CORRECTLY.
            // Strategy: We will update `recipeService` to store `steps` as objects with groupId OR keep flat structure and rely on index ranges?
            // Actually, for ingredients we flatten but we can reconstruct because we save groupId.
            // For steps, current DB functions expect `text[]`. 
            // WE MUST STORE STEP STRUCTURE IN META OR CHANGE DB. 
            // In `recipeService`, we can convert steps to JSON objects or store a separate `step_structure` JSON.
            // Plan: Store full step objects in `steps` JSONB if possible? 
            // The DB schema for steps is `jsonb` or `text[]`?
            // Supabase definition for steps is likely `jsonb`.
            // Let's assume we can store objects in `steps`.
            // Actually `recipeService` says: `steps: recipe.steps.map(s => s.text)` on save. 
            // This destroys IDs and grouping.
            // We need to change persistence to store objects `{ text, groupId }` in steps if we want to grouping.

            // Wait, if `steps` column is JSONB, we can store anything.
            // The `type` check is important.

            // Let's look at `fromDbFormat` again. It returns `steps`.
            // If `steps` contains objects with `groupId`, we can group them.

            // If legacy (strings), put in default group.

            const initialSections = groups.map(g => ({
                id: g.id,
                name: g.name,
                items: normalizedItems.filter(i => {
                    if (g.id === 'default' && !i.groupId) return true;
                    return i.groupId === g.id;
                })
            }));

            // Handle orphans
            const accountedIds = new Set(initialSections.flatMap(s => s.items.map(i => i.id)));
            const orphans = normalizedItems.filter(i => !accountedIds.has(i.id));
            if (orphans.length > 0) {
                if (initialSections.length > 0) {
                    initialSections[0].items.push(...orphans);
                } else {
                    initialSections.push({ id: 'default', name: '作り方', items: orphans });
                }
            }

            if (initialSections.length === 0) {
                initialSections.push({ id: crypto.randomUUID(), name: '作り方', items: [] });
            }

            setFormData(prev => ({ ...prev, stepSections: initialSections }));
        }
    }, [formData.steps, formData.stepGroups, formData.stepSections, setFormData]);

    const sections = formData.stepSections || [];

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragOver = ({ active, over }) => {
        if (!over) return;
        const activeId = active.id;
        const overId = over.id;

        const activeSection = sections.find(s => s.items.some(i => i.id === activeId));
        const overSection = sections.find(s => s.items.some(i => i.id === overId)) || sections.find(s => s.id === overId);

        if (!activeSection || !overSection || activeSection === overSection) {
            return;
        }

        setFormData(prev => {
            const activeItems = activeSection.items;
            const overItems = overSection.items;
            const activeIndex = activeItems.findIndex(i => i.id === activeId);
            const overIndex = overItems.findIndex(i => i.id === overId);

            let newIndex;
            if (overId === overSection.id) {
                newIndex = overItems.length + 1;
            } else {
                const isBelowOverItem =
                    over &&
                    active.rect.current.translated &&
                    active.rect.current.translated.top > over.rect.top + over.rect.height;
                const modifier = isBelowOverItem ? 1 : 0;
                newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
            }

            return {
                ...prev,
                stepSections: prev.stepSections.map(s => {
                    if (s.id === activeSection.id) {
                        return { ...s, items: activeItems.filter(i => i.id !== activeId) };
                    }
                    if (s.id === overSection.id) {
                        return {
                            ...s,
                            items: [
                                ...overItems.slice(0, newIndex),
                                activeItems[activeIndex],
                                ...overItems.slice(newIndex, overItems.length)
                            ]
                        };
                    }
                    return s;
                })
            };
        });
    };

    const handleDragEnd = ({ active, over }) => {
        if (!over) return;
        const activeId = active.id;
        const overId = over.id;

        const activeSection = sections.find(s => s.items.some(i => i.id === activeId));
        const overSection = sections.find(s => s.items.some(i => i.id === overId)) || sections.find(s => s.id === overId);

        if (activeSection && overSection && activeSection === overSection) {
            const activeIndex = activeSection.items.findIndex(i => i.id === activeId);
            const overIndex = overSection.items.findIndex(i => i.id === overId);
            if (activeIndex !== overIndex) {
                setFormData(prev => ({
                    ...prev,
                    stepSections: prev.stepSections.map(s => {
                        if (s.id === activeSection.id) {
                            return { ...s, items: arrayMove(s.items, activeIndex, overIndex) };
                        }
                        return s;
                    })
                }));
            }
        }
    };

    const handleItemChange = (groupId, index, value) => {
        setFormData(prev => ({
            ...prev,
            stepSections: prev.stepSections.map(s => {
                if (s.id !== groupId) return s;
                const newItems = [...s.items];
                newItems[index] = { ...newItems[index], text: value };
                return { ...s, items: newItems };
            })
        }));
    };

    const handleRemoveItem = (groupId, index) => {
        setFormData(prev => ({
            ...prev,
            stepSections: prev.stepSections.map(s => {
                if (s.id === groupId) {
                    return { ...s, items: s.items.filter((_, i) => i !== index) };
                }
                return s;
            })
        }));
    };

    const handleVoiceAppend = (groupId, index, nextValue) => {
        setFormData(prev => ({
            ...prev,
            stepSections: prev.stepSections.map(s => {
                if (s.id !== groupId) return s;
                const newItems = [...s.items];
                newItems[index] = { ...newItems[index], text: nextValue };
                return { ...s, items: newItems };
            }),
        }));
    };

    const handleAddItem = (groupId) => {
        const newItem = { id: crypto.randomUUID(), text: '' };
        setFormData(prev => ({
            ...prev,
            stepSections: prev.stepSections.map(s => {
                if (s.id === groupId) {
                    return { ...s, items: [...s.items, newItem] };
                }
                return s;
            })
        }));
    };

    const handleAddSection = () => {
        setFormData(prev => ({
            ...prev,
            stepSections: [...prev.stepSections, { id: crypto.randomUUID(), name: '新しいグループ', items: [] }]
        }));
    };

    const handleRemoveSection = (sectionId) => {
        setFormData(prev => ({
            ...prev,
            stepSections: prev.stepSections.filter(s => s.id !== sectionId)
        }));
    };

    const handleSectionNameChange = (sectionId, name) => {
        setFormData(prev => ({
            ...prev,
            stepSections: prev.stepSections.map(s => s.id === sectionId ? { ...s, name } : s)
        }));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="recipe-form-steps">
                {sections.map(section => (
                    <SortableContext key={section.id} id={section.id} items={section.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <SortableSection
                            section={section}
                            sections={sections}
                            onSectionChange={handleSectionNameChange}
                            onRemoveSection={handleRemoveSection}
                        >
                            {section.items.map((item, index) => (
                                <SortableStepItem
                                    key={item.id}
                                    id={item.id}
                                    index={index}
                                    item={item}
                                    groupId={section.id}
                                    voiceInputEnabled={voiceInputEnabled}
                                    onChange={handleItemChange}
                                    onRemove={handleRemoveItem}
                                    onVoiceAppend={handleVoiceAppend}
                                />
                            ))}
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => handleAddItem(section.id)}
                                style={{ width: '100%', marginTop: '0.5rem', borderStyle: 'dashed' }}
                            >
                                + 手順を追加
                            </Button>
                        </SortableSection>
                    </SortableContext>
                ))}

                <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddSection}
                    style={{ width: '100%', marginTop: '1rem', padding: '1rem' }}
                >
                    + 新しいグループを追加
                </Button>
            </div>

            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }) }}>
                {null}
            </DragOverlay>
        </DndContext>
    );
};
