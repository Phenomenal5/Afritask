/**
 * Auth state and session actions live here.
 * This context owns the current user, loading state, and sign-in/sign-out flows.
 *
 * Failures are RETURNED (not toasted) so each form can show the message next to the
 * fields it's about; successes that move you to another page are toasted.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  acceptTerms as acceptTermsRequest,
  exchangeGoogleCode,
  forgotPassword as forgotPasswordRequest,
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  resetPassword as resetPasswordRequest,
  signup as signupRequest,
  verifyEmail as verifyEmailRequest,
} from "@/lib/services/authService";
// Sent at signup so due dates show in local time.
import { detectTimezone } from "@/utils/timezones";
import { clearPendingInvite, postSignInPath, saveReturnPath } from "@/utils/pendingInvite";
import { clearAllDrafts } from "@/utils/draftStorage";
import { unsubscribeThisBrowser } from "@/utils/browserPush";
import { SESSION_EXPIRED_EVENT, TERMS_REQUIRED_EVENT } from "@/lib/api";
import { failureMessage } from "@/lib/errors";
import type { ActionResult, CurrentUser } from "@/types/models";

interface SignupInput {
  name: string;
  email: string;
  password: string;
  age?: number;
  acceptTerms: boolean;
  // Optional newsletter opt-in; starts once the email is verified.
  newsletter: boolean;
}

interface AuthState {
  user: CurrentUser | null;
  setUser: Dispatch<SetStateAction<CurrentUser | null>>;
  isAuthenticated: boolean;
  authLoading: boolean;
  // Signed in but hasn't accepted the current terms — the app shows TermsGate instead.
  termsRequired: boolean;
  acceptTerms: () => Promise<ActionResult>;
  logoutVersion: number;
  signup: (input: SignupInput) => Promise<ActionResult>;
  verifyEmail: (token: string) => Promise<ActionResult>;
  login: (credentials: { email: string; password: string }) => Promise<ActionResult>;
  completeOAuthLogin: (code: string) => Promise<ActionResult>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<ActionResult>;
  resetPassword: (input: { token: string; password: string }) => Promise<ActionResult>;
}

const AuthContext = createContext<AuthState | null>(null);

// NOTE: the access and refresh tokens live in httpOnly cookies that JavaScript can't read.
// So "am I signed in?" is answered only by asking the server (/auth/me — lib/api refreshes
// an expired access token first) — never by checking storage.
// Older builds kept a JWT under this key; clear any leftover copy on load.
const LEGACY_TOKEN_KEY = "afritask_token";

const firstNameOf = (name: string) => name.split(" ")[0];

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [termsRequired, setTermsRequired] = useState(false);
  const [logoutVersion, setLogoutVersion] = useState(0);

  // Restore the current session once on mount — the cookie (if any) rides along to /auth/me.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      // Storage blocked — nothing to clean up.
    }
    getMe()
      .then((res) => {
        setUser(res.data.user);
        setTermsRequired(!!res.data.termsRequired);
      })
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // The session ended mid-use (see lib/api.js). Drop the stale user, remember the page so
  // signing back in returns here, and say plainly what happened.
  // NOTE: only acts while someone is signed in — several requests failing together would
  // otherwise stack toasts and redirects. Side effects stay out of the setUser updater
  // because StrictMode runs updaters twice.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const handleSessionExpired = () => {
      if (!userRef.current) return;
      userRef.current = null;
      saveReturnPath(window.location.pathname + window.location.search);
      setUser(null);
      setLogoutVersion((count) => count + 1);
      toast.error("Your session ended. Sign in again and we'll bring you back.", { id: "session-expired" });
      router.push("/login?expired=1");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [router]);

  useEffect(() => {
    const handleTermsRequired = () => setTermsRequired(true);
    window.addEventListener(TERMS_REQUIRED_EVENT, handleTermsRequired);
    return () => window.removeEventListener(TERMS_REQUIRED_EVENT, handleTermsRequired);
  }, []);

  const signup = useCallback(async ({ name, email, password, age, acceptTerms, newsletter }: SignupInput): Promise<ActionResult> => {
    try {
      const res = await signupRequest({ name, email, password, age, acceptTerms, newsletter, timezone: detectTimezone() });
      return { success: true, message: res.data.message };
    } catch (error) {
      return { success: false, message: failureMessage(error, "We couldn't create your account. Check the details and try again.") };
    }
  }, []);

  const verifyEmail = useCallback(async (token: string): Promise<ActionResult> => {
    try {
      const res = await verifyEmailRequest(token);
      return { success: true, message: res.data.message };
    } catch (error) {
      return { success: false, message: failureMessage(error, "This verification link is invalid or has expired.") };
    }
  }, []);

  const login = useCallback(
    async ({ email, password }: { email: string; password: string }): Promise<ActionResult> => {
      try {
        const res = await loginRequest({ email, password });
        setUser(res.data.user);
        setTermsRequired(!!res.data.termsRequired);
        toast.success(`Welcome back, ${firstNameOf(res.data.user.name)}`);
        // Back to a pending invitation (or the page a session expired on) first.
        router.push(postSignInPath());
        return { success: true };
      } catch (error) {
        return { success: false, message: failureMessage(error, "We couldn't sign you in. Check your email and password.") };
      }
    },
    [router]
  );

  // Finish a Google sign-in. The backend completed OAuth server-side and redirected
  // to /auth/callback with a one-time code — exchanging it sets the session cookie.
  const completeOAuthLogin = useCallback(
    async (code: string): Promise<ActionResult> => {
      try {
        const res = await exchangeGoogleCode(code);
        setUser(res.data.user);
        setTermsRequired(!!res.data.termsRequired);
        toast.success(`Welcome, ${firstNameOf(res.data.user.name)}`);
        router.push(postSignInPath());
        return { success: true };
      } catch (error) {
        const message = failureMessage(error, "Google sign-in didn't finish. Please try again.");
        toast.error(message);
        router.push("/login");
        return { success: false, message };
      }
    },
    [router]
  );

  const acceptTerms = useCallback(async (): Promise<ActionResult> => {
    try {
      const res = await acceptTermsRequest();
      setUser(res.data.user);
      setTermsRequired(false);
      return { success: true };
    } catch (error) {
      return { success: false, message: failureMessage(error, "We couldn't save your acceptance. Try again.") };
    }
  }, []);

  const forgotPassword = useCallback(async (email: string): Promise<ActionResult> => {
    try {
      const res = await forgotPasswordRequest(email);
      return { success: true, message: res.data.message };
    } catch (error) {
      return { success: false, message: failureMessage(error, "We couldn't send the reset link. Try again in a moment.") };
    }
  }, []);

  const resetPassword = useCallback(async ({ token, password }: { token: string; password: string }): Promise<ActionResult> => {
    try {
      const res = await resetPasswordRequest({ token, password });
      return { success: true, message: res.data.message };
    } catch (error) {
      return { success: false, message: failureMessage(error, "This reset link is invalid or has expired.") };
    }
  }, []);

  const logout = useCallback(async () => {
    // NOTE: before signing out (it needs the session) — otherwise the next person to use
    // this browser would get the previous account's push notifications.
    await unsubscribeThisBrowser();
    try {
      await logoutRequest();
    } catch {
      // Already signed out server-side (expired session) — clearing local state is all that's left.
    }
    userRef.current = null;
    setUser(null);
    setTermsRequired(false);
    // An invitation link opened in this browser belongs to whoever opened it — don't
    // carry it into the next account that signs in here.
    clearPendingInvite();
    clearAllDrafts();
    setLogoutVersion((count) => count + 1);
    toast.success("Signed out");
    router.push("/login");
  }, [router]);

  const value: AuthState = {
    user,
    setUser,
    isAuthenticated: !!user,
    authLoading,
    termsRequired: !!user && termsRequired,
    acceptTerms,
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

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
