const e=`import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import './RecipeAiMagiProgressModal.css';

const BOOT_DURATION_MS = 900;

const getStageKey = (step) => {
    const label = String(step?.label || '');

    if (/調査|比較|料理文化/.test(label)) return 'research';
    if (/クロスチェック|反証|監査|査読/.test(label)) return 'audit';
    if (/統合|最終修正|回答・更新案/.test(label)) return 'final';
    return 'analysis';
};

const STAGE_ORDER = ['research', 'analysis', 'audit', 'final'];

const PANEL_DEFINITIONS = [
    {
        id: 'research',
        kanji: '情報照合',
        english: 'RESEARCH',
        model: 'Groq / Perplexity Sonar',
        idleLabel: '照会待機',
        completeLabel: '照合済',
    },
    {
        id: 'analysis',
        kanji: '構成検算',
        english: 'ANALYSIS',
        model: 'Groq GPT-OSS 120B · Compound',
        idleLabel: '検算待機',
        completeLabel: '検算済',
    },
    {
        id: 'audit',
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
}) => {
    const [isBooting, setIsBooting] = useState(true);
    const steps = config?.steps || [];
    const currentStep = steps[stepIndex];
    const currentStage = getStageKey(currentStep);
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
                            const state = panelStates[panel.id];
                            const isActive = state === 'active';
                            const statusLabel = isActive
                                ? (panel.id === 'research' && isPerplexityActive ? 'Web照会中' : '審議中')
                                : state === 'complete' ? panel.completeLabel : panel.idleLabel;

                            return (
                                <article key={panel.id} className={\`recipe-ai-magi__panel recipe-ai-magi__panel--\${panel.id} is-\${state}\`}>
                                    <div className="recipe-ai-magi__panel-inner">
                                        <span className="recipe-ai-magi__panel-icon" aria-hidden="true">
                                            {panel.id === 'research' ? '⌕' : panel.id === 'analysis' ? '⌬' : '◇'}
                                        </span>
                                        <h3>{panel.kanji}</h3>
                                        <span className="recipe-ai-magi__panel-english">{panel.english}</span>
                                        <span className="recipe-ai-magi__panel-model">{panel.model}</span>
                                        <span className="recipe-ai-magi__panel-status">{statusLabel}</span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    <div className={\`recipe-ai-magi__conflict is-\${currentStage === 'audit' ? 'active' : 'idle'}\`}>
                        <span>矛盾照合</span>
                        <small>CONFLICT CHECK</small>
                    </div>

                    <div className={\`recipe-ai-magi__final is-\${finalState}\`}>
                        <div>
                            <span className="recipe-ai-magi__final-label">統合決裁</span>
                            <small>FINAL SYNTHESIS · OpenAI GPT-5.4-nano</small>
                        </div>
                        <span className="recipe-ai-magi__final-status">
                            {finalState === 'active' ? '決裁中' : finalState === 'complete' ? '承認済' : '待機'}
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

                    <div className="recipe-ai-magi__progress" aria-label={\`進捗 \${progressPercent}%\`}>
                        <span style={{ width: \`\${progressPercent}%\` }} />
                    </div>
                    <p className="recipe-ai-magi__description">{config?.description}</p>
                </section>
            )}
        </Modal>
    );
};
`;export{e as default};
