"use client";

// Protects authenticated routes by waiting for session hydration and redirecting guests.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingScreen from "./LoadingScreen";

// Redirect unauthenticated visitors away from private screens while auth state loads.
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, authLoading } = useAuth();
  const router = useRouter();

  // Send guests to login once auth loading is finished and we know they are signed out.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return <LoadingScreen />;
  }

  return children;
}
