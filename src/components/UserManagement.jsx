import React, { useState, useEffect, useRef } from 'react';
import { userService } from '../services/userService';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';
import { useAuth } from '../contexts/useAuth';
import { formatDisplayId } from '../utils/formatUtils';
import { STORE_LIST } from '../constants';
import { featureFlagService } from '../services/featureFlagService';
import './UserManagement.css';

const NARROW_BREAKPOINT = 480;
const PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (value) => String(value).padStart(2, '0');

const getJstDayWindow = (baseDate = new Date()) => {
    const safeBase = baseDate instanceof Date ? baseDate : new Date(baseDate);
    const jst = new Date(safeBase.getTime() + JST_OFFSET_MS);
    const year = jst.getUTCFullYear();
    const month = jst.getUTCMonth();
    const date = jst.getUTCDate();
    const startMs = Date.UTC(year, month, date, 0, 0, 0, 0) - JST_OFFSET_MS;
    const endMs = startMs + DAY_MS;
    return {
        startMs,
        endMs,
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(endMs).toISOString(),
        label: `${year}/${pad2(month + 1)}/${pad2(date)}`,
    };
};

const getNextJstMidnightDelayMs = () => {
    const now = Date.now();
    const { endMs } = getJstDayWindow(new Date(now));
    return Math.max(1000, endMs - now + 1000);
};

const toSafeTimestamp = (value) => {
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : null;
};

const formatDateTime = (value) => {
    const ts = toSafeTimestamp(value);
    if (ts === null) return '記録なし';
    return new Date(ts).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const formatApiLogDetail = (log) => {
    const meta = (log?.metadata && typeof log.metadata === 'object') ? log.metadata : {};
    const audioSec = Number(meta?.audio_duration_sec);
    if (Number.isFinite(audioSec) && audioSec > 0) {
        return `🎤 ${audioSec.toFixed(2)}秒`;
    }
    const inTok = Number(log?.input_tokens);
    const outTok = Number(log?.output_tokens);
    const hasIn = Number.isFinite(inTok) && inTok > 0;
    const hasOut = Number.isFinite(outTok) && outTok > 0;
    if (hasIn || hasOut) {
        const inText = hasIn ? `↓${Math.trunc(inTok)}` : '↓0';
        const outText = hasOut ? `↑${Math.trunc(outTok)}` : '↑0';
        return `${inText} / ${outText}`;
    }
    return '-';
};

const formatApiStatus = (value) => {
    const key = String(value || '').toLowerCase();
    if (key === 'success') return '成功';
    if (key === 'error') return 'エラー';
    if (key === 'rate_limited') return '制限';
    return key || '-';
};

const isPresenceUnavailableError = (error) => {
    const code = String(error?.code || '').toUpperCase();
    const text = [
        error?.message,
        error?.details,
        error?.hint,
    ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return true;
    return text.includes('user_presence') && (
        text.includes('does not exist')
        || text.includes('relation')
        || text.includes('could not find')
    );
};

export const UserManagement = ({ onBack, onMaintenanceModeChange }) => {
    const { user: currentUser, patchCurrentUserProfile } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isNarrow, setIsNarrow] = useState(false);
    const innerRef = useRef(null);
    const [resetTarget, setResetTarget] = useState(null); // { id, display_id, email }
    const [resetPw1, setResetPw1] = useState('');
    const [resetPw2, setResetPw2] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
    const [savingMasterTargets, setSavingMasterTargets] = useState(new Set());
    const [storeEditTarget, setStoreEditTarget] = useState(null);
    const [storeDraft, setStoreDraft] = useState('');
    const [storeEditError, setStoreEditError] = useState('');
    const [isSavingStore, setIsSavingStore] = useState(false);

    // Login Logs state
    const [logTarget, setLogTarget] = useState(null); // { id, display_id, email }
    const [loginLogs, setLoginLogs] = useState([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [historyTab, setHistoryTab] = useState('login');
    const [dailyApiLogs, setDailyApiLogs] = useState([]);
    const [isLoadingDailyApiLogs, setIsLoadingDailyApiLogs] = useState(false);
    const [dailyApiLogsError, setDailyApiLogsError] = useState('');
    const [presenceMap, setPresenceMap] = useState({});
    const [isLoadingPresence, setIsLoadingPresence] = useState(false);
    const [maintenanceMode, setMaintenanceMode] = useState(null);
    const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
    const [isPresenceFeatureAvailable, setIsPresenceFeatureAvailable] = useState(true);
    const [presenceError, setPresenceError] = useState('');
    const [dailyActivityMap, setDailyActivityMap] = useState({});
    const [dailyActivityWindow, setDailyActivityWindow] = useState(() => getJstDayWindow(new Date()));
    const [isLoadingDailyActivity, setIsLoadingDailyActivity] = useState(false);
    const [dailyActivityError, setDailyActivityError] = useState('');

    // Delete User state
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const isSuperAdmin = () => false;

    const loadUsers = React.useCallback(async () => {
        try {
            setLoading(true);
            const data = await userService.fetchAllProfiles();
            setUsers(data);
        } catch (err) {
            console.error(err);
            setError('ユーザー一覧の取得に失敗しました');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadDailyActivity = React.useCallback(async () => {
        const dayWindow = getJstDayWindow(new Date());
        setDailyActivityWindow(dayWindow);
        setIsLoadingDailyActivity(true);
        setDailyActivityError('');
        try {
            const rows = await userService.adminGetApiActivityInRange({
                fromIso: dayWindow.startIso,
                toIso: dayWindow.endIso,
            });
            const nextMap = {};
            (Array.isArray(rows) ? rows : []).forEach((row) => {
                const userId = String(row?.user_id || '').trim();
                if (!userId) return;
                nextMap[userId] = {
                    lastApiAt: row?.last_api_at || null,
                };
            });
            setDailyActivityMap(nextMap);
        } catch (err) {
            console.error(err);
            setDailyActivityMap({});
            setDailyActivityError('今日のAPI利用状況の取得に失敗しました');
        } finally {
            setIsLoadingDailyActivity(false);
        }
    }, []);

    const loadPresence = React.useCallback(async () => {
        if (!isPresenceFeatureAvailable) return;
        setIsLoadingPresence(true);
        setPresenceError('');
        try {
            const rows = await userService.adminGetUserPresence();
            const nextMap = {};
            (Array.isArray(rows) ? rows : []).forEach((row) => {
                const userId = String(row?.user_id || '').trim();
                if (!userId) return;
                nextMap[userId] = {
                    isOnline: row?.is_online === true,
                    lastSeenAt: row?.last_seen_at || null,
                };
            });
            setPresenceMap(nextMap);
            setIsPresenceFeatureAvailable(true);
        } catch (error) {
            console.error(error);
            if (isPresenceUnavailableError(error)) {
                setPresenceMap({});
                setPresenceError('');
                setIsPresenceFeatureAvailable(false);
                return;
            }
            setPresenceMap({});
            setPresenceError('ログイン中状態の取得に失敗しました');
        } finally {
            setIsLoadingPresence(false);
        }
    }, [isPresenceFeatureAvailable]);

    useEffect(() => {
        loadUsers();
        loadDailyActivity();
        loadPresence();
    }, [loadUsers, loadDailyActivity, loadPresence]);

    useEffect(() => {
        let timerId = null;
        const scheduleNextRefresh = () => {
            timerId = window.setTimeout(async () => {
                await loadDailyActivity();
                scheduleNextRefresh();
            }, getNextJstMidnightDelayMs());
        };
        scheduleNextRefresh();
        return () => {
            if (timerId !== null) {
                window.clearTimeout(timerId);
            }
        };
    }, [loadDailyActivity]);

    useEffect(() => {
        if (!isPresenceFeatureAvailable) return undefined;
        const id = window.setInterval(() => {
            loadPresence();
        }, 60_000);
        return () => window.clearInterval(id);
    }, [loadPresence, isPresenceFeatureAvailable]);

    useEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        const supportsResizeObserver = typeof window !== 'undefined' && typeof window.ResizeObserver !== 'undefined';
        if (!supportsResizeObserver) {
            setIsNarrow(el.getBoundingClientRect().width < NARROW_BREAKPOINT);
            return undefined;
        }

        const ro = new window.ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                setIsNarrow(w < NARROW_BREAKPOINT);
            }
        });
        ro.observe(el);
        setIsNarrow(el.getBoundingClientRect().width < NARROW_BREAKPOINT);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        let cancelled = false;
        featureFlagService.getMaintenanceMode({ force: true })
            .then((enabled) => {
                if (!cancelled) setMaintenanceMode(enabled === true);
            })
            .catch((error) => {
                console.warn('maintenance mode load failed:', error);
                if (!cancelled) setMaintenanceMode(false);
            });
        return () => { cancelled = true; };
    }, []);

    const toggleMaintenance = async () => {
        setIsTogglingMaintenance(true);
        setError(null);
        try {
            const next = !maintenanceMode;
            const enabled = await featureFlagService.setMaintenanceMode(next);
            setMaintenanceMode(enabled);
            onMaintenanceModeChange?.(enabled);
        } catch (e) {
            console.error('maintenance toggle failed:', e);
            setError('メンテナンスモードの切り替えに失敗しました。権限または通信状態を確認してください。');
        } finally {
            setIsTogglingMaintenance(false);
        }
    };

    const admins = users.filter(u => u.role === 'admin');
    const regulars = users.filter(u => u.role !== 'admin');

    const setSavingForUser = (userId, saving) => {
        setSavingMasterTargets(prev => {
            const next = new Set(prev);
            if (saving) next.add(userId);
            else next.delete(userId);
            return next;
        });
    };

    const handleToggleMasterRecipeVisibility = async (targetUser, newVal) => {
        const previousVal = Boolean(targetUser.show_master_recipes);
        setError(null);

        setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, show_master_recipes: newVal } : u));
        if (targetUser.id === currentUser?.id) {
            patchCurrentUserProfile?.({ showMasterRecipes: newVal });
        }
        setSavingForUser(targetUser.id, true);

        try {
            const updated = await userService.updateProfile(targetUser.id, { show_master_recipes: newVal });
            const confirmed = Boolean(updated?.show_master_recipes);
            setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, show_master_recipes: confirmed } : u));
            if (targetUser.id === currentUser?.id) {
                patchCurrentUserProfile?.({ showMasterRecipes: confirmed });
            }
        } catch (err) {
            console.error(err);
            setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, show_master_recipes: previousVal } : u));
            if (targetUser.id === currentUser?.id) {
                patchCurrentUserProfile?.({ showMasterRecipes: previousVal });
            }
            setError('マスターレシピ共有設定の保存に失敗しました。権限設定（RLS）を確認してください。');
        } finally {
            setSavingForUser(targetUser.id, false);
        }
    };

    const handleOpenLoginLogs = async (user) => {
        setLogTarget(user);
        setHistoryTab('login');
        setDailyApiLogs([]);
        setDailyApiLogsError('');
        setIsLoadingLogs(true);
        setIsLoadingDailyApiLogs(true);
        setError('');
        try {
            const [loginResult, apiResult] = await Promise.allSettled([
                userService.adminGetLoginLogs(user.id),
                userService.adminGetUserApiLogs({
                    userId: user.id,
                }),
            ]);

            if (loginResult.status === 'fulfilled') {
                setLoginLogs(Array.isArray(loginResult.value) ? loginResult.value : []);
            } else {
                console.error(loginResult.reason);
                setLoginLogs([]);
                setError('アクティブ履歴の取得に失敗しました');
            }

            if (apiResult.status === 'fulfilled') {
                setDailyApiLogs(Array.isArray(apiResult.value) ? apiResult.value : []);
            } else {
                console.error(apiResult.reason);
                setDailyApiLogs([]);
                setDailyApiLogsError('API利用履歴の取得に失敗しました');
            }
        } catch (err) {
            console.error(err);
            setError('アクティブ履歴の取得に失敗しました');
        } finally {
            setIsLoadingLogs(false);
            setIsLoadingDailyApiLogs(false);
        }
    };

    const handleRoleChange = async (targetUser, newRole) => {
        setError(null);
        try {
            await userService.adminSetRole(targetUser.id, newRole);
            setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role: newRole } : u));
        } catch (err) {
            console.error(err);
            setError('権限の変更に失敗しました。');
        }
    };

    const openStoreEditor = (targetUser) => {
        setStoreEditTarget(targetUser);
        setStoreDraft(targetUser?.store_name || '');
        setStoreEditError('');
    };

    const handleSaveStoreAssignment = async () => {
        if (!storeEditTarget?.id) return;
        setIsSavingStore(true);
        setStoreEditError('');

        try {
            const updated = await userService.adminSetProfileStoreName(storeEditTarget.id, storeDraft);
            const confirmedStoreName = String(updated?.store_name || '').trim();

            setUsers(prev => prev.map((user) => (
                user.id === storeEditTarget.id
                    ? {
                        ...user,
                        store_name: confirmedStoreName,
                        updated_at: updated?.updated_at || user.updated_at,
                    }
                    : user
            )));

            if (storeEditTarget.id === currentUser?.id) {
                patchCurrentUserProfile?.({ storeName: confirmedStoreName });
            }

            setStoreEditTarget(null);
        } catch (err) {
            console.error(err);
            setStoreEditError(err?.message || '店舗配属の保存に失敗しました');
        } finally {
            setIsSavingStore(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        setError(null);
        try {
            await userService.adminDeleteUser(deleteTarget.id);
            setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            setError('ユーザーの削除に失敗しました。');
        } finally {
            setIsDeleting(false);
        }
    };

    const getLoginAgeInfo = (lastSignInAt) => {
        if (!lastSignInAt) return null;

        const ts = new Date(lastSignInAt).getTime();
        if (!Number.isFinite(ts)) return null;

        const diffMs = Date.now() - ts;
        const rawDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const days = Math.max(0, rawDays);

        if (days >= 30) {
            return { days, text: '1ヶ月以上' };
        }
        return { days, text: `${days}日前` };
    };

    const getLoginBadge = (lastSignInAt) => {
        const info = getLoginAgeInfo(lastSignInAt);
        if (!info) {
            return { text: '記録なし', color: '#666666', bg: '#f0f0f0' };
        }

        const days = info.days;
        if (days <= 1) {
            return { text: info.text, color: '#ff2d55', bg: '#ffe5e9' };
        }
        if (days <= 3) {
            return { text: info.text, color: '#ff9500', bg: '#fff0d4' };
        }
        if (days <= 7) {
            return { text: info.text, color: '#34c759', bg: '#e5f9e7' };
        }
        if (days < 30) {
            return { text: info.text, color: '#007aff', bg: '#e5f1ff' };
        }
        return { text: info.text, color: '#6b7280', bg: '#eef0f3' };
    };

    const UserCard = ({
        user,
        isAdmin,
        isSuperAdmin,
        currentUser,
        handleRoleChange,
        handleOpenStoreEditor,
        savingMasterTargets,
        handleToggleMasterRecipeVisibility,
        handleOpenLoginLogs,
        setResetTarget,
        setResetPw1,
        setResetPw2,
        setResetError,
        setResetSuccess,
        setDeleteTarget,
        dailyActivityMap,
        dailyActivityWindow,
        isLoadingDailyActivity,
        presenceMap,
        isLoadingPresence,
        isPresenceFeatureAvailable,
    }) => {
        const effectiveLastActiveAt = user.last_active_at || user.last_sign_in_at || null;
        const badge = getLoginBadge(effectiveLastActiveAt);
        const loginAge = getLoginAgeInfo(effectiveLastActiveAt);
        const isEditableRoleTarget = !isSuperAdmin(user) && currentUser?.id !== user.id;
        const presence = presenceMap?.[user.id] || null;
        const presenceTs = toSafeTimestamp(presence?.lastSeenAt);
        const isPresenceFresh = presenceTs !== null
            && (Date.now() - presenceTs) <= PRESENCE_ONLINE_WINDOW_MS;
        const onlineNow = presence?.isOnline === true && isPresenceFresh;
        const presenceClass = onlineNow
            ? 'user-management__presence-pill user-management__presence-pill--online'
            : 'user-management__presence-pill user-management__presence-pill--offline';
        const presenceText = !isPresenceFeatureAvailable
            ? '未設定'
            : (isLoadingPresence ? '判定中' : (onlineNow ? 'ログイン中' : 'オフライン'));
        const loginAtTs = toSafeTimestamp(effectiveLastActiveAt);
        const loggedInToday = loginAtTs !== null
            && loginAtTs >= dailyActivityWindow.startMs
            && loginAtTs < dailyActivityWindow.endMs;
        const presenceSeenToday = presenceTs !== null
            && presenceTs >= dailyActivityWindow.startMs
            && presenceTs < dailyActivityWindow.endMs;
        const apiToday = dailyActivityMap?.[user.id] || null;
        const usedApiToday = Boolean(apiToday?.lastApiAt);
        const todayActive = onlineNow || loggedInToday || usedApiToday || presenceSeenToday;
        const todayStateText = todayActive ? 'アクティブ' : '未アクティブ';
        const todayStateClass = todayActive
            ? 'user-management__activity-pill user-management__activity-pill--active'
            : 'user-management__activity-pill user-management__activity-pill--inactive';
        let todayReasonText = 'ログイン / API利用なし';
        if (onlineNow && usedApiToday) todayReasonText = 'ログイン中 + API利用';
        else if (onlineNow) todayReasonText = 'ログイン中';
        else if (loggedInToday && usedApiToday) todayReasonText = 'ログイン + API利用';
        else if (loggedInToday) todayReasonText = 'ログイン';
        else if (usedApiToday) todayReasonText = 'API利用';
        else if (presenceSeenToday) todayReasonText = '画面アクセス(セッション継続)';

        return (
            <Card key={user.id} className="user-management__card">
                <div className="user-management__card-left">
                    <div className="user-management__identity-row">
                        <span className="user-management__display-id">{formatDisplayId(user.display_id)}</span>
                        {isAdmin && <span className="user-management__role-badge">管理者</span>}
                        {badge && (
                            <span className="user-management__login-badge" style={{
                                backgroundColor: badge.bg,
                                color: badge.color,
                                borderColor: badge.color
                            }}>
                                {badge.text}
                            </span>
                        )}
                    </div>
                    {user.email && (
                        <div className="user-management__email">
                            {user.email}
                        </div>
                    )}
                    <div className="user-management__meta">
                        店舗配属:
                        <span className={`user-management__store-chip ${user.store_name ? '' : 'user-management__store-chip--empty'}`}>
                            {user.store_name || '未設定'}
                        </span>
                    </div>
                    <div className="user-management__meta">
                        登録: {new Date(user.created_at).toLocaleString()}
                    </div>
                    <div className="user-management__meta">
                        更新: {user.updated_at ? new Date(user.updated_at).toLocaleString() : '---'}
                    </div>
                    <div className="user-management__meta">
                        最終アクティブ: {loginAge ? loginAge.text : '記録なし'}
                    </div>
                    <div className="user-management__meta">
                        現在ステータス: <span className={presenceClass}>{presenceText}</span>
                        <span className="user-management__activity-reason">
                            {!isPresenceFeatureAvailable
                                ? 'presence機能未適用'
                                : (presenceTs !== null ? `最終更新 ${formatDateTime(presenceTs)}` : 'ハートビート未記録')}
                        </span>
                    </div>
                    <div className="user-management__meta">
                        今日の状態(JST): <span className={todayStateClass}>{todayStateText}</span>
                        <span className="user-management__activity-reason">{todayReasonText}</span>
                    </div>
                    <div className="user-management__meta">
                        今日の最終API利用: {usedApiToday ? formatDateTime(apiToday.lastApiAt) : (
                            isLoadingDailyActivity ? '集計中...' : '記録なし'
                        )}
                    </div>
                </div>

                <div className="user-management__card-right">
                    {isEditableRoleTarget && (
                        <div className="user-management__role-toggle-wrap">
                            <button
                                type="button"
                                className={`user-management__role-toggle-btn ${user.role !== 'admin' ? 'user-management__role-toggle-btn--active' : ''}`}
                                onClick={() => handleRoleChange(user, 'user')}
                                disabled={user.role !== 'admin'}
                            >
                                通常
                            </button>
                            <button
                                type="button"
                                className={`user-management__role-toggle-btn user-management__role-toggle-btn--admin ${user.role === 'admin' ? 'user-management__role-toggle-btn--active' : ''}`}
                                onClick={() => handleRoleChange(user, 'admin')}
                                disabled={user.role === 'admin'}
                            >
                                管理者
                            </button>
                        </div>
                    )}

                    <div className="user-management__card-actions-row">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenStoreEditor(user)}
                            className="user-management__action-btn"
                        >
                            店舗配属
                        </Button>
                        {!isSuperAdmin(user) && (
                            <label className="user-management__master-toggle">
                                <input
                                    type="checkbox"
                                    checked={user.show_master_recipes || false}
                                    disabled={savingMasterTargets.has(user.id)}
                                    onChange={(e) => handleToggleMasterRecipeVisibility(user, e.target.checked)}
                                />
                                マスター表示
                            </label>
                        )}

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenLoginLogs(user)}
                            className="user-management__action-btn"
                        >
                            アクティブ履歴
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setResetTarget({ id: user.id, display_id: user.display_id, email: user.email });
                                setResetPw1('');
                                setResetPw2('');
                                setResetError('');
                                setResetSuccess('');
                            }}
                            className="user-management__action-btn"
                        >
                            パスワード再設定
                        </Button>

                        {!isSuperAdmin(user) && currentUser?.id !== user.id && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setDeleteTarget(user)}
                                className="user-management__action-btn"
                            >
                                削除
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        );
    };

    return (
        <div className={`user-management${isNarrow ? ' user-management--narrow' : ''}`}>
            <div ref={innerRef} className="user-management__inner">
                <div className="user-management__header">
                    <h2>ユーザー管理</h2>
                    <Button variant="ghost" onClick={onBack}>戻る</Button>
                </div>

                <div className="user-management__maintenance-toggle">
                    <span className="user-management__maintenance-label">
                        🔧 メンテナンスモード
                    </span>
                    <button
                        className={`maintenance-toggle-btn${maintenanceMode ? ' maintenance-toggle-btn--on' : ''}`}
                        onClick={toggleMaintenance}
                        disabled={isTogglingMaintenance || maintenanceMode === null}
                        title={maintenanceMode ? 'クリックして解除' : 'クリックして有効化'}
                    >
                        {isTogglingMaintenance ? '...' : maintenanceMode ? 'ON（工事中）' : 'OFF'}
                    </button>
                </div>

                <div className="user-management__daily-note">
                    日次表示（JST {dailyActivityWindow.label}）: 毎日 0:00 に今日の状態をリセット / ログイン中は最終更新5分以内で判定
                </div>

                {!isPresenceFeatureAvailable && (
                    <div className="user-management__daily-note">
                        ログイン中表示はDBマイグレーション未適用のため無効化中です。
                    </div>
                )}

                {presenceError && (
                    <div className="user-management__daily-error">{presenceError}</div>
                )}

                {dailyActivityError && (
                    <div className="user-management__daily-error">{dailyActivityError}</div>
                )}

                {error && (
                    <div style={{ padding: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '20px' }}>{error}</div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>読み込み中...</div>
                ) : (
                    <div className="user-management__content">
                        {admins.length > 0 && (
                            <div>
                                <h3 className="user-management__section-title user-management__section-title--admin">管理者</h3>
                                <div className="user-management__list">
                                    {admins.map(u => (
                                        <UserCard
                                            key={u.id}
                                            user={u}
                                            isAdmin={true}
                                            isSuperAdmin={isSuperAdmin}
                                            currentUser={currentUser}
                                            handleRoleChange={handleRoleChange}
                                            handleOpenStoreEditor={openStoreEditor}
                                            savingMasterTargets={savingMasterTargets}
                                            handleToggleMasterRecipeVisibility={handleToggleMasterRecipeVisibility}
                                            handleOpenLoginLogs={handleOpenLoginLogs}
                                            setResetTarget={setResetTarget}
                                            setResetPw1={setResetPw1}
                                            setResetPw2={setResetPw2}
                                            setResetError={setResetError}
                                            setResetSuccess={setResetSuccess}
                                            setDeleteTarget={setDeleteTarget}
                                            dailyActivityMap={dailyActivityMap}
                                            dailyActivityWindow={dailyActivityWindow}
                                            isLoadingDailyActivity={isLoadingDailyActivity}
                                            presenceMap={presenceMap}
                                            isLoadingPresence={isLoadingPresence}
                                            isPresenceFeatureAvailable={isPresenceFeatureAvailable}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <h3 className="user-management__section-title user-management__section-title--default">登録ユーザー</h3>
                            <div className="user-management__list">
                                {regulars.length > 0 ? (
                                    regulars.map(u => (
                                        <UserCard
                                            key={u.id}
                                            user={u}
                                            isAdmin={false}
                                            isSuperAdmin={isSuperAdmin}
                                            currentUser={currentUser}
                                            handleRoleChange={handleRoleChange}
                                            handleOpenStoreEditor={openStoreEditor}
                                            savingMasterTargets={savingMasterTargets}
                                            handleToggleMasterRecipeVisibility={handleToggleMasterRecipeVisibility}
                                            handleOpenLoginLogs={handleOpenLoginLogs}
                                            setResetTarget={setResetTarget}
                                            setResetPw1={setResetPw1}
                                            setResetPw2={setResetPw2}
                                            setResetError={setResetError}
                                            setResetSuccess={setResetSuccess}
                                            setDeleteTarget={setDeleteTarget}
                                            dailyActivityMap={dailyActivityMap}
                                            dailyActivityWindow={dailyActivityWindow}
                                            isLoadingDailyActivity={isLoadingDailyActivity}
                                            presenceMap={presenceMap}
                                            isLoadingPresence={isLoadingPresence}
                                            isPresenceFeatureAvailable={isPresenceFeatureAvailable}
                                        />
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '20px', color: '#666', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                        一般ユーザーはいません
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <Modal
                    isOpen={!!storeEditTarget}
                    onClose={() => {
                        if (isSavingStore) return;
                        setStoreEditTarget(null);
                        setStoreEditError('');
                    }}
                    title="店舗配属の設定"
                    size="small"
                >
                    <div style={{ color: '#333', lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                            対象: {formatDisplayId(storeEditTarget?.display_id || storeEditTarget?.email || storeEditTarget?.id)}
                        </div>
                        {storeEditTarget?.email && (
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '12px', wordBreak: 'break-all' }}>
                                {storeEditTarget.email}
                            </div>
                        )}

                        <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '12px' }}>
                            店舗一覧から選択するか、直接入力してください。空欄で保存すると未設定に戻ります。
                        </div>

                        {storeEditError && (
                            <div className="user-management__store-error">
                                {storeEditError}
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '6px' }}>
                                店舗名
                            </label>
                            <input
                                type="text"
                                value={storeDraft}
                                onChange={(e) => setStoreDraft(e.target.value)}
                                placeholder="店舗名を入力または選択"
                                list="user-management-store-options"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd' }}
                            />
                            <datalist id="user-management-store-options">
                                {STORE_LIST.map((store) => (
                                    <option key={store} value={store} />
                                ))}
                            </datalist>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setStoreEditTarget(null);
                                    setStoreEditError('');
                                }}
                                disabled={isSavingStore}
                            >
                                キャンセル
                            </Button>
                            <Button
                                variant="primary"
                                isLoading={isSavingStore}
                                onClick={handleSaveStoreAssignment}
                            >
                                保存する
                            </Button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={!!resetTarget}
                    onClose={() => {
                        if (isResetting) return;
                        setResetTarget(null);
                    }}
                    title="管理者: パスワード再設定"
                    size="small"
                >
                    <div style={{ color: '#333', lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                            対象: {formatDisplayId(resetTarget?.display_id || resetTarget?.email || resetTarget?.id)}
                        </div>
                        {resetTarget?.email && (
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '12px', wordBreak: 'break-all' }}>
                                {resetTarget.email}
                            </div>
                        )}

                        <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '12px' }}>
                            新しいパスワードを設定します（8文字以上）。パスワードそのものは保存・表示されません。
                        </div>

                        {resetError && (
                            <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                                {resetError}
                            </div>
                        )}
                        {resetSuccess && (
                            <div style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                                {resetSuccess}
                            </div>
                        )}

                        <div style={{ display: 'grid', gap: '10px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '6px' }}>新しいパスワード</label>
                                <input
                                    type="password"
                                    value={resetPw1}
                                    onChange={(e) => setResetPw1(e.target.value)}
                                    autoComplete="new-password"
                                    placeholder="8文字以上"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '6px' }}>確認</label>
                                <input
                                    type="password"
                                    value={resetPw2}
                                    onChange={(e) => setResetPw2(e.target.value)}
                                    autoComplete="new-password"
                                    placeholder="もう一度入力"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <Button
                                variant="ghost"
                                onClick={() => setResetTarget(null)}
                                disabled={isResetting}
                            >
                                キャンセル
                            </Button>
                            <Button
                                variant="secondary"
                                isLoading={isSendingResetEmail}
                                disabled={!resetTarget?.email || isResetting}
                                onClick={async () => {
                                    setResetError('');
                                    setResetSuccess('');
                                    if (!resetTarget?.email) {
                                        setResetError('メールアドレスが登録されていません');
                                        return;
                                    }
                                    setIsSendingResetEmail(true);
                                    try {
                                        await userService.sendPasswordResetEmail(resetTarget.email);
                                        setResetSuccess('パスワード再設定メールを送信しました');
                                    } catch (e) {
                                        console.error(e);
                                        setResetError(e?.message || '送信に失敗しました');
                                    } finally {
                                        setIsSendingResetEmail(false);
                                    }
                                }}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                再設定メール送信
                            </Button>
                            <Button
                                variant="danger"
                                isLoading={isResetting}
                                onClick={async () => {
                                    setResetError('');
                                    setResetSuccess('');
                                    if (!resetTarget?.id) return;
                                    if (!resetPw1 || resetPw1.length < 8) {
                                        setResetError('パスワードは8文字以上にしてください');
                                        return;
                                    }
                                    if (resetPw1 !== resetPw2) {
                                        setResetError('パスワードが一致しません');
                                        return;
                                    }
                                    setIsResetting(true);
                                    try {
                                        await userService.adminResetPassword(resetTarget.id, resetPw1);
                                        setResetSuccess('パスワードを更新しました');
                                        setResetPw1('');
                                        setResetPw2('');
                                    } catch (e) {
                                        console.error(e);
                                        const msg = e?.message || '更新に失敗しました';
                                        // If Edge Function isn't deployed, guide to email-based reset path.
                                        if (
                                            /FunctionsHttpError|not found|404/i.test(msg) ||
                                            /admin-reset-password/i.test(msg)
                                        ) {
                                            setResetError('直接更新（管理者設定）は未デプロイのため失敗しました。代わりに「再設定メール送信」を使ってください。');
                                        } else {
                                            setResetError(msg);
                                        }
                                    } finally {
                                        setIsResetting(false);
                                    }
                                }}
                            >
                                更新する
                            </Button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={!!logTarget}
                    onClose={() => {
                        setLogTarget(null);
                        setHistoryTab('login');
                        setDailyApiLogsError('');
                    }}
                    title="利用履歴"
                    size="medium"
                >
                    <div style={{ color: 'var(--text-color)', lineHeight: 1.5, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #ddd' }}>
                            対象: {formatDisplayId(logTarget?.display_id || logTarget?.email || logTarget?.id)}
                        </div>

                        <div className="user-management__history-tabs">
                            <button
                                type="button"
                                className={`user-management__history-tab ${historyTab === 'login' ? 'is-active' : ''}`}
                                onClick={() => setHistoryTab('login')}
                            >
                                アクティブ履歴
                            </button>
                            <button
                                type="button"
                                className={`user-management__history-tab ${historyTab === 'api' ? 'is-active' : ''}`}
                                onClick={() => setHistoryTab('api')}
                            >
                                API利用履歴
                            </button>
                        </div>

                        {historyTab === 'login' ? (
                            isLoadingLogs ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>読み込み中...</div>
                            ) : loginLogs.length > 0 ? (
                                <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>日時</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loginLogs.map((log, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                                    <td style={{ padding: '8px' }}>
                                                        {new Date(log.login_at).toLocaleString('ja-JP', {
                                                            year: 'numeric', month: '2-digit', day: '2-digit',
                                                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                                                        })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#666', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                    アクティブ履歴はありません<br />
                                    <span style={{ fontSize: '0.85rem' }}>
                                        ※認証ログインと画面アクセス（セッション継続）の両方を記録します
                                    </span>
                                </div>
                            )
                        ) : (
                            <>
                                {dailyApiLogsError ? (
                                    <div style={{ textAlign: 'center', padding: '30px 0', color: '#b91c1c', backgroundColor: '#fff1f2', borderRadius: '8px' }}>
                                        {dailyApiLogsError}
                                    </div>
                                ) : isLoadingDailyApiLogs ? (
                                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>読み込み中...</div>
                                ) : dailyApiLogs.length > 0 ? (
                                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>日時</th>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>API</th>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>エンドポイント</th>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>ステータス</th>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>詳細</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dailyApiLogs.map((log, i) => (
                                                    <tr key={`${log.created_at || i}_${log.endpoint || ''}`} style={{ borderBottom: '1px solid #eee' }}>
                                                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                                            {formatDateTime(log.created_at)}
                                                        </td>
                                                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                                            {log.api_name || '-'}
                                                        </td>
                                                        <td style={{ padding: '8px' }}>
                                                            {log.endpoint || '-'}
                                                        </td>
                                                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                                            {formatApiStatus(log.status)}
                                                        </td>
                                                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                                            {formatApiLogDetail(log)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#666', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                        API利用履歴はありません
                                    </div>
                                )}
                            </>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <Button variant="secondary" onClick={() => {
                                setLogTarget(null);
                                setHistoryTab('login');
                                setDailyApiLogsError('');
                            }}>
                                閉じる
                            </Button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={!!deleteTarget}
                    onClose={() => { if (!isDeleting) setDeleteTarget(null); }}
                    title="ユーザーの削除確認"
                    size="small"
                >
                    <div style={{ color: '#333', lineHeight: 1.5 }}>
                        <div style={{ marginBottom: '16px' }}>
                            以下のユーザーを完全に削除します。この操作は取り消せません。よろしいですか？
                        </div>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                            対象: {formatDisplayId(deleteTarget?.display_id || deleteTarget?.email || deleteTarget?.id)}
                        </div>
                        {deleteTarget?.email && (
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px', wordBreak: 'break-all' }}>
                                {deleteTarget.email}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <Button
                                variant="ghost"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                            >
                                キャンセル
                            </Button>
                            <Button
                                variant="danger"
                                isLoading={isDeleting}
                                onClick={handleDeleteUser}
                            >
                                削除する
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </div>
    );
};
