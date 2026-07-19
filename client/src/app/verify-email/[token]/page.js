"use client";

// Email verification confirms the signup token and guides the user forward.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import Button from "@/components/Button";

// Verify the route token and show the appropriate status state.
export default function VerifyEmailPage() {
  const { token } = useParams();
  const { verifyEmail } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState("verifying"); // verifying | success | error

  // Re-run verification when the token changes so deep links continue to work.
  useEffect(() => {
    if (!token) return;
    verifyEmail(token).then((res) => {
      setStatus(res.success ? "success" : "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthLayout
      eyebrow="Afritask account verification"
      title={
        status === "verifying"
          ? "Verifying your email..."
          : status === "success"
          ? "You're all set"
          : "Something went wrong"
      }
    >
      {status === "verifying" && (
        <div className="flex items-center gap-3">
          <span
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--line)", borderTopColor: "var(--moss)" }}
          />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Hang tight, this only takes a moment.
          </p>
        </div>
      )}

      {status === "success" && (
        <>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
            Your email has been verified. You can sign in now.
          </p>
          <Button full onClick={() => router.push("/login")}>
            Sign in
          </Button>
        </>
      )}

      {status === "error" && (
        <>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
            This verification link is invalid or has expired. Try signing up
            again, or contact support if the problem continues.
          </p>
          <Button full variant="secondary" onClick={() => router.push("/signup")}>
            Back to sign up
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
