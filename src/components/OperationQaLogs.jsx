import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import './OperationQaLogs.css';

const FETCH_PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 50000;
const DELETE_BATCH_SIZE = 200;

const SOURCE_FILTERS = {
    all: 'すべて',
    ai: 'AI使用',
    fallback: 'AI試行→ローカル',
    local: 'ローカル回答',
};

const RATING_FILTERS = {
    all: '評価: すべて',
    unrated: '評価: 未評価',
    low: '評価: 低評価(1-2)',
    1: '評価: 1',
    2: '評価: 2',
    3: '評価: 3',
    4: '評価: 4',
    5: '評価: 5',
};

const SORT_MODES = {
    newest: '新しい順',
    low_first: '低評価優先',
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

const toSafeNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const toRatingScore = (value) => {
    const n = Number(value);
    if (!Number.isInteger(n)) return null;
    if (n < 1 || n > 5) return null;
    return n;
};

const clipText = (value, max = 130) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '-';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
};

const normalizeSearchText = (value) => String(value || '').toLowerCase().trim();

const getSourceBadge = (log) => {
    if (log?.ai_used) {
        return { className: 'operation-qa-logs__badge operation-qa-logs__badge--ai', label: 'AI使用' };
    }
    if (log?.ai_attempted) {
        return { className: 'operation-qa-logs__badge operation-qa-logs__badge--fallback', label: 'AI試行→ローカル' };
    }
    return { className: 'operation-qa-logs__badge operation-qa-logs__badge--local', label: 'ローカル回答' };
};

const buildCsvCell = (value) => {
    const text = String(value ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/"/g, '""');
    return `"${text}"`;
};

const filterLogsBySearch = (items, search) => {
    const keyword = normalizeSearchText(search);
    if (!keyword) return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter((log) => {
        const target = [
            log.user_email,
            log.current_view,
            log.question,
            log.answer,
            log.ai_model,
            log.answer_source,
        ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
        return target.includes(keyword);
    });
};

const applySourceFilter = (query, source) => {
    if (source === 'ai') {
        return query.eq('ai_used', true);
    }
    if (source === 'fallback') {
        return query.eq('ai_used', false).eq('ai_attempted', true);
    }
    if (source === 'local') {
        return query.eq('ai_used', false).eq('ai_attempted', false);
    }
    return query;
};

const applyRatingFilter = (query, rating) => {
    const key = String(rating || 'all');
    if (key === 'all') return query;
    if (key === 'unrated') return query.is('rating_score', null);
    if (key === 'low') return query.lte('rating_score', 2);
    const n = Number(key);
    if (Number.isInteger(n) && n >= 1 && n <= 5) return query.eq('rating_score', n);
    return query;
};

const normalizeExportRecord = (log) => {
    const badge = getSourceBadge(log).label;
    const ratingScore = toRatingScore(log.rating_score);
    return {
        id: log.id,
        created_at: log.created_at || null,
        created_at_jst: formatDate(log.created_at),
        rated_at: log.rated_at || null,
        rated_at_jst: formatDate(log.rated_at),
        rating_score: ratingScore,
        user_id: log.user_id || null,
        user_email: log.user_email || null,
        user_role: log.user_role || null,
        current_view: log.current_view || null,
        answer_mode: log.answer_mode || null,
        question: log.question || '',
        answer: log.answer || '',
        source_label: badge,
        ai_used: log.ai_used === true,
        ai_attempted: log.ai_attempted === true,
        answer_source: log.answer_source || null,
        ai_model: log.ai_model || null,
        ai_status: log.ai_status || null,
        input_tokens: log.input_tokens ?? null,
        output_tokens: log.output_tokens ?? null,
        estimated_cost_jpy: log.estimated_cost_jpy ?? null,
        metadata: log.metadata && typeof log.metadata === 'object' ? log.metadata : {},
    };
};

export default function OperationQaLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exportingType, setExportingType] = useState('');
    const [deletingType, setDeletingType] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState({
        source: 'all',
        rating: 'all',
        sort: 'newest',
        dateFrom: '',
        dateTo: '',
    });

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('operation_qa_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);

            if (filter.dateFrom) {
                query = query.gte('created_at', filter.dateFrom);
            }
            if (filter.dateTo) {
                query = query.lte('created_at', `${filter.dateTo}T23:59:59`);
            }
            query = applySourceFilter(query, filter.source);
            query = applyRatingFilter(query, filter.rating);

            const { data, error } = await query;
            if (error) throw error;
            setLogs(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('操作質問ログの取得に失敗:', error);
            alert('操作質問ログの取得に失敗しました');
        } finally {
            setLoading(false);
        }
    }, [filter.dateFrom, filter.dateTo, filter.source, filter.rating]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const displayedLogs = useMemo(() => {
        const filtered = filterLogsBySearch(logs, search);
        const sorted = [...filtered];
        if (filter.sort === 'low_first') {
            sorted.sort((a, b) => {
                const scoreA = toRatingScore(a.rating_score) ?? 6;
                const scoreB = toRatingScore(b.rating_score) ?? 6;
                if (scoreA !== scoreB) return scoreA - scoreB;
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            });
            return sorted;
        }
        sorted.sort((a, b) => (
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        ));
        return sorted;
    }, [logs, search, filter.sort]);
    const displayedIds = useMemo(() => (
        displayedLogs.map((log) => log.id).filter(Boolean)
    ), [displayedLogs]);
    const selectedCount = selectedIds.size;
    const allDisplayedSelected = displayedIds.length > 0
        && displayedIds.every((id) => selectedIds.has(id));
    const isBusy = Boolean(exportingType || deletingType);

    const stats = useMemo(() => {
        const total = displayedLogs.length;
        const aiCount = displayedLogs.filter((log) => log.ai_used).length;
        const fallbackCount = displayedLogs.filter((log) => !log.ai_used && log.ai_attempted).length;
        const localCount = displayedLogs.filter((log) => !log.ai_used && !log.ai_attempted).length;
        const tokenIn = displayedLogs.reduce((sum, log) => sum + toSafeNumber(log.input_tokens, 0), 0);
        const tokenOut = displayedLogs.reduce((sum, log) => sum + toSafeNumber(log.output_tokens, 0), 0);
        const ratedScores = displayedLogs
            .map((log) => toRatingScore(log.rating_score))
            .filter((n) => Number.isInteger(n));
        const lowRatedCount = ratedScores.filter((n) => n <= 2).length;
        const avgRating = ratedScores.length > 0
            ? (ratedScores.reduce((sum, n) => sum + n, 0) / ratedScores.length)
            : 0;
        return {
            total,
            aiCount,
            fallbackCount,
            localCount,
            tokenIn,
            tokenOut,
            ratedCount: ratedScores.length,
            lowRatedCount,
            avgRating,
        };
    }, [displayedLogs]);

    const fetchAllLogsForExport = useCallback(async () => {
        const all = [];
        for (let from = 0; from < MAX_EXPORT_ROWS; from += FETCH_PAGE_SIZE) {
            let query = supabase
                .from('operation_qa_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + FETCH_PAGE_SIZE - 1);

            if (filter.dateFrom) {
                query = query.gte('created_at', filter.dateFrom);
            }
            if (filter.dateTo) {
                query = query.lte('created_at', `${filter.dateTo}T23:59:59`);
            }
            query = applySourceFilter(query, filter.source);
            query = applyRatingFilter(query, filter.rating);

            const { data, error } = await query;
            if (error) throw error;

            const page = Array.isArray(data) ? data : [];
            all.push(...page);
            if (page.length < FETCH_PAGE_SIZE) break;
        }
        return filterLogsBySearch(all, search);
    }, [filter.dateFrom, filter.dateTo, filter.source, filter.rating, search]);

    const deleteLogsByIds = useCallback(async (ids) => {
        const targets = Array.isArray(ids) ? ids.filter(Boolean) : [];
        if (targets.length === 0) return 0;

        let deletedCount = 0;
        for (let start = 0; start < targets.length; start += DELETE_BATCH_SIZE) {
            const chunk = targets.slice(start, start + DELETE_BATCH_SIZE);
            const { error, count } = await supabase
                .from('operation_qa_logs')
                .delete({ count: 'exact' })
                .in('id', chunk);
            if (error) throw error;
            deletedCount += Number.isFinite(Number(count)) ? Number(count) : chunk.length;
        }
        return deletedCount;
    }, []);

    const handleToggleSelectOne = (id) => {
        if (!id || isBusy) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleToggleSelectAllDisplayed = () => {
        if (isBusy || displayedIds.length === 0) return;
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

    const handleClearSelection = () => {
        if (isBusy) return;
        setSelectedIds(new Set());
    };

    const handleDeleteSelected = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0 || isBusy) return;
        const ok = window.confirm(
            `選択中の ${ids.length} 件を削除します。\nこの操作は元に戻せません。実行しますか？`
        );
        if (!ok) return;

        setDeletingType('selected');
        try {
            const deleted = await deleteLogsByIds(ids);
            alert(`${deleted} 件のログを削除しました。`);
            setSelectedIds(new Set());
            await fetchLogs();
        } catch (error) {
            console.error('選択ログ削除に失敗:', error);
            alert('選択ログの削除に失敗しました。権限または接続を確認してください。');
        } finally {
            setDeletingType('');
        }
    };

    const handleDeleteAllFiltered = async () => {
        if (isBusy) return;
        setDeletingType('all');
        try {
            const logsForDelete = await fetchAllLogsForExport();
            const ids = logsForDelete.map((log) => log.id).filter(Boolean);
            if (ids.length === 0) {
                alert('削除対象ログがありません。');
                return;
            }
            const ok = window.confirm(
                `現在のフィルタ条件に一致する ${ids.length} 件を全削除します。\nこの操作は元に戻せません。実行しますか？`
            );
            if (!ok) return;

            const deleted = await deleteLogsByIds(ids);
            alert(`${deleted} 件のログを削除しました。`);
            setSelectedIds(new Set());
            await fetchLogs();
        } catch (error) {
            console.error('条件一致ログ全削除に失敗:', error);
            alert('条件一致ログの全削除に失敗しました。権限または接続を確認してください。');
        } finally {
            setDeletingType('');
        }
    };

    useEffect(() => {
        setSelectedIds((prev) => {
            if (prev.size === 0) return prev;
            const visibleSet = new Set(displayedIds);
            const next = new Set(Array.from(prev).filter((id) => visibleSet.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [displayedIds]);

    const exportCsv = async () => {
        if (isBusy) return;
        setExportingType('csv');
        try {
            const logsForExport = await fetchAllLogsForExport();
            const rows = [
                [
                    'id',
                    'created_at',
                    '日時',
                    'rating_score',
                    'rated_at',
                    'ユーザーID',
                    'ユーザー',
                    'ユーザーロール',
                    '画面',
                    '回答モード',
                    '質問',
                    '回答',
                    '回答種別',
                    'AI使用',
                    'AI試行',
                    '回答ソース',
                    'AIモデル',
                    'AIステータス',
                    '入力トークン',
                    '出力トークン',
                    '推定コスト(円)',
                    'metadata_json',
                ].join(','),
            ];

            logsForExport.forEach((rawLog) => {
                const log = normalizeExportRecord(rawLog);
                rows.push([
                    buildCsvCell(log.id || ''),
                    buildCsvCell(log.created_at || ''),
                    buildCsvCell(log.created_at_jst || ''),
                    buildCsvCell(log.rating_score ?? ''),
                    buildCsvCell(log.rated_at || ''),
                    buildCsvCell(log.user_id || ''),
                    buildCsvCell(log.user_email || ''),
                    buildCsvCell(log.user_role || ''),
                    buildCsvCell(log.current_view || ''),
                    buildCsvCell(log.answer_mode || ''),
                    buildCsvCell(log.question || ''),
                    buildCsvCell(log.answer || ''),
                    buildCsvCell(log.source_label || ''),
                    buildCsvCell(log.ai_used ? 'true' : 'false'),
                    buildCsvCell(log.ai_attempted ? 'true' : 'false'),
                    buildCsvCell(log.answer_source || ''),
                    buildCsvCell(log.ai_model || ''),
                    buildCsvCell(log.ai_status || ''),
                    buildCsvCell(log.input_tokens ?? ''),
                    buildCsvCell(log.output_tokens ?? ''),
                    buildCsvCell(log.estimated_cost_jpy ?? ''),
                    buildCsvCell(JSON.stringify(log.metadata || {})),
                ].join(','));
            });

            const csv = rows.join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `operation_qa_logs_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('CSVエクスポート用ログ取得失敗:', error);
            alert('CSV出力用ログの取得に失敗しました');
        } finally {
            setExportingType('');
        }
    };

    const exportJson = async () => {
        if (isBusy) return;
        setExportingType('json');
        try {
            const logsForExport = await fetchAllLogsForExport();
            const payload = {
                exported_at: new Date().toISOString(),
                total_rows: logsForExport.length,
                filters: {
                    source: filter.source,
                    rating: filter.rating,
                    sort: filter.sort,
                    date_from: filter.dateFrom || null,
                    date_to: filter.dateTo || null,
                    search: search || null,
                },
                rows: logsForExport.map((log) => normalizeExportRecord(log)),
            };
            const text = JSON.stringify(payload, null, 2);
            const blob = new Blob([text], { type: 'application/json;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `operation_qa_logs_${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('JSONエクスポート用ログ取得失敗:', error);
            alert('JSON出力用ログの取得に失敗しました');
        } finally {
            setExportingType('');
        }
    };

    return (
        <div className="operation-qa-logs">
            <div className="operation-qa-logs__header">
                <h1>🧾 操作質問ログ</h1>
                <div className="operation-qa-logs__header-actions">
                    <button
                        type="button"
                        className="operation-qa-logs__export"
                        onClick={exportCsv}
                        disabled={isBusy}
                    >
                        {exportingType === 'csv' ? '出力中...' : '📥 CSV一括エクスポート'}
                    </button>
                    <button
                        type="button"
                        className="operation-qa-logs__export operation-qa-logs__export--json"
                        onClick={exportJson}
                        disabled={isBusy}
                    >
                        {exportingType === 'json' ? '出力中...' : '🧩 JSON一括エクスポート'}
                    </button>
                </div>
            </div>

            <div className="operation-qa-logs__stats">
                <div className="operation-qa-logs__stat">
                    <div className="operation-qa-logs__stat-label">総質問数</div>
                    <div className="operation-qa-logs__stat-value">{stats.total.toLocaleString()}件</div>
                </div>
                <div className="operation-qa-logs__stat">
                    <div className="operation-qa-logs__stat-label">AI使用</div>
                    <div className="operation-qa-logs__stat-value">{stats.aiCount.toLocaleString()}件</div>
                </div>
                <div className="operation-qa-logs__stat">
                    <div className="operation-qa-logs__stat-label">AI試行→ローカル</div>
                    <div className="operation-qa-logs__stat-value">{stats.fallbackCount.toLocaleString()}件</div>
                </div>
                <div className="operation-qa-logs__stat">
                    <div className="operation-qa-logs__stat-label">ローカル回答</div>
                    <div className="operation-qa-logs__stat-value">{stats.localCount.toLocaleString()}件</div>
                </div>
                <div className="operation-qa-logs__stat">
                    <div className="operation-qa-logs__stat-label">トークン量</div>
                    <div className="operation-qa-logs__stat-value">
                        ↓{stats.tokenIn.toLocaleString()} / ↑{stats.tokenOut.toLocaleString()}
                    </div>
                </div>
                <div className="operation-qa-logs__stat">
                    <div className="operation-qa-logs__stat-label">評価平均</div>
                    <div className="operation-qa-logs__stat-value">
                        {stats.ratedCount > 0 ? `${stats.avgRating.toFixed(2)} / 5` : '-'}
                    </div>
                    <div className="secondary-stat">評価件数: {stats.ratedCount}件</div>
                </div>
                <div className="operation-qa-logs__stat">
                    <div className="operation-qa-logs__stat-label">低評価(1-2)</div>
                    <div className="operation-qa-logs__stat-value">{stats.lowRatedCount.toLocaleString()}件</div>
                </div>
            </div>

            <div className="operation-qa-logs__filters">
                <select
                    value={filter.source}
                    onChange={(e) => setFilter((prev) => ({ ...prev, source: e.target.value }))}
                >
                    {Object.entries(SOURCE_FILTERS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                    ))}
                </select>
                <select
                    value={filter.rating}
                    onChange={(e) => setFilter((prev) => ({ ...prev, rating: e.target.value }))}
                >
                    {Object.entries(RATING_FILTERS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                    ))}
                </select>
                <select
                    value={filter.sort}
                    onChange={(e) => setFilter((prev) => ({ ...prev, sort: e.target.value }))}
                >
                    {Object.entries(SORT_MODES).map(([id, label]) => (
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
                    className="operation-qa-logs__search"
                    placeholder="ユーザー / 質問 / 回答で検索"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <button type="button" className="operation-qa-logs__refresh" onClick={fetchLogs}>
                    🔄 更新
                </button>
            </div>

            <div className="operation-qa-logs__bulk-actions">
                <button
                    type="button"
                    className="operation-qa-logs__action-btn"
                    onClick={handleToggleSelectAllDisplayed}
                    disabled={isBusy || displayedIds.length === 0}
                >
                    {allDisplayedSelected ? '表示中の選択を解除' : '表示中を全選択'}
                </button>
                <button
                    type="button"
                    className="operation-qa-logs__action-btn"
                    onClick={handleClearSelection}
                    disabled={isBusy || selectedCount === 0}
                >
                    選択解除
                </button>
                <button
                    type="button"
                    className="operation-qa-logs__action-btn operation-qa-logs__action-btn--danger"
                    onClick={handleDeleteSelected}
                    disabled={isBusy || selectedCount === 0}
                >
                    {deletingType === 'selected' ? '削除中...' : `選択を削除 (${selectedCount})`}
                </button>
                <button
                    type="button"
                    className="operation-qa-logs__action-btn operation-qa-logs__action-btn--danger-soft"
                    onClick={handleDeleteAllFiltered}
                    disabled={isBusy}
                >
                    {deletingType === 'all' ? '全削除中...' : '条件一致を全削除'}
                </button>
            </div>
            <div className="operation-qa-logs__bulk-note">
                表示中 {displayedLogs.length} 件 / 選択 {selectedCount} 件
            </div>

            {loading ? (
                <div className="operation-qa-logs__loading">読み込み中...</div>
            ) : (
                <div className="operation-qa-logs__table-wrap">
                    <table className="operation-qa-logs__table">
                        <thead>
                            <tr>
                                <th className="operation-qa-logs__select-col">
                                    <input
                                        type="checkbox"
                                        aria-label="表示中ログを全選択"
                                        checked={allDisplayedSelected}
                                        onChange={handleToggleSelectAllDisplayed}
                                        disabled={isBusy || displayedIds.length === 0}
                                    />
                                </th>
                                <th>日時</th>
                                <th>評価</th>
                                <th>ユーザー</th>
                                <th>画面</th>
                                <th>質問</th>
                                <th>回答</th>
                                <th>回答種別</th>
                                <th>AIモデル</th>
                                <th>トークン</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedLogs.map((log) => {
                                const badge = getSourceBadge(log);
                                return (
                                    <tr key={log.id}>
                                        <td className="operation-qa-logs__select-col">
                                            <input
                                                type="checkbox"
                                                aria-label="ログを選択"
                                                checked={selectedIds.has(log.id)}
                                                onChange={() => handleToggleSelectOne(log.id)}
                                                disabled={isBusy}
                                            />
                                        </td>
                                        <td>{formatDate(log.created_at)}</td>
                                        <td>
                                            {toRatingScore(log.rating_score) ? (
                                                <span className="operation-qa-logs__rating">{toRatingScore(log.rating_score)}/5</span>
                                            ) : (
                                                <span className="operation-qa-logs__rating operation-qa-logs__rating--none">未評価</span>
                                            )}
                                        </td>
                                        <td>{log.user_email || (log.user_id ? String(log.user_id).slice(0, 8) : '-')}</td>
                                        <td>{log.current_view || '-'}</td>
                                        <td title={log.question || ''}>{clipText(log.question, 120)}</td>
                                        <td title={log.answer || ''}>{clipText(log.answer, 160)}</td>
                                        <td>
                                            <span className={badge.className}>{badge.label}</span>
                                        </td>
                                        <td>
                                            {log.ai_model ? (
                                                <code>{log.ai_model}</code>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td>
                                            {(log.input_tokens || log.output_tokens)
                                                ? `↓${toSafeNumber(log.input_tokens, 0)} / ↑${toSafeNumber(log.output_tokens, 0)}`
                                                : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {displayedLogs.length === 0 && (
                        <div className="operation-qa-logs__empty">ログがありません</div>
                    )}
                </div>
            )}
        </div>
    );
}
