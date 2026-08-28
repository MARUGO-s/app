import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import './RecipeAiMagiProgressModal.css';

// AI request starts before this modal is rendered. Keep the boot sequence visible
// long enough to establish the transition without delaying that request.
const BOOT_DURATION_MS = 2400;

const STAGE_ORDER = ['research', 'analysis', 'audit', 'final'];

// 工程ラベルからのステージ判定は「レシピ統合」などが誤って final 扱いになり、
// 前半なのに全パネルがまとめて可決したり、途中パネルが審議演出を飛ばして
// いきなり可になる不具合があった。
// そこで進捗の割合で research→analysis→audit→final を必ず順番（単調）に進め、
// 各パネルが「審議中（帯が上下）→可」を時間差で順に通過するようにする。
const getCurrentStage = (stepIndex, stepCount) => {
    const total = Math.max(stepCount, 1);
    const frac = Math.min(Math.max(stepIndex, 0) / total, 1);
    if (frac < 0.30) return STAGE_ORDER[0];   // research（MELCHIOR）
    if (frac < 0.55) return STAGE_ORDER[1];   // analysis（BALTHASAR）
    if (frac < 0.78) return STAGE_ORDER[2];   // audit（CASPER）
    return STAGE_ORDER[3];                     // final（統合決裁）
};

const PANEL_DEFINITIONS = [
    {
        id: 'research',
        magi: 'MELCHIOR',
        kanji: '情報照合',
        english: 'RESEARCH',
        model: 'Groq / Perplexity Sonar',
        idleLabel: '照会待機',
        completeLabel: '照合済',
    },
    {
        id: 'analysis',
        magi: 'BALTHASAR',
        kanji: '構成検算',
        english: 'ANALYSIS',
        model: 'Groq GPT-OSS 120B · Compound',
        idleLabel: '検算待機',
        completeLabel: '検算済',
    },
    {
        id: 'audit',
        magi: 'CASPER',
        kanji: '反証監査',
        english: 'AUDIT + REBUTTAL',
        model: 'OpenAI GPT-5.4-mini',
        idleLabel: '監査待機',
        completeLabel: '監査済',
    },
];

const getPanelState = (panelId, currentStage) => {
    const panelOrder = STAGE_ORDER.indexOf(panelId);
    const currentOrder = STAGE_ORDER.indexOf(currentStage);

    if (panelId === currentStage) return 'active';
    if (panelOrder < currentOrder) return 'complete';
    return 'idle';
};

export const RecipeAiMagiProgressModal = ({
    isOpen,
    config,
    stepIndex = 0,
    auditVerdict = null,
}) => {
    const [isBooting, setIsBooting] = useState(true);
    const steps = config?.steps || [];
    const currentStep = steps[stepIndex];
    const currentStage = getCurrentStage(stepIndex, steps.length);
    const progressPercent = Math.round(((stepIndex + 1) / Math.max(steps.length, 1)) * 100);

    useEffect(() => {
        const timerId = window.setTimeout(() => setIsBooting(false), BOOT_DURATION_MS);
        return () => window.clearTimeout(timerId);
    }, [isOpen]);

    const panelStates = useMemo(() => Object.fromEntries(
        PANEL_DEFINITIONS.map((panel) => [panel.id, getPanelState(panel.id, currentStage)])
    ), [currentStage]);

    const activeProvider = String(currentStep?.provider || 'AI自動選択');
    const isPerplexityActive = activeProvider.includes('Perplexity');
    const finalState = currentStage === 'final'
        ? 'active'
        : STAGE_ORDER.indexOf(currentStage) > STAGE_ORDER.indexOf('final')
            ? 'complete'
            : 'idle';

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {}}
            title="AIエージェント進行中"
            size="large"
            showHeader={false}
            showCloseButton={false}
            maxWidth="980px"
            className="recipe-ai-magi-modal"
        >
            {isBooting ? (
                <section className="recipe-ai-magi recipe-ai-magi--boot" aria-live="polite" aria-label="MAGIシステム起動中">
                    <div className="recipe-ai-magi__boot-grid" aria-hidden="true" />
                    <div className="recipe-ai-magi__boot-signal" aria-hidden="true">
                        <span /><span /><span />
                    </div>
                    <p className="recipe-ai-magi__boot-kicker">MULTI-AGENT CONSENSUS</p>
                    <h2>MAGIシステム起動。</h2>
                    <p className="recipe-ai-magi__boot-copy">レシピ解析・決議網を初期化しています</p>
                    <div className="recipe-ai-magi__boot-bar" aria-hidden="true"><span /></div>
                </section>
            ) : (
                <section className="recipe-ai-magi" aria-live="polite">
                    <header className="recipe-ai-magi__header">
                        <span className="recipe-ai-magi__eyebrow">多重知能 合議系</span>
                        <h2>献立解析・決議網</h2>
                        <span className="recipe-ai-magi__protocol">RECIPE DECISION PROTOCOL</span>
                    </header>

                    <div className="recipe-ai-magi__triad" aria-label="AI合議システムの進行状況">
                        {PANEL_DEFINITIONS.map((panel) => {
                            const isAudit = panel.id === 'audit';
                            const rawState = panelStates[panel.id];
                            // 監査パネル（CASPER）は検証AIの実データに従う：
                            //   reject → 否決を確定表示 / rework → 審議画面（帯が上下）に戻す /
                            //   approve → 可決 / 未判定でタイマーが先行 → 審議中を保持。
                            let state = rawState;
                            let rejected = false;
                            if (isAudit) {
                                if (auditVerdict === 'reject') {
                                    state = 'complete';
                                    rejected = true;
                                } else if (auditVerdict === 'approve') {
                                    state = 'complete';
                                } else if (auditVerdict === 'rework') {
                                    state = 'active';
                                } else if (rawState === 'complete') {
                                    state = 'active';
                                }
                            }
                            const isActive = state === 'active';
                            const isComplete = state === 'complete';
                            const completeStatus = rejected ? '否決' : '可決';
                            const statusLabel = isActive
                                ? (panel.id === 'research' && isPerplexityActive ? 'Web照会中' : '審議中')
                                : isComplete ? completeStatus : panel.idleLabel;

                            return (
                                <article key={panel.id} className={`recipe-ai-magi__panel recipe-ai-magi__panel--${panel.id} is-${state}${rejected ? ' is-rejected' : ''}`}>
                                    {isComplete ? (
                                        <div className="recipe-ai-magi__panel-inner recipe-ai-magi__decided">
                                            <span className="recipe-ai-magi__decided-magi">{panel.magi}</span>
                                            <span className="recipe-ai-magi__decided-char" aria-hidden="true">{rejected ? '否' : '可'}</span>
                                            <span className="recipe-ai-magi__decided-word">{completeStatus}</span>
                                        </div>
                                    ) : (
                                        <div className="recipe-ai-magi__panel-inner">
                                            {isActive && <span className="recipe-ai-magi__panel-live" aria-hidden="true">ACTIVE</span>}
                                            <span className="recipe-ai-magi__panel-icon" aria-hidden="true">
                                                {panel.id === 'research' ? '⌕' : panel.id === 'analysis' ? '⌬' : '◇'}
                                            </span>
                                            <h3>{panel.kanji}</h3>
                                            <span className="recipe-ai-magi__panel-english">{panel.english}</span>
                                            <span className="recipe-ai-magi__panel-model">{panel.model}</span>
                                            <span className="recipe-ai-magi__panel-status">{statusLabel}</span>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>

                    <div className={`recipe-ai-magi__conflict is-${currentStage === 'audit' ? 'active' : 'idle'}`}>
                        <span>矛盾照合</span>
                        <small>CONFLICT CHECK</small>
                    </div>

                    <div className={`recipe-ai-magi__final is-${finalState}`}>
                        <div>
                            <span className="recipe-ai-magi__final-label">統合決裁</span>
                            <small>FINAL SYNTHESIS · OpenAI GPT-5.4-nano</small>
                        </div>
                        <span className="recipe-ai-magi__final-status">
                            {finalState === 'active' ? '決裁中' : finalState === 'complete' ? '可決' : '待機'}
                        </span>
                    </div>

                    <div className="recipe-ai-magi__current">
                        <span className="recipe-ai-magi__current-mark" aria-hidden="true" />
                        <div>
                            <span>現在の工程</span>
                            <strong>{currentStep?.label || '進行状況を確認中'}</strong>
                            <small>{activeProvider}</small>
                        </div>
                        <span className="recipe-ai-magi__current-count">{String(stepIndex + 1).padStart(2, '0')} / {String(Math.max(steps.length, 1)).padStart(2, '0')}</span>
                    </div>

                    <div className="recipe-ai-magi__progress" aria-label={`進捗 ${progressPercent}%`}>
                        <span style={{ width: `${progressPercent}%` }} />
                    </div>
                    <p className="recipe-ai-magi__description">{config?.description}</p>
                </section>
            )}
        </Modal>
    );
};
