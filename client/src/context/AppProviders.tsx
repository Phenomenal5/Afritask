/**
 * AppProviders composes the app-wide contexts.
 * Order matters: auth → workspaces (needs the session) → profile → task writes → confirm
 * dialogs. Workspace-specific data (members, projects, my tasks) is provided by the app
 * shell, so public pages never fetch it.
 */
"use client";

import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TaskProvider } from "@/context/TaskContext";
import { UserProvider } from "@/context/UserContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";

// Bridge auth state into the workspace and profile providers without coupling the contexts directly.
function SessionProviders({ children }: { children: ReactNode }) {
  const { setUser, isAuthenticated } = useAuth();
  return (
    <WorkspaceProvider isAuthenticated={isAuthenticated}>
      <UserProvider setUser={setUser}>
        <TaskProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TaskProvider>
      </UserProvider>
    </WorkspaceProvider>
  );
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SessionProviders>{children}</SessionProviders>
    </AuthProvider>
  );
}
