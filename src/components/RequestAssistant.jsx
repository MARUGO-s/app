import { useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { supabase } from '../supabase';
import './RequestAssistant.css';

const REQUEST_TYPES = {
    feature: '機能追加',
    bug: '不具合報告',
    improvement: '改善提案',
    other: 'その他',
};

const VIEW_LABEL_MAP = {
    list: 'レシピ一覧',
    detail: 'レシピ詳細',
    create: 'レシピ作成',
    edit: 'レシピ編集',
    data: 'データ管理',
    'data-management': 'データ管理',
    inventory: '在庫管理',
    'incoming-deliveries': '入荷PDF',
    'incoming-stock': '入荷在庫',
    planner: '仕込みカレンダー',
    'order-list': '発注リスト',
    users: 'ユーザー管理',
    'api-logs': 'API使用ログ',
    'operation-logs': '操作質問ログ',
    requests: '要望一覧',
    trash: 'ゴミ箱',
};

const normalizeText = (value, max = 20000) => String(value || '').trim().slice(0, max);

export default function RequestAssistant({ currentView, userRole }) {
    const [isOpen, setIsOpen] = useState(false);
    const [requestType, setRequestType] = useState('feature');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState('');
    const [submitError, setSubmitError] = useState('');
    const titleRef = useRef(null);

    const currentViewLabel = useMemo(
        () => VIEW_LABEL_MAP[currentView] || String(currentView || '不明'),
        [currentView]
    );

    const canSubmit = !isSubmitting;

    const openModal = () => {
        setSubmitMessage('');
        setSubmitError('');
        setIsOpen(true);
        setTimeout(() => {
            titleRef.current?.focus();
        }, 0);
    };

    const closeModal = () => {
        if (isSubmitting) return;
        setIsOpen(false);
    };

    const resetForm = () => {
        if (isSubmitting) return;
        setRequestType('feature');
        setTitle('');
        setDescription('');
        setSubmitMessage('');
        setSubmitError('');
        setTimeout(() => {
            titleRef.current?.focus();
        }, 0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const safeType = REQUEST_TYPES[requestType] ? requestType : 'other';
        const safeTitle = normalizeText(title, 200);
        const safeDescription = normalizeText(description, 20000);
        if (safeTitle.length < 1 || safeDescription.length < 1) {
            setSubmitError('タイトルと内容を入力してください。');
            return;
        }

        setIsSubmitting(true);
        setSubmitMessage('');
        setSubmitError('');
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError) throw authError;
            const authUser = authData?.user;
            if (!authUser?.id) {
                throw new Error('ログイン状態を確認できませんでした。再ログイン後に再試行してください。');
            }

            const pagePath = typeof window !== 'undefined'
                ? `${window.location.pathname}${window.location.search}`
                : null;

            const payload = {
                user_id: authUser.id,
                user_email: authUser.email || null,
                user_role: userRole === 'admin' ? 'admin' : 'user',
                request_type: safeType,
                status: 'open',
                title: safeTitle,
                description: safeDescription,
                current_view: String(currentView || '').trim() || null,
                page_path: pagePath,
                metadata: {
                    source: 'request_assistant_modal',
                    current_view_label: currentViewLabel,
                },
            };

            const { error } = await supabase
                .from('user_requests')
                .insert(payload);
            if (error) throw error;

            setSubmitMessage('要望を送信しました。ありがとうございます。');
            setTitle('');
            setDescription('');
        } catch (error) {
            console.error('要望送信に失敗:', error);
            const message = error instanceof Error ? error.message : '要望の送信に失敗しました';
            setSubmitError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <button
                type="button"
                className="request-assistant-fab"
                onClick={openModal}
                title="要望を送る"
                aria-label="要望を送る"
            >
                📨 要望
            </button>

            <Modal
                isOpen={isOpen}
                onClose={closeModal}
                title="要望"
                size="medium"
                showCloseButton={!isSubmitting}
            >
                <div className="request-assistant-modal">
                    <div className="request-assistant-hint">
                        「機能追加してほしい」「この画面で不具合がある」などを送ってください。現在画面も一緒に保存されます。
                    </div>

                    <div className="request-assistant-current-view">
                        現在画面: {currentViewLabel}
                    </div>

                    <form onSubmit={handleSubmit} className="request-assistant-form">
                        <label className="request-assistant-label">
                            種別
                            <select
                                value={requestType}
                                onChange={(e) => setRequestType(e.target.value)}
                                disabled={isSubmitting}
                            >
                                {Object.entries(REQUEST_TYPES).map(([id, label]) => (
                                    <option key={id} value={id}>{label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="request-assistant-label">
                            タイトル
                            <input
                                ref={titleRef}
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="例: CSV取込後に保存ボタンが反応しない"
                                disabled={isSubmitting}
                                maxLength={200}
                            />
                        </label>

                        <label className="request-assistant-label">
                            内容
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="再現手順、期待結果、実際の表示、エラー文などを記載してください。"
                                rows={5}
                                disabled={isSubmitting}
                                maxLength={20000}
                            />
                        </label>

                        {submitMessage && (
                            <div className="request-assistant-message request-assistant-message--success">
                                {submitMessage}
                            </div>
                        )}
                        {submitError && (
                            <div className="request-assistant-message request-assistant-message--error">
                                {submitError}
                            </div>
                        )}

                        <div className="request-assistant-actions">
                            <Button type="button" variant="ghost" onClick={resetForm} disabled={isSubmitting}>
                                クリア
                            </Button>
                            <Button type="submit" variant="primary" disabled={!canSubmit}>
                                {isSubmitting ? '送信中...' : '送信する'}
                            </Button>
                        </div>
                    </form>
                </div>
            </Modal>
        </>
    );
}
