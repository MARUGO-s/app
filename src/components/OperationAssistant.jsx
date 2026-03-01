import React, { useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { VoiceInputButton } from './VoiceInputButton';
import { operationQaService } from '../services/operationQaService';
import './OperationAssistant.css';

const createMessage = (role, content) => ({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    role,
    content: String(content || ''),
});

const INITIAL_MESSAGE = createMessage(
    'assistant',
    '操作で困った内容をそのまま質問してください。下のクイック質問を押してもOKです。'
);

const QUICK_PROMPTS_BY_VIEW = {
    detail: [
        'レシピ詳細の上部タブ（非公開/原文/プレビュー/印刷/複製/編集/削除）をまとめて教えて',
        'このレシピをフランス語に翻訳する手順を教えて',
        '翻訳表示のまま原文を併記する手順を教えて',
        'このレシピを公開して共有する手順を教えて',
        '公開スイッチが表示されない理由を教えて',
        '公開を停止して非公開に戻す手順を教えて',
        '元レシピURLのQRコードを表示する手順を教えて',
        'この画面で印刷プレビューする方法を教えて',
        'プレビューで材料をタップして投入済みを管理する使い方を教えて',
        'プレビューで分量倍率や仕上がり総重量を入れて再計算する方法を教えて',
        'PDFで保存する手順を教えて',
        'このレシピを複製する手順を教えて',
        '詳細画面から編集画面へ移動する手順を教えて',
        '削除したレシピをゴミ箱から戻す手順を教えて',
        'ゴミ箱からレシピを完全削除する手順を教えて'
    ],
    create: [
        'レシピを新規作成して保存する手順を教えて',
        '新規作成で必須入力項目を教えて',
        'この画面で音声入力を使う方法を教えて',
        '材料をグループ分けして入力する手順を教えて',
        '材料の単位と分量を入力するコツを教えて',
        '仕入れ欄の🧮原価計算アシストの使い方を教えて',
        '画像からレシピを取り込む手順を教えて',
        '手書き画像の解析精度を上げるコツを教えて',
        'Web URLからレシピを取り込む手順を教えて',
        'URL取り込みできないサイトの対処方法を教えて',
        '保存前に確認すべきポイントを教えて',
    ],
    edit: [
        '編集内容を保存する手順を教えて',
        'この画面で音声入力を使う方法を教えて',
        '材料を追加・削除する手順を教えて',
        '編集画面で🧮原価計算アシストを使う手順を教えて',
        '編集画面でURL取り込み・画像解析が出ない理由を教えて',
        '材料や手順を並び替える方法を教えて',
        '編集後に反映確認する手順を教えて',
        '変更をやめて戻るときの注意点を教えて',
    ],
    data: [
        'インフォマートから価格データを抽出して取り込む手順を教えて',
        'CSVをドラッグ&ドロップでアップロードする手順を教えて',
        'CSVを入れた後にCSV取込で未登録を処理する手順を教えて',
        '未登録の区分（食材/アルコール等）を設定する理由を教えて',
        '容量と単位を設定する理由を教えて',
        '材料マスターを編集する手順を教えて',
        '重複アイテムで価格変動を確認する手順を教えて',
        'ゴミ箱で復元する手順を教えて',
        '保存済みファイルを削除するときの注意点を教えて',
        'レシピバックアップから復元する手順を教えて',
    ],
    'data-management': [
        'インフォマートから価格データを抽出して取り込む手順を教えて',
        'CSVをドラッグ&ドロップでアップロードする手順を教えて',
        'CSVを入れた後にCSV取込で未登録を処理する手順を教えて',
        '未登録の区分（食材/アルコール等）を設定する理由を教えて',
        '容量と単位を設定する理由を教えて',
        '材料マスターを編集する手順を教えて',
        '重複アイテムで価格変動を確認する手順を教えて',
        'ゴミ箱で復元する手順を教えて',
        '保存済みファイルを削除するときの注意点を教えて',
        'レシピバックアップから復元する手順を教えて',
    ],
    inventory: [
        '在庫数を更新する基本手順を教えて',
        '在庫の初期値を入れる手順を教えて',
        '発注点を設定する手順を教えて',
        '棚卸し完了して履歴保存する手順を教えて',
        '入荷在庫を反映する手順を教えて',
        '在庫画面での集計確認方法を教えて',
        '単位がずれている在庫を整える手順を教えて',
    ],
    planner: [
        '仕込みカレンダーで予定を追加する手順を教えて',
        'レシピをドラッグ&ドロップで日付に入れる手順を教えて',
        '通常レシピの倍率を設定する手順を教えて',
        'パンレシピの総量(g)を設定する手順を教えて',
        '登録済み予定を別日に移動する手順を教えて',
        '仕込み予定を1件削除する手順を教えて',
        '期間を指定して一括削除する手順を教えて',
        '仕込み予定を発注リストに反映する流れを教えて',
    ],
    'order-list': [
        '発注リストを作成する手順を教えて',
        '開始日と終了日の決め方を教えて',
        '必要量・残在庫・発注量の見方を教えて',
        '在庫差し引きで発注量が決まる仕組みを教えて',
        '発注リストをコピーする手順を教えて',
        '発注リストを印刷する手順を教えて',
        '発注が必要なものが0件のときの確認ポイントを教えて',
    ],
    'incoming-deliveries': [
        '入荷PDFを選択して解析する手順を教えて',
        '解析結果を保存する手順を教えて',
        '解析に失敗したときの確認ポイントを教えて',
        '保存後に次の画面へ進む手順を教えて',
    ],
    'incoming-stock': [
        '入荷在庫を在庫へ反映する手順を教えて',
        '要発注タブの見方を教えて',
        '反映済み/未反映の違いを教えて',
        '反映後に何を確認すればよいか教えて',
    ],
    trash: [
        'ゴミ箱で価格データCSVを復元する手順を教えて',
        'ゴミ箱で材料マスターを復元する手順を教えて',
        '選択したデータだけ完全削除する手順を教えて',
        '全件完全削除するときの注意点を教えて',
    ],
    list: [
        'レシピを検索して絞り込む手順を教えて',
        'レシピの並び替え（ドラッグ&ドロップ）手順を教えて',
        '最近見たレシピから開き直す方法を教えて',
        '自分のレシピを共有する手順を教えて',
        '公開中レシピと他ユーザー公開の見方を教えて',
        'スライドメニューの各ボタンの意味を教えて',
        'インフォマートから価格データを抽出して取り込む手順を教えて',
        'データ管理の各タブの使い分けを教えて',
        '仕込みカレンダーから発注までの流れを教えて',
        'レシピを新規追加する手順を教えて',
        '目的の画面へ移動する方法を教えて',
        'ボタンが反応しない時の確認手順を教えて',
    ],
};

const DEFAULT_QUICK_PROMPTS = [
    '今の画面でよく使う操作を3つ教えて',
    'この画面の基本操作を順番に教えて',
    'この画面で失敗しやすいポイントを教えて',
    'この画面から次に進む最短手順を教えて',
    'ボタンが反応しない時の確認手順を教えて',
];

const ANSWER_MODE = {
    QUESTION_FIRST: 'question-first',
    PAGE_FIRST: 'page-first',
};

const normalizeUiText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const uniqTextList = (items, limit = 24, maxLength = 80) => {
    const out = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
        const text = normalizeUiText(item);
        if (!text || text.length > maxLength) return;
        if (seen.has(text)) return;
        seen.add(text);
        out.push(text);
    });
    return out.slice(0, limit);
};

const collectPageSnapshot = (currentView) => {
    if (typeof document === 'undefined') return null;
    const root = document.querySelector('.app-main');
    if (!root) return null;

    const isInsideAssistant = (node) => (
        !!node?.closest?.('.operation-assistant-fab')
        || !!node?.closest?.('.operation-assistant-modal')
        || !!node?.closest?.('.modal-overlay')
    );

    const collectTexts = (selector, limit, maxLength = 80) => {
        const values = [];
        root.querySelectorAll(selector).forEach((el) => {
            if (isInsideAssistant(el)) return;
            const text = normalizeUiText(el.textContent);
            if (!text || text.length > maxLength) return;
            values.push(text);
        });
        return uniqTextList(values, limit, maxLength);
    };

    const headingLines = collectTexts('h1, h2, h3, h4, [role="heading"]', 16, 80);
    const tabLabels = collectTexts('[role="tab"], .tab-button, .tabs button, .view-mode-toggle button', 16, 60);
    const buttonLabels = collectTexts('button', 24, 48).filter((label) => ![
        '質問する',
        '履歴クリア',
        '質問例を表示',
        '質問例を閉じる',
    ].includes(label));
    const excerpt = normalizeUiText(root.textContent).slice(0, 600);

    return {
        view: String(currentView || ''),
        capturedAt: new Date().toISOString(),
        headingLines,
        tabLabels,
        buttonLabels,
        excerpt,
    };
};

export const OperationAssistant = ({ currentView, userRole }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [question, setQuestion] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [messages, setMessages] = useState([INITIAL_MESSAGE]);
    const [lastError, setLastError] = useState('');
    const [showQuickPromptList, setShowQuickPromptList] = useState(false);
    const [answerMode, setAnswerMode] = useState(ANSWER_MODE.PAGE_FIRST);
    const [pageSnapshot, setPageSnapshot] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const pageSnapshotSummary = useMemo(() => {
        if (!pageSnapshot) return '';
        const hints = [
            ...(pageSnapshot.headingLines || []),
            ...(pageSnapshot.tabLabels || []),
            ...(pageSnapshot.buttonLabels || []),
        ];
        return uniqTextList(hints, 3, 40).join(' / ');
    }, [pageSnapshot]);

    const canSubmit = question.trim().length > 0 && !isSending;
    const quickPrompts = useMemo(
        () => QUICK_PROMPTS_BY_VIEW[currentView] || DEFAULT_QUICK_PROMPTS,
        [currentView]
    );

    const historyForApi = useMemo(() => {
        return messages
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => ({ role: msg.role, content: msg.content }))
            .slice(-8);
    }, [messages]);

    const scrollToBottom = () => {
        if (!messagesEndRef.current) return;
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };

    const openModal = () => {
        setPageSnapshot(collectPageSnapshot(currentView));
        setIsOpen(true);
        setShowQuickPromptList(false);
        setTimeout(() => {
            inputRef.current?.focus();
            scrollToBottom();
        }, 0);
    };

    const closeModal = () => {
        if (isSending) return;
        setIsOpen(false);
    };

    const resetConversation = () => {
        if (isSending) return;
        setMessages([INITIAL_MESSAGE]);
        setQuestion('');
        setLastError('');
        setShowQuickPromptList(false);
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    };

    const applyQuickPrompt = (prompt) => {
        if (isSending) return;
        setQuestion(prompt);
        setLastError('');
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    };

    const submitQuestion = async (e) => {
        e.preventDefault();
        const trimmed = question.trim();
        if (!trimmed || isSending) return;

        const userMessage = createMessage('user', trimmed);
        const optimisticMessages = [...messages, userMessage];
        setMessages(optimisticMessages);
        setQuestion('');
        setLastError('');
        setIsSending(true);
        setTimeout(scrollToBottom, 0);

        try {
            const answer = await operationQaService.askOperationQuestion({
                question: trimmed,
                currentView,
                userRole,
                history: [...historyForApi, { role: 'user', content: trimmed }],
                answerMode,
                pageContext: answerMode === ANSWER_MODE.PAGE_FIRST ? pageSnapshot : null,
            });
            setMessages((prev) => [...prev, createMessage('assistant', answer)]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'AI回答の取得に失敗しました';
            setLastError(message);
            setMessages((prev) => [
                ...prev,
                createMessage(
                    'assistant',
                    '回答取得に失敗しました。しばらくしてから再試行してください。'
                ),
            ]);
        } finally {
            setIsSending(false);
            setTimeout(() => {
                scrollToBottom();
                inputRef.current?.focus();
            }, 0);
        }
    };

    return (
        <>
            <button
                type="button"
                className="operation-assistant-fab"
                onClick={openModal}
                title="操作をAIに質問"
                aria-label="操作をAIに質問"
            >
                ❓ 操作質問
            </button>

            <Modal
                isOpen={isOpen}
                onClose={closeModal}
                title="操作AIアシスタント"
                size="medium"
                showCloseButton={!isSending}
            >
                <div className="operation-assistant-modal">
                    <div className="operation-assistant-hint">
                        画面操作の質問専用です。今の画面に合わせて手順で回答します。うまくいかない時は「画面名 / ボタン名 / 実際の表示」を送ってください。
                    </div>

                    <div className="operation-assistant-mode-wrap" role="group" aria-label="回答モード">
                        <button
                            type="button"
                            className={`operation-assistant-mode-btn ${answerMode === ANSWER_MODE.QUESTION_FIRST ? 'is-active' : ''}`}
                            disabled={isSending}
                            onClick={() => setAnswerMode(ANSWER_MODE.QUESTION_FIRST)}
                        >
                            質問優先
                        </button>
                        <button
                            type="button"
                            className={`operation-assistant-mode-btn ${answerMode === ANSWER_MODE.PAGE_FIRST ? 'is-active' : ''}`}
                            disabled={isSending}
                            onClick={() => setAnswerMode(ANSWER_MODE.PAGE_FIRST)}
                        >
                            現在ページ優先
                        </button>
                        <button
                            type="button"
                            className="operation-assistant-mode-refresh"
                            onClick={() => setPageSnapshot(collectPageSnapshot(currentView))}
                            disabled={isSending}
                            title="現在ページの情報を再取得"
                        >
                            再取得
                        </button>
                    </div>
                    {answerMode === ANSWER_MODE.PAGE_FIRST && (
                        <div className="operation-assistant-snapshot-note">
                            現在地: {currentView || '不明'}
                            {pageSnapshotSummary ? ` / 取得要素: ${pageSnapshotSummary}` : ' / 取得要素: なし'}
                        </div>
                    )}

                    <div className="operation-assistant-prompt-toggle-wrap">
                        <button
                            type="button"
                            className="operation-assistant-prompt-toggle"
                            onClick={() => setShowQuickPromptList((prev) => !prev)}
                            disabled={isSending}
                            aria-expanded={showQuickPromptList}
                        >
                            {showQuickPromptList ? '質問例を閉じる' : '質問例を表示'}
                        </button>
                    </div>

                    {showQuickPromptList && (
                        <div className="operation-assistant-quick-prompt-panel">
                            <div className="operation-assistant-quick-prompt-list">
                                {quickPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        className="operation-assistant-quick-prompt-row"
                                        onClick={() => applyQuickPrompt(prompt)}
                                        disabled={isSending}
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="operation-assistant-messages">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`operation-assistant-message operation-assistant-message--${msg.role}`}
                            >
                                <div className="operation-assistant-message-role">
                                    {msg.role === 'user' ? 'あなた' : 'AI'}
                                </div>
                                <div className="operation-assistant-message-content">{msg.content}</div>
                            </div>
                        ))}
                        {isSending && (
                            <div className="operation-assistant-message operation-assistant-message--assistant">
                                <div className="operation-assistant-message-role">AI</div>
                                <div className="operation-assistant-message-content">回答を作成中...</div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {lastError && (
                        <div className="operation-assistant-error">{lastError}</div>
                    )}

                    <form onSubmit={submitQuestion} className="operation-assistant-form">
                        <textarea
                            ref={inputRef}
                            className="operation-assistant-input"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="例: データ管理でCSVをアップロードする手順を教えて"
                            rows={3}
                            disabled={isSending}
                        />
                        <div className="operation-assistant-input-tools">
                            <VoiceInputButton
                                label="質問を音声入力"
                                size="sm"
                                disabled={isSending}
                                language="ja"
                                getCurrentValue={() => question}
                                onTranscript={(mergedText) => {
                                    setQuestion(String(mergedText || '').trim());
                                    setLastError('');
                                }}
                            />
                        </div>
                        <div className="operation-assistant-actions">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={resetConversation}
                                disabled={isSending}
                            >
                                履歴クリア
                            </Button>
                            <Button type="submit" variant="primary" disabled={!canSubmit}>
                                {isSending ? '送信中...' : '質問する'}
                            </Button>
                        </div>
                    </form>
                </div>
            </Modal>
        </>
    );
};

export default OperationAssistant;
