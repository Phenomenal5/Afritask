"use client";

// Email verification: confirms the link's token, then points to the next step — back to
// a pending invitation if there is one, otherwise sign in and name a workspace.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { readPendingInvite } from "@/utils/pendingInvite";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import { ButtonLink } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";

type VerifyStatus = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const { verifyEmail } = useAuth();
  const [status, setStatus] = useState<VerifyStatus>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasPendingInvite, setHasPendingInvite] = useState(false);

  // NOTE: React StrictMode mounts effects twice in dev, so this fired two verification
  // requests for the same token. The first succeeded and the second one's response
  // overwrote the status — which is why a perfectly good link reported "invalid or
  // expired". One request per token only.
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    setHasPendingInvite(!!readPendingInvite());
    if (!token || requestedTokenRef.current === token) return;
    requestedTokenRef.current = token;
    verifyEmail(token).then((result) => {
      setStatus(result.success ? "success" : "error");
      if (!result.success) setErrorMessage(result.message ?? null);
    });
  }, [token, verifyEmail]);

  return (
    <AuthLayout
      eyebrow="Verify your email"
      title={status === "verifying" ? "Confirming your email..." : status === "success" ? "You're verified" : "This link didn't work"}
    >
      <title>Verify your email · Afritask</title>
      {status === "verifying" && (
        <p role="status" className="flex items-center gap-3 text-[15px] text-muted">
          <Spinner />
          This only takes a moment.
        </p>
      )}

      {status === "success" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4 rounded-[14px] border border-lime-deep bg-lime/50 p-5" role="status">
            <CircleCheck size={26} aria-hidden="true" className="shrink-0 text-forest" />
            <p className="text-[15px] leading-relaxed text-ink">
              {hasPendingInvite
                ? "Your account is active. Sign in and we'll take you back to your invitation."
                : "Your account is active. Sign in, name your workspace, and add your first task."}
            </p>
          </div>
          <ButtonLink href="/login" size="lg" full>
            Sign in
          </ButtonLink>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-5">
          <FormAlert>
            {errorMessage ?? "This link has expired or was replaced. Sign in to get a new one."} If you already verified, just sign in. Otherwise, sign up again to get a fresh link.
          </FormAlert>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/login" size="lg" full>
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup" variant="secondary" size="lg" full>
              Sign up again
            </ButtonLink>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
