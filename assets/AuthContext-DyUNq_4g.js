const e=`import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { AuthContext } from './authContext';
import { getAuthRedirectUrl, warnIfUsingLocalAuthRedirect } from '../utils/authRedirect';

const PRESENCE_HEARTBEAT_MS = 60_000;

const withTimeout = async (promise, ms, label) => {
    let t = null;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            t = setTimeout(() => reject(new Error(\`\${label || 'operation'} timed out after \${ms}ms\`)), ms);
        });
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (t) clearTimeout(t);
    }
};

const getEmailLocalPart = (email) => {
    if (!email) return '';
    const at = email.indexOf('@');
    return at > 0 ? email.slice(0, at) : email;
};

const PROFILE_SELECT_FIELD_SETS = [
    'id, display_id, role, show_master_recipes, email, store_name',
    'id, display_id, role, show_master_recipes, email',
    'id, display_id, role, show_master_recipes, store_name',
    'id, display_id, role, show_master_recipes',
];

const normalizeStoreName = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const hasMissingProfileColumnError = (error, columnName) => (
    String(error?.message || '').toLowerCase().includes(String(columnName || '').toLowerCase())
);

const shouldRetryProfileColumnFallback = (error) => (
    hasMissingProfileColumnError(error, 'email')
    || hasMissingProfileColumnError(error, 'store_name')
);

const omitKeys = (source, keys) => Object.fromEntries(
    Object.entries(source || {}).filter(([key]) => !keys.includes(key))
);

const buildProfilePayloadVariants = (payload) => {
    const variants = [payload];
    if (Object.prototype.hasOwnProperty.call(payload, 'store_name')) {
        variants.push(omitKeys(payload, ['store_name']));
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
        variants.push(omitKeys(payload, ['email']));
    }
    if (
        Object.prototype.hasOwnProperty.call(payload, 'email')
        && Object.prototype.hasOwnProperty.call(payload, 'store_name')
    ) {
        variants.push(omitKeys(payload, ['email', 'store_name']));
    }

    const seen = new Set();
    return variants.filter((variant) => {
        const key = JSON.stringify(Object.keys(variant).sort().map((field) => [field, variant[field]]));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const selectOwnProfileWithFallback = async (userId, timeoutMs = 4000) => {
    let lastError = null;

    for (const fields of PROFILE_SELECT_FIELD_SETS) {
        const result = await withTimeout(
            supabase.from('profiles').select(fields).eq('id', userId).single(),
            timeoutMs,
            \`profiles.select(\${fields})\`
        );

        if (!result?.error) {
            return result?.data || null;
        }

        lastError = result.error;
        if (lastError.code === 'PGRST116') {
            throw lastError;
        }
        if (!shouldRetryProfileColumnFallback(lastError)) {
            throw lastError;
        }
    }

    throw lastError || new Error('Profile fetch failed');
};

const insertOwnProfileWithFallback = async (payload, timeoutMs = 6000) => {
    const variants = buildProfilePayloadVariants(payload);
    let lastError = null;

    for (const variant of variants) {
        const result = await withTimeout(
            supabase.from('profiles').insert([variant]),
            timeoutMs,
            'profiles.insert'
        );

        if (!result?.error || result.error?.code === '23505') {
            return selectOwnProfileWithFallback(payload.id, timeoutMs);
        }

        lastError = result.error;
        if (!shouldRetryProfileColumnFallback(lastError)) {
            throw lastError;
        }
    }

    throw lastError || new Error('Profile create failed');
};

const backfillOwnProfileWithFallback = async (userId, patch) => {
    const normalizedPatch = Object.fromEntries(
        Object.entries(patch || {}).filter(([, value]) => value !== undefined)
    );
    if (Object.keys(normalizedPatch).length === 0) return;

    const variants = buildProfilePayloadVariants(normalizedPatch);
    let lastError = null;

    for (const variant of variants) {
        const result = await supabase
            .from('profiles')
            .update(variant)
            .eq('id', userId);

        if (!result?.error) {
            return;
        }

        lastError = result.error;
        if (!shouldRetryProfileColumnFallback(lastError)) {
            throw lastError;
        }
    }

    if (lastError) {
        throw lastError;
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null); // { id, email, displayId, storeName, role, showMasterRecipes }
    const [loading, setLoading] = useState(true);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

    const upsertPresence = useCallback(async ({ userId, isOnline }) => {
        const uid = String(userId || '').trim();
        if (!uid) return;
        try {
            const { error } = await supabase
                .from('user_presence')
                .upsert({
                    user_id: uid,
                    is_online: isOnline === true,
                    last_seen_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id',
                });
            if (error) {
                console.warn('Failed to upsert user presence:', error);
            }
        } catch (error) {
            console.warn('Unexpected error during user presence upsert:', error);
        }
    }, []);

    const loadProfileAndSetUser = useCallback(async (sessionUser) => {
        if (!sessionUser) {
            setUser(null);
            try { localStorage.removeItem('auth_user_cache'); } catch { /* ignore */ }
            return;
        }

        const uid = sessionUser.id;
        const email = sessionUser.email || '';
        let cachedUser = null;

        // 1. Optimistic Cache Load
        try {
            const cached = localStorage.getItem('auth_user_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                // Verify it belongs to current user
                if (parsed && parsed.id === uid) {
                    cachedUser = { ...parsed, profileVerified: false };
                    setUser(cachedUser);
                }
            }
        } catch (e) {
            console.warn('[Auth] Failed to load cache', e);
        }

        // Load profile (app metadata). If we have cache, show UI immediately and fetch profile in background.
        let profile = null;
        const profileSelectTimeoutMs = 4000;
        const maxRetries = 2;
        const metaStoreName = normalizeStoreName(sessionUser?.user_metadata?.store_name);

        const tryLoadProfile = async () => {
            let retryCount = 0;
            while (retryCount < maxRetries) {
                try {
                    try {
                        profile = await selectOwnProfileWithFallback(uid, profileSelectTimeoutMs);
                    } catch (error) {
                        if (error.code === 'PGRST116') {
                            const fallbackDisplayId = (sessionUser.user_metadata?.display_id)
                                ? String(sessionUser.user_metadata.display_id)
                                : getEmailLocalPart(email) || uid.slice(0, 8);
                            profile = await insertOwnProfileWithFallback({
                                id: uid,
                                display_id: fallbackDisplayId,
                                email: email || null,
                                store_name: metaStoreName,
                                role: 'user',
                                show_master_recipes: false,
                            });
                        } else {
                            throw error;
                        }
                    }

                    const backfillPatch = {};
                    if (profile && Object.prototype.hasOwnProperty.call(profile, 'email') && email && !profile.email) {
                        backfillPatch.email = email;
                    }
                    if (metaStoreName && !normalizeStoreName(profile?.store_name)) {
                        backfillPatch.store_name = metaStoreName;
                    }

                    if (Object.keys(backfillPatch).length > 0) {
                        try {
                            await backfillOwnProfileWithFallback(uid, backfillPatch);
                        } catch (e2) {
                            console.warn('Failed to backfill profile fields', e2);
                        }
                    }
                    break;
                } catch (e) {
                    console.error(\`Failed to load/create profile (Attempt \${retryCount + 1}/\${maxRetries}):\`, e);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        await new Promise(r => setTimeout(r, 300 * retryCount));
                    }
                }
            }
            return profile;
        };

        if (cachedUser) {
            tryLoadProfile().then((p) => {
                if (p) {
                    const metaDisplayId = (sessionUser?.user_metadata?.display_id || '').toString().trim();
                    const displayId = p.display_id || metaDisplayId || cachedUser.displayId || getEmailLocalPart(email) || uid.slice(0, 8);
                    const storeName = normalizeStoreName(p.store_name) || metaStoreName || normalizeStoreName(cachedUser.storeName) || '';
                    const role = String((p.role || 'user')).trim().toLowerCase();
                    const showMasterRecipes = p.show_master_recipes === true;
                    const verifiedUser = { id: uid, email, displayId, storeName, role, showMasterRecipes, profileVerified: true };
                    setUser(verifiedUser);
                    try {
                        localStorage.setItem('auth_user_cache', JSON.stringify(verifiedUser));
                    } catch (e) {
                        console.warn('[Auth] Failed to save cache', e);
                    }
                } else {
                    setUser(prev => (prev?.id === uid ? { ...prev, profileVerified: true } : prev));
                }
            }).catch(() => {
                setUser(prev => (prev?.id === uid ? { ...prev, profileVerified: true } : prev));
            });
            return;
        }

        profile = await tryLoadProfile();

        const metaDisplayId = (sessionUser?.user_metadata?.display_id || '').toString().trim();
        const resolvedStoreName = normalizeStoreName(profile?.store_name)
            || metaStoreName
            || normalizeStoreName(cachedUser?.storeName)
            || '';
        const displayId =
            profile?.display_id ||
            (metaDisplayId || '') ||
            (cachedUser?.displayId || '') ||
            getEmailLocalPart(email) ||
            uid.slice(0, 8);

        const rawRole =
            profile?.role ||
            sessionUser?.app_metadata?.role ||
            cachedUser?.role ||
            'user';
        const role = String(rawRole).trim().toLowerCase();

        const showMasterRecipes = (profile?.show_master_recipes === true)
            || (profile?.show_master_recipes == null && cachedUser?.showMasterRecipes === true);

        const newUser = {
            id: uid,
            email,
            displayId,
            storeName: resolvedStoreName,
            role,
            showMasterRecipes,
            profileVerified: true,
        };

        setUser(newUser);
        try {
            localStorage.setItem('auth_user_cache', JSON.stringify(newUser));
        } catch (e) {
            console.warn('[Auth] Failed to save cache', e);
        }
    }, []);

    useEffect(() => {
        let unsub = null;
        let loadingCleared = false;

        const clearLoading = () => {
            if (!loadingCleared) {
                loadingCleared = true;
                setLoading(false);
            }
        };

        // Check URL hash manually for recovery flow to set state immediately
        if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('type=recovery')) {
            setIsPasswordRecovery(true);
        }

        // Supabase v2 fires INITIAL_SESSION on mount with the current session state,
        // so a separate getSession() call is redundant and causes a double profile fetch.
        const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (_event === 'PASSWORD_RECOVERY') {
                setIsPasswordRecovery(true);
            }
            try {
                await loadProfileAndSetUser(session?.user || null);
            } catch (e) {
                console.error('Auth state change handler failed:', e);
            } finally {
                // INITIAL_SESSION is emitted on mount; use it to clear the loading state
                // so the app renders only after the first profile fetch is complete.
                if (_event === 'INITIAL_SESSION') {
                    clearLoading();
                }
            }
        });
        unsub = sub?.subscription;

        // Safety fallback: clear loading if INITIAL_SESSION never fires.
        const fallbackTimer = setTimeout(clearLoading, 10000);

        return () => {
            clearTimeout(fallbackTimer);
            try {
                unsub?.unsubscribe?.();
            } catch {
                // ignore
            }
        };
    }, [loadProfileAndSetUser]);

    useEffect(() => {
        const uid = String(user?.id || '').trim();
        if (!uid) return undefined;

        let intervalId = null;
        const beat = () => {
            upsertPresence({ userId: uid, isOnline: true });
        };

        beat();
        intervalId = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);

        const handleFocus = () => beat();
        const handleVisible = () => {
            if (document.visibilityState === 'visible') beat();
        };
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisible);

        return () => {
            if (intervalId !== null) {
                window.clearInterval(intervalId);
            }
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisible);
        };
    }, [user?.id, upsertPresence]);

    const login = useCallback(async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            console.error('Login error:', error);
            throw new Error('メールアドレスまたはパスワードが違います');
        }
    }, []);

    const register = useCallback(async (email, password, displayId, storeName) => {
        const normalizedStoreName = normalizeStoreName(storeName);
        warnIfUsingLocalAuthRedirect('signup email');
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_id: displayId,
                    store_name: normalizedStoreName,
                },
                emailRedirectTo: getAuthRedirectUrl()
            }
        });

        if (error) {
            console.error('SignUp error:', error);
            throw new Error(error.message || '登録に失敗しました');
        }

        // If session exists immediately, create profile now. If email confirmation is required, session may be null.
        const sessionUser = data?.user;
        if (sessionUser?.id) {
            try {
                await insertOwnProfileWithFallback({
                    id: sessionUser.id,
                    display_id: displayId,
                    email: email || null,
                    store_name: normalizedStoreName,
                    role: 'user',
                    show_master_recipes: false
                });
            } catch (profileError) {
                if (profileError?.code !== '23505') {
                    console.error('Profile create error:', profileError);
                }
            }
        }

        // If email confirmation is enabled, user must confirm via email before they can sign in.
        return { needsEmailConfirmation: !data?.session };
    }, []);

    const logout = useCallback(async () => {
        const activeUserId = String(user?.id || '').trim();
        if (activeUserId) {
            await upsertPresence({ userId: activeUserId, isOnline: false });
        }

        // Immediate local UI/session cache cleanup for reliable mobile logout UX.
        setUser(null);
        setIsPasswordRecovery(false);
        try { localStorage.removeItem('auth_user_cache'); } catch { /* ignore */ }

        try {
            const { error } = await withTimeout(
                supabase.auth.signOut({ scope: 'local' }),
                3000,
                'auth.signOut(local)'
            );
            if (error) {
                console.warn('Logout (local scope) returned error:', error);
            }
        } catch (e) {
            console.warn('Logout (local scope) failed/timed out:', e);
        }
    }, [user?.id, upsertPresence]);

    const patchCurrentUserProfile = useCallback((patch) => {
        if (!patch || typeof patch !== 'object') return;
        setUser(prev => {
            if (!prev) return prev;
            return { ...prev, ...patch };
        });
    }, []);

    const sendPasswordResetEmail = useCallback(async (email) => {
        warnIfUsingLocalAuthRedirect('password-reset email');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getAuthRedirectUrl()
        });
        if (error) {
            console.error('Password reset email error:', error);
            throw new Error('パスワード再設定メールの送信に失敗しました');
        }
        return true;
    }, []);

    const updatePassword = useCallback(async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            console.error('Update password error:', error);
            throw new Error('パスワード更新に失敗しました');
        }
        return true;
    }, []);

    const finishPasswordRecovery = useCallback(() => {
        setIsPasswordRecovery(false);
        // Keep session; user can continue using the app
        // Also clean hash if Supabase included tokens in URL
        try {
            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        } catch {
            // ignore
        }
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        login,
        register,
        logout,
        patchCurrentUserProfile,
        sendPasswordResetEmail,
        isPasswordRecovery,
        updatePassword,
        finishPasswordRecovery
    }), [user, loading, login, register, logout, patchCurrentUserProfile, sendPasswordResetEmail, isPasswordRecovery, updatePassword, finishPasswordRecovery]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
`;export{e as default};
