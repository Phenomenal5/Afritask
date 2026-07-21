/**
 * Auth state and session actions live here.
 * This context owns the current user, loading state, and sign-in/sign-out flows.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  forgotPassword as forgotPasswordRequest,
  getMe,
  login as loginRequest,
  resetPassword as resetPasswordRequest,
  signup as signupRequest,
  verifyEmail as verifyEmailRequest,
} from "@/lib/services/authService";

const AuthContext = createContext(null);

const TOKEN_KEY = "afritask_token";

// Provide the logged-in user, auth status, and session actions to the app.
export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoutVersion, setLogoutVersion] = useState(0);

  // Restore the current session once on mount by checking localStorage and /auth/me.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setAuthLoading(false);
      return;
    }

    getMe()
      .then((res) => {
        setUser(res.data.user);
        if (res.data.token) localStorage.setItem(TOKEN_KEY, res.data.token);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const signup = useCallback(async ({ name, email, password, age }) => {
    try {
      const res = await signupRequest({ name, email, password, age });
      toast.success(res.data.message || "Check your email to verify your account.");
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || "Signup failed";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const verifyEmail = useCallback(async (token) => {
    try {
      const res = await verifyEmailRequest(token);
      toast.success(res.data.message || "Email verified");
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.message || "Verification link is invalid or expired";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      try {
        const res = await loginRequest({ email, password });
        localStorage.setItem(TOKEN_KEY, res.data.token);
        setUser(res.data.user);
        toast.success(`Welcome back, ${res.data.user.name.split(" ")[0]}`);
        router.push("/dashboard");
        return { success: true };
      } catch (err) {
        const message = err.response?.data?.message || "Login failed";
        toast.error(message);
        return { success: false, message };
      }
    },
    [router]
  );

  // Finish a Google sign-in. The backend completed OAuth server-side and handed
  // us a JWT via the /auth/callback URL — store it, hydrate the user from
  // /auth/me, and land on the dashboard. Same end state as a credential login.
  const completeOAuthLogin = useCallback(
    async (token) => {
      try {
        localStorage.setItem(TOKEN_KEY, token);
        const res = await getMe();
        setUser(res.data.user);
        // /auth/me refreshes the token when applicable — keep the newest one.
        if (res.data.token) localStorage.setItem(TOKEN_KEY, res.data.token);
        toast.success(`Welcome, ${res.data.user.name.split(" ")[0]}`);
        router.push("/dashboard");
        return { success: true };
      } catch (err) {
        localStorage.removeItem(TOKEN_KEY);
        const message = err.response?.data?.message || "Google sign-in failed";
        toast.error(message);
        router.push("/login");
        return { success: false, message };
      }
    },
    [router]
  );

  const forgotPassword = useCallback(async (email) => {
    try {
      const res = await forgotPasswordRequest(email);
      toast.success(res.data.message || "Reset link sent");
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || "Could not send reset link";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const resetPassword = useCallback(async (payload) => {
    const { token, password } = payload;
    try {
      const res = await resetPasswordRequest({ token, password });
      toast.success(res.data.message || "Password reset");
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.message || "Reset link is invalid or expired";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setLogoutVersion((count) => count + 1);
    toast.success("Signed out");
    router.push("/login");
  }, [router]);

  const value = {
    user,
    setUser,
    isAuthenticated: !!user,
    authLoading,
    logoutVersion,
    signup,
    verifyEmail,
    login,
    completeOAuthLogin,
    logout,
    forgotPassword,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Read auth session state and actions from the top-level auth provider.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
