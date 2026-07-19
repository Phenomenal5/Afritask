/**
 * AppProviders composes the feature contexts used by the app shell.
 * It keeps auth, profile, and task state in the correct dependency order.
 */
"use client";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TaskProvider } from "@/context/TaskContext";
import { UserProvider } from "@/context/UserContext";

// Bridge auth state into the profile and task providers without coupling the contexts directly.
function SessionProviders({ children }) {
  const { setUser, logoutVersion } = useAuth();

  return (
    <UserProvider setUser={setUser}>
      <TaskProvider logoutVersion={logoutVersion}>{children}</TaskProvider>
    </UserProvider>
  );
}

// Wrap the app in auth first, then profile and task providers that depend on it.
export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <SessionProviders>{children}</SessionProviders>
    </AuthProvider>
  );
}
