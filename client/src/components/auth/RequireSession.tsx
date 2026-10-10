"use client";

// Gate for signed-in pages that live outside the workspace shell (onboarding, new
// workspace): waits for the session check, and sends signed-out visitors to sign in.
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingScreen from "@/components/layout/LoadingScreen";

export default function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) return <LoadingScreen label="Checking your session" />;
  return <>{children}</>;
}
