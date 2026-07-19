"use client";

// The landing route sends visitors to login or the dashboard based on session state.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";

// Route visitors to the right starting point once auth hydration finishes.
export default function RootPage() {
  const { isAuthenticated, authLoading } = useAuth();
  const router = useRouter();

  // After auth loading completes, redirect to the correct first screen.
  useEffect(() => {
    if (authLoading) return;
    router.replace(isAuthenticated ? "/dashboard" : "/login");
  }, [authLoading, isAuthenticated, router]);

  return <LoadingScreen label="Getting Afritask ready" />;
}
