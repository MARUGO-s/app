import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabase';
import { userService } from '../services/userService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for saved user in localStorage
        const savedUser = localStorage.getItem('recipe_app_user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    const login = async (userId, password, rememberMe) => {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('id, password')
                .eq('id', userId)
                .single();

            if (error || !data) {
                // Determine if it's a "fetch" error or "not found"
                // .single() returns error if 0 rows
                throw new Error("ユーザーが見つかりません (ID違い)");
            }

            if (data.password !== password) {
                throw new Error("パスワードが間違っています");
            }

            if (data.password !== password) {
                throw new Error("パスワードが間違っています");
            }

            // Revert to safe object structure to prevent crash
            const userData = { id: userId };
            setUser(userData);

            // Fire and forget last login update
            userService.updateLastLogin(userId).catch(err => console.error(err));

            if (rememberMe) {
                localStorage.setItem('recipe_app_user', JSON.stringify(userData));
            } else {
                localStorage.removeItem('recipe_app_user');
            }
        } catch (e) {
            // Rethrow with user friendly message if possible
            if (e.message.includes('JSON')) throw e; // Syntax error etc
            console.error("Login Error:", e);
            throw new Error(e.message === "パスワードが間違っています" ? e.message : "ユーザーIDまたはパスワードが違います");
        }
    };

    const register = async (userId, password, secretQuestion, secretAnswer) => {
        const { error } = await supabase
            .from('app_users')
            .insert([{
                id: userId,
                password,
                secret_question: secretQuestion || null,
                secret_answer: secretAnswer || null
            }]);

        if (error) {
            console.error("Register Error:", error);
            if (error.code === '23505') { // Postgres unique_violation
                throw new Error("このIDは既に使用されています");
            }
            throw new Error("登録エラー: " + (error.message || "不明なエラー"));
        }
        return true;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('recipe_app_user');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, register, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
