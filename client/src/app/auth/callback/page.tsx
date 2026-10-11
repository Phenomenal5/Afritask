"use client";

// OAuth landing page: the backend finishes Google sign-in server-side, then redirects the
// browser here with a single-use ?code=… (valid ~2 minutes). Exchanging it sets the
// session cookie — the same end state as a credential login. Any error goes back to /login.
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/auth/AuthLayout";
import Spinner from "@/components/ui/Spinner";

function GoogleCallbackHandler() {
  const params = useSearchParams();
  const router = useRouter();
  const { completeOAuthLogin } = useAuth();
  // StrictMode double-invokes effects in dev; the code is single-use, so spend it once.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    const code = params.get("code");
    if (params.get("error") || !code) {
      router.replace("/login?error=google");
      return;
    }
    completeOAuthLogin(code);
  }, [params, router, completeOAuthLogin]);

  return (
    <p role="status" className="flex items-center gap-3 text-[15px] text-muted">
      <Spinner />
      Finishing sign-in with Google. This only takes a moment.
    </p>
  );
}

export default function GoogleCallbackPage() {
  return (
    <AuthLayout eyebrow="Signing you in" title="Almost there">
      <title>Signing in · Afritask</title>
      <Suspense fallback={null}>
        <GoogleCallbackHandler />
      </Suspense>
    </AuthLayout>
  );
}
