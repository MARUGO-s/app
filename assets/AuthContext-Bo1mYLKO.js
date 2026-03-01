const e=`import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { AuthContext } from './authContext';

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

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null); // { id, email, displayId, role, showMasterRecipes }
    const [loading, setLoading] = useState(true);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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
                    // console.log('[Auth] Loaded from cache:', parsed.displayId);
                    cachedUser = parsed;
                    setUser(parsed);
                }
            }
        } catch (e) {
            console.warn('[Auth] Failed to load cache', e);
        }

        // Load profile (app metadata). If we have cache, show UI immediately and fetch profile in background.
        let profile = null;
        const profileSelectTimeoutMs = 4000;
        const maxRetries = 2;

        const tryLoadProfile = async () => {
            let retryCount = 0;
            while (retryCount < maxRetries) {
                try {
                    const [res1, res2] = await Promise.all([
                        withTimeout(
                            supabase.from('profiles').select('id, display_id, role, show_master_recipes, email').eq('id', uid).single().then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
                            profileSelectTimeoutMs,
                            'profiles.select(with_email)'
                        ).catch(error => ({ data: null, error })),
                        withTimeout(
                            supabase.from('profiles').select('id, display_id, role, show_master_recipes').eq('id', uid).single().then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
                            profileSelectTimeoutMs,
                            'profiles.select'
                        ).catch(error => ({ data: null, error }))
                    ]);

                    let data = null;
                    let error = null;
                    if (res1?.data?.data) {
                        data = res1.data.data;
                    } else if (res2?.data?.data) {
                        data = res2.data.data;
                    } else {
                        error = res1?.error ?? res2?.error ?? new Error('Profile fetch failed');
                    }

                    if (error) {
                        if (error.code === 'PGRST116') {
                            const fallbackDisplayId = (sessionUser.user_metadata?.display_id)
                                ? String(sessionUser.user_metadata.display_id)
                                : getEmailLocalPart(email) || uid.slice(0, 8);
                            let created = null;
                            let createError = null;
                            const ins1 = await withTimeout(
                                supabase.from('profiles').insert([{ id: uid, display_id: fallbackDisplayId, email: email || null, role: 'user', show_master_recipes: false }]).select('id, display_id, role, show_master_recipes, email').single(),
                                6000, 'profiles.insert(with_email)'
                            );
                            created = ins1?.data ?? null;
                            createError = ins1?.error ?? null;
                            if (createError && String(createError.message || '').toLowerCase().includes('email')) {
                                const ins2 = await withTimeout(
                                    supabase.from('profiles').insert([{ id: uid, display_id: fallbackDisplayId, role: 'user', show_master_recipes: false }]).select('id, display_id, role, show_master_recipes').single(),
                                    6000, 'profiles.insert'
                                );
                                created = ins2?.data ?? null;
                                createError = ins2?.error ?? null;
                            }
                            if (createError) throw createError;
                            profile = created;
                        } else {
                            throw error;
                        }
                    } else {
                        profile = data;
                    }

                    if (profile && Object.prototype.hasOwnProperty.call(profile, 'email') && email && !profile.email) {
                        try {
                            await supabase.from('profiles').update({ email }).eq('id', uid);
                        } catch (e2) {
                            console.warn('Failed to backfill profile email', e2);
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
                    const role = String((p.role || 'user')).trim().toLowerCase();
                    const isSuperAdmin = email === 'pingus0428@gmail.com';
                    const showMasterRecipes = isSuperAdmin ? true : (p.show_master_recipes === true);
                    setUser({ id: uid, email, displayId, role, showMasterRecipes });
                    try {
                        localStorage.setItem('auth_user_cache', JSON.stringify({ id: uid, email, displayId, role, showMasterRecipes }));
                    } catch (e) {
                        console.warn('[Auth] Failed to save cache', e);
                    }
                }
            }).catch(() => { });
            return;
        }

        profile = await tryLoadProfile();

        const metaDisplayId = (sessionUser?.user_metadata?.display_id || '').toString().trim();
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

        const isSuperAdmin = email === 'pingus0428@gmail.com';
        const showMasterRecipes = isSuperAdmin ? true : ((profile?.show_master_recipes === true)
            || (profile?.show_master_recipes == null && cachedUser?.showMasterRecipes === true));

        const newUser = {
            id: uid,
            email,
            displayId,
            role,
            showMasterRecipes,
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

        // 1. Check URL hash manually for recovery flow to set state immediately
        // Supabase sends type=recovery in the hash
        if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('type=recovery')) {
            setIsPasswordRecovery(true);
        }

        // 2. Subscribe to auth changes FIRST to catch explicit events
        const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (_event === 'PASSWORD_RECOVERY') {
                setIsPasswordRecovery(true);
            }
            try {
                await loadProfileAndSetUser(session?.user || null);
            } catch (e) {
                console.error('Auth state change handler failed:', e);
            }
        });
        unsub = sub?.subscription;

        // 3. Initial Session Load
        const init = async () => {
            try {
                const { data } = await withTimeout(
                    supabase.auth.getSession(),
                    5000,
                    'auth.getSession'
                );
                // Only set user if we didn't already get it from onAuthStateChange (though safe to call twice)
                await loadProfileAndSetUser(data?.session?.user || null);
            } catch (e) {
                console.error('Auth init failed:', e);
            } finally {
                setLoading(false);
            }
        };

        init();

        return () => {
            try {
                unsub?.unsubscribe?.();
            } catch {
                // ignore
            }
        };
    }, [loadProfileAndSetUser]);

    const login = useCallback(async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            console.error('Login error:', error);
            throw new Error('メールアドレスまたはパスワードが違います');
        }
    }, []);

    const register = useCallback(async (email, password, displayId) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { display_id: displayId },
                emailRedirectTo: window.location.origin + import.meta.env.BASE_URL
            }
        });

        if (error) {
            console.error('SignUp error:', error);
            throw new Error(error.message || '登録に失敗しました');
        }

        // If session exists immediately, create profile now. If email confirmation is required, session may be null.
        const sessionUser = data?.user;
        if (sessionUser?.id) {
            // Try insert with email column; fallback if schema isn't updated yet.
            let profileError = null;
            const ins1 = await supabase
                .from('profiles')
                .insert([{
                    id: sessionUser.id,
                    display_id: displayId,
                    email: email || null,
                    role: 'user',
                    show_master_recipes: false
                }]);
            profileError = ins1?.error ?? null;

            if (profileError && String(profileError.message || '').toLowerCase().includes('email')) {
                const ins2 = await supabase
                    .from('profiles')
                    .insert([{
                        id: sessionUser.id,
                        display_id: displayId,
                        role: 'user',
                        show_master_recipes: false
                    }]);
                profileError = ins2?.error ?? null;
            }

            // If profile already exists (rare), ignore unique errors
            if (profileError && profileError.code !== '23505') {
                console.error('Profile create error:', profileError);
            }
        }

        // If email confirmation is enabled, user must confirm via email before they can sign in.
        return { needsEmailConfirmation: !data?.session };
    }, []);

    const logout = useCallback(async () => {
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
    }, []);

    const patchCurrentUserProfile = useCallback((patch) => {
        if (!patch || typeof patch !== 'object') return;
        setUser(prev => {
            if (!prev) return prev;
            return { ...prev, ...patch };
        });
    }, []);

    const sendPasswordResetEmail = useCallback(async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + import.meta.env.BASE_URL
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
