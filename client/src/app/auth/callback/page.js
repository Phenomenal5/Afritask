"use client";

// OAuth landing page: the backend finishes Google sign-in server-side, then
// redirects the browser here with a short-lived ?token=... in the URL. We hand
// it to the auth context, which stores it and pulls the profile — the same end
// state as a credential login. On any error we bounce back to /login.
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";

// The token-reading half must live under a Suspense boundary because
// useSearchParams() opts the route into client rendering (Next requirement).
function GoogleCallbackHandler() {
  const params = useSearchParams();
  const router = useRouter();
  const { completeOAuthLogin } = useAuth();
  // StrictMode double-invokes effects in dev; guard so we only consume the
  // one-time token once (a second /auth/me with a rotated token could fail).
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = params.get("token");
    const error = params.get("error");

    if (error || !token) {
      router.replace("/login?error=google");
      return;
    }

    completeOAuthLogin(token);
  }, [params, router, completeOAuthLogin]);

  return (
    <div className="flex items-center gap-3">
      <span
        className="w-4 h-4 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--line)", borderTopColor: "var(--moss)" }}
      />
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        Hang tight, this only takes a moment.
      </p>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <AuthLayout
      eyebrow="Signing you in"
      title="Finishing Google sign-in..."
    >
      <Suspense fallback={null}>
        <GoogleCallbackHandler />
      </Suspense>
    </AuthLayout>
  );
}
