import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext(null);

const withTimeout = async (promise, ms, label) => {
    let t = null;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            t = setTimeout(() => reject(new Error(`${label || 'operation'} timed out after ${ms}ms`)), ms);
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
            return;
        }

        const uid = sessionUser.id;
        const email = sessionUser.email || '';

        // Load profile (app metadata)
        let profile = null;
        try {
            // Try selecting with email column (newer schema). If the column doesn't exist yet, retry without it.
            let data = null;
            let error = null;
            const res1 = await withTimeout(
                supabase
                    .from('profiles')
                    .select('id, display_id, role, show_master_recipes, email')
                    .eq('id', uid)
                    .single(),
                8000,
                'profiles.select(with_email)'
            );
            data = res1?.data ?? null;
            error = res1?.error ?? null;

            if (error && String(error.message || '').toLowerCase().includes('email')) {
                const res2 = await withTimeout(
                    supabase
                        .from('profiles')
                        .select('id, display_id, role, show_master_recipes')
                        .eq('id', uid)
                        .single(),
                    8000,
                    'profiles.select'
                );
                data = res2?.data ?? null;
                error = res2?.error ?? null;
            }

            if (error) {
                // If profile is missing (first login after signUp confirm), try to create a minimal one
                if (error.code === 'PGRST116') {
                    const fallbackDisplayId = (sessionUser.user_metadata && sessionUser.user_metadata.display_id)
                        ? String(sessionUser.user_metadata.display_id)
                        : getEmailLocalPart(email) || uid.slice(0, 8);

                    // Try insert with email, then fallback insert without email for older schema
                    let created = null;
                    let createError = null;
                    const ins1 = await withTimeout(
                        supabase
                            .from('profiles')
                            .insert([{
                                id: uid,
                                display_id: fallbackDisplayId,
                                email: email || null,
                                role: 'user',
                                show_master_recipes: false
                            }])
                            .select('id, display_id, role, show_master_recipes, email')
                            .single(),
                        8000,
                        'profiles.insert(with_email)'
                    );
                    created = ins1?.data ?? null;
                    createError = ins1?.error ?? null;

                    if (createError && String(createError.message || '').toLowerCase().includes('email')) {
                        const ins2 = await withTimeout(
                            supabase
                                .from('profiles')
                                .insert([{
                                    id: uid,
                                    display_id: fallbackDisplayId,
                                    role: 'user',
                                    show_master_recipes: false
                                }])
                                .select('id, display_id, role, show_master_recipes')
                                .single(),
                            8000,
                            'profiles.insert'
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

            // If schema supports email and it's missing, try to fill it from session
            if (profile && Object.prototype.hasOwnProperty.call(profile, 'email') && email && !profile.email) {
                try {
                    await supabase
                        .from('profiles')
                        .update({ email })
                        .eq('id', uid);
                } catch (e2) {
                    // ignore (not critical)
                    console.warn('Failed to backfill profile email', e2);
                }
            }
        } catch (e) {
            console.error('Failed to load/create profile:', e);
        }

        const displayId = profile?.display_id || getEmailLocalPart(email) || uid.slice(0, 8);
        const role = profile?.role || 'user';
        const showMasterRecipes = profile?.show_master_recipes === true;

        setUser({
            id: uid, // IMPORTANT: use Auth UID as canonical id
            email,
            displayId,
            role,
            showMasterRecipes,
        });
    }, []);

    useEffect(() => {
        let unsub = null;

        const init = async () => {
            try {
                const { data } = await withTimeout(
                    supabase.auth.getSession(),
                    8000,
                    'auth.getSession'
                );
                await loadProfileAndSetUser(data?.session?.user || null);
            } catch (e) {
                console.error('Auth init failed:', e);
            } finally {
                setLoading(false);
            }

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
                data: { display_id: displayId }
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
        await supabase.auth.signOut();
        setUser(null);
        setIsPasswordRecovery(false);
    }, []);

    const sendPasswordResetEmail = useCallback(async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
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
        sendPasswordResetEmail,
        isPasswordRecovery,
        updatePassword,
        finishPasswordRecovery
    }), [user, loading, login, register, logout, sendPasswordResetEmail, isPasswordRecovery, updatePassword, finishPasswordRecovery]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
