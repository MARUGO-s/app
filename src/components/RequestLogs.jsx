import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import './RequestLogs.css';

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

            {loading ? (
                <div className="request-logs__loading">読み込み中...</div>
            ) : (
                <div className="request-logs__table-wrap">
                    <table className="request-logs__table">
                        <thead>
                            <tr>
                                <th>日時</th>
                                <th>種別</th>
                                <th>状態</th>
                                <th>画面</th>
                                <th>タイトル</th>
                                <th>内容</th>
                                {isAdmin && <th>ユーザー</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {displayedLogs.map((log) => (
                                <tr key={log.id}>
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
