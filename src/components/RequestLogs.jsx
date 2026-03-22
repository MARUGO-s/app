import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import './RequestLogs.css';

const DELETE_BATCH_SIZE = 200;

const TYPE_FILTERS = {
    all: '種別: すべて',
    feature: '機能追加',
    bug: '不具合報告',
    improvement: '改善提案',
    other: 'その他',
};

const STATUS_FILTERS = {
    all: '状態: すべて',
    open: '未対応',
    reviewing: '確認中',
    planned: '対応予定',
    resolved: '対応済み',
    closed: 'クローズ',
};

const STATUS_OPTIONS = {
    open: '未対応',
    reviewing: '確認中',
    planned: '対応予定',
    resolved: '対応済み',
    closed: 'クローズ',
};

const TYPE_BADGES = {
    feature: 'request-logs__badge request-logs__badge--feature',
    bug: 'request-logs__badge request-logs__badge--bug',
    improvement: 'request-logs__badge request-logs__badge--improvement',
    other: 'request-logs__badge request-logs__badge--other',
};

const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const clipText = (value, max = 160) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '-';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
};

const normalizeSearchText = (value) => String(value || '').toLowerCase().trim();

const applyFilterQuery = (query, filter) => {
    let next = query;
    if (filter.type !== 'all') next = next.eq('request_type', filter.type);
    if (filter.status !== 'all') next = next.eq('status', filter.status);
    if (filter.dateFrom) next = next.gte('created_at', filter.dateFrom);
    if (filter.dateTo) next = next.lte('created_at', `${filter.dateTo}T23:59:59`);
    return next;
};

const filterBySearch = (items, search) => {
    const keyword = normalizeSearchText(search);
    if (!keyword) return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter((row) => {
        const target = [
            row.user_email,
            row.current_view,
            row.title,
            row.description,
            row.request_type,
            row.status,
        ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
        return target.includes(keyword);
    });
};

const toTypeLabel = (type) => TYPE_FILTERS[type] || TYPE_FILTERS.other;
const toStatusLabel = (status) => STATUS_OPTIONS[status] || status || '-';

export default function RequestLogs({ userRole }) {
    const isAdmin = userRole === 'admin';
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState('');
    const [deletingType, setDeletingType] = useState('');
    const [deletingId, setDeletingId] = useState('');
    const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState({
        type: 'all',
        status: 'all',
        dateFrom: '',
        dateTo: '',
    });

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('user_requests')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            query = applyFilterQuery(query, filter);
            const { data, error } = await query;
            if (error) throw error;
            setLogs(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('要望ログの取得に失敗:', error);
            alert('要望ログの取得に失敗しました');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const displayedLogs = useMemo(
        () => filterBySearch(logs, search),
        [logs, search]
    );
    const displayedIds = useMemo(
        () => displayedLogs.map((row) => row.id).filter(Boolean),
        [displayedLogs]
    );
    const selectedCount = selectedIds.size;
    const allDisplayedSelected = displayedIds.length > 0
        && displayedIds.every((id) => selectedIds.has(id));

    const stats = useMemo(() => {
        const total = displayedLogs.length;
        const featureCount = displayedLogs.filter((row) => row.request_type === 'feature').length;
        const bugCount = displayedLogs.filter((row) => row.request_type === 'bug').length;
        const improvementCount = displayedLogs.filter((row) => row.request_type === 'improvement').length;
        const openCount = displayedLogs.filter((row) => row.status === 'open').length;
        const resolvedCount = displayedLogs.filter((row) => row.status === 'resolved').length;
        return {
            total,
            featureCount,
            bugCount,
            improvementCount,
            openCount,
            resolvedCount,
        };
    }, [displayedLogs]);

    const handleUpdateStatus = async (id, status) => {
        if (!isAdmin || !id || !STATUS_OPTIONS[status] || updatingId) return;
        setUpdatingId(id);
        try {
            const { error } = await supabase
                .from('user_requests')
                .update({
                    status,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);
            if (error) throw error;

            setLogs((prev) => prev.map((row) => (
                row.id === id
                    ? { ...row, status, updated_at: new Date().toISOString() }
                    : row
            )));
        } catch (error) {
            console.error('要望ステータス更新に失敗:', error);
            alert('ステータス更新に失敗しました');
        } finally {
            setUpdatingId('');
        }
    };

    const deleteRequestsByIds = useCallback(async (ids) => {
        const targets = Array.isArray(ids) ? ids.filter(Boolean) : [];
        if (targets.length === 0) return 0;

        let deletedCount = 0;
        for (let start = 0; start < targets.length; start += DELETE_BATCH_SIZE) {
            const chunk = targets.slice(start, start + DELETE_BATCH_SIZE);
            const { error, count } = await supabase
                .from('user_requests')
                .delete({ count: 'exact' })
                .in('id', chunk);
            if (error) throw error;
            deletedCount += Number.isFinite(Number(count)) ? Number(count) : chunk.length;
        }
        return deletedCount;
    }, []);

    const handleDeleteOne = async (id) => {
        if (!isAdmin || !id || deletingType) return;
        const ok = window.confirm('この要望を削除します。実行しますか？');
        if (!ok) return;
        setDeletingType('single');
        setDeletingId(id);
        try {
            const deleted = await deleteRequestsByIds([id]);
            if (deleted > 0) {
                setLogs((prev) => prev.filter((row) => row.id !== id));
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }
        } catch (error) {
            console.error('要望の個別削除に失敗:', error);
            alert('要望の削除に失敗しました');
        } finally {
            setDeletingType('');
            setDeletingId('');
        }
    };

    const handleToggleSelectOne = (id) => {
        if (!isAdmin || !isBulkDeleteMode || deletingType || !id) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleToggleSelectAllDisplayed = () => {
        if (!isAdmin || !isBulkDeleteMode || deletingType || displayedIds.length === 0) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allDisplayedSelected) {
                displayedIds.forEach((id) => next.delete(id));
            } else {
                displayedIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    const handleBulkDeleteSelected = async () => {
        if (!isAdmin || !isBulkDeleteMode || deletingType) return;
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const ok = window.confirm(
            `選択した ${ids.length} 件の要望を削除します。\nこの操作は元に戻せません。実行しますか？`
        );
        if (!ok) return;

        setDeletingType('selected');
        setDeletingId('');
        try {
            const deleted = await deleteRequestsByIds(ids);
            alert(`${deleted} 件の要望を削除しました。`);
            const deletedSet = new Set(ids);
            setLogs((prev) => prev.filter((row) => !deletedSet.has(row.id)));
            setSelectedIds(new Set());
        } catch (error) {
            console.error('要望の一括削除に失敗:', error);
            alert('要望の一括削除に失敗しました');
        } finally {
            setDeletingType('');
        }
    };

    useEffect(() => {
        if (!isBulkDeleteMode) {
            setSelectedIds(new Set());
            return;
        }
        setSelectedIds((prev) => {
            if (prev.size === 0) return prev;
            const visibleSet = new Set(displayedIds);
            const next = new Set(Array.from(prev).filter((id) => visibleSet.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [displayedIds, isBulkDeleteMode]);

    return (
        <div className="request-logs">
            <div className="request-logs__header">
                <h1>📨 要望一覧</h1>
                <button
                    type="button"
                    className="request-logs__refresh"
                    onClick={fetchLogs}
                    disabled={loading}
                >
                    🔄 更新
                </button>
            </div>

            <div className="request-logs__stats">
                <div className="request-logs__stat">
                    <div className="request-logs__stat-label">総件数</div>
                    <div className="request-logs__stat-value">{stats.total.toLocaleString()}件</div>
                </div>
                <div className="request-logs__stat">
                    <div className="request-logs__stat-label">機能追加</div>
                    <div className="request-logs__stat-value">{stats.featureCount.toLocaleString()}件</div>
                </div>
                <div className="request-logs__stat">
                    <div className="request-logs__stat-label">不具合</div>
                    <div className="request-logs__stat-value">{stats.bugCount.toLocaleString()}件</div>
                </div>
                <div className="request-logs__stat">
                    <div className="request-logs__stat-label">改善提案</div>
                    <div className="request-logs__stat-value">{stats.improvementCount.toLocaleString()}件</div>
                </div>
                <div className="request-logs__stat">
                    <div className="request-logs__stat-label">未対応</div>
                    <div className="request-logs__stat-value">{stats.openCount.toLocaleString()}件</div>
                </div>
                <div className="request-logs__stat">
                    <div className="request-logs__stat-label">対応済み</div>
                    <div className="request-logs__stat-value">{stats.resolvedCount.toLocaleString()}件</div>
                </div>
            </div>

            <div className="request-logs__filters">
                <select
                    value={filter.type}
                    onChange={(e) => setFilter((prev) => ({ ...prev, type: e.target.value }))}
                >
                    {Object.entries(TYPE_FILTERS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                    ))}
                </select>
                <select
                    value={filter.status}
                    onChange={(e) => setFilter((prev) => ({ ...prev, status: e.target.value }))}
                >
                    {Object.entries(STATUS_FILTERS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                    ))}
                </select>
                <input
                    type="date"
                    value={filter.dateFrom}
                    onChange={(e) => setFilter((prev) => ({ ...prev, dateFrom: e.target.value }))}
                />
                <input
                    type="date"
                    value={filter.dateTo}
                    onChange={(e) => setFilter((prev) => ({ ...prev, dateTo: e.target.value }))}
                />
                <input
                    type="text"
                    className="request-logs__search"
                    placeholder="タイトル / 内容 / ユーザーで検索"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {isAdmin && (
                <>
                    <div className="request-logs__bulk-actions">
                        <button
                            type="button"
                            className="request-logs__action-btn"
                            onClick={() => setIsBulkDeleteMode((prev) => !prev)}
                            disabled={Boolean(deletingType)}
                        >
                            {isBulkDeleteMode ? '一括削除を終了' : '一括削除'}
                        </button>
                        {isBulkDeleteMode && (
                            <>
                                <button
                                    type="button"
                                    className="request-logs__action-btn"
                                    onClick={handleToggleSelectAllDisplayed}
                                    disabled={Boolean(deletingType) || displayedIds.length === 0}
                                >
                                    {allDisplayedSelected ? '表示中の選択を解除' : '表示中を全選択'}
                                </button>
                                <button
                                    type="button"
                                    className="request-logs__action-btn"
                                    onClick={() => setSelectedIds(new Set())}
                                    disabled={Boolean(deletingType) || selectedCount === 0}
                                >
                                    選択解除
                                </button>
                                <button
                                    type="button"
                                    className="request-logs__action-btn request-logs__action-btn--danger"
                                    onClick={handleBulkDeleteSelected}
                                    disabled={Boolean(deletingType) || selectedCount === 0}
                                >
                                    {deletingType === 'selected' ? '削除中...' : `選択を一括削除 (${selectedCount})`}
                                </button>
                            </>
                        )}
                    </div>
                    {isBulkDeleteMode && (
                        <div className="request-logs__bulk-note">
                            表示中 {displayedLogs.length} 件 / 選択 {selectedCount} 件
                        </div>
                    )}
                </>
            )}

            {loading ? (
                <div className="request-logs__loading">読み込み中...</div>
            ) : (
                <div className="request-logs__table-wrap">
                    <table className="request-logs__table">
                        <thead>
                            <tr>
                                {isAdmin && isBulkDeleteMode && (
                                    <th className="request-logs__select-col">
                                        <input
                                            type="checkbox"
                                            aria-label="表示中の要望を全選択"
                                            checked={allDisplayedSelected}
                                            onChange={handleToggleSelectAllDisplayed}
                                            disabled={Boolean(deletingType) || displayedIds.length === 0}
                                        />
                                    </th>
                                )}
                                <th>日時</th>
                                <th>種別</th>
                                <th>状態</th>
                                <th>画面</th>
                                <th>タイトル</th>
                                <th>内容</th>
                                {isAdmin && <th>ユーザー</th>}
                                {isAdmin && <th>操作</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {displayedLogs.map((log) => (
                                <tr key={log.id}>
                                    {isAdmin && isBulkDeleteMode && (
                                        <td className="request-logs__select-col">
                                            <input
                                                type="checkbox"
                                                aria-label="要望を選択"
                                                checked={selectedIds.has(log.id)}
                                                onChange={() => handleToggleSelectOne(log.id)}
                                                disabled={Boolean(deletingType)}
                                            />
                                        </td>
                                    )}
                                    <td>{formatDate(log.created_at)}</td>
                                    <td>
                                        <span className={TYPE_BADGES[log.request_type] || TYPE_BADGES.other}>
                                            {toTypeLabel(log.request_type)}
                                        </span>
                                    </td>
                                    <td>
                                        {isAdmin ? (
                                            <select
                                                className="request-logs__status-select"
                                                value={log.status || 'open'}
                                                onChange={(e) => handleUpdateStatus(log.id, e.target.value)}
                                                disabled={updatingId === log.id}
                                            >
                                                {Object.entries(STATUS_OPTIONS).map(([id, label]) => (
                                                    <option key={id} value={id}>{label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="request-logs__status-label">
                                                {toStatusLabel(log.status)}
                                            </span>
                                        )}
                                    </td>
                                    <td>{log.current_view || '-'}</td>
                                    <td title={log.title || ''}>{clipText(log.title, 90)}</td>
                                    <td title={log.description || ''}>{clipText(log.description, 190)}</td>
                                    {isAdmin && (
                                        <td>{log.user_email || (log.user_id ? String(log.user_id).slice(0, 8) : '-')}</td>
                                    )}
                                    {isAdmin && (
                                        <td>
                                            <button
                                                type="button"
                                                className="request-logs__delete-btn"
                                                onClick={() => handleDeleteOne(log.id)}
                                                disabled={Boolean(deletingType) || updatingId === log.id}
                                            >
                                                {deletingType === 'single' && deletingId === log.id ? '削除中...' : '削除'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {displayedLogs.length === 0 && (
                        <div className="request-logs__empty">要望はありません</div>
                    )}
                </div>
            )}
        </div>
    );
}
