/**
 * AppProviders composes the feature contexts used by the app shell.
 * Order matters: auth → workspaces (needs the session) → profile → tasks (need the active workspace).
 */
"use client";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TaskProvider } from "@/context/TaskContext";
import { UserProvider } from "@/context/UserContext";
import { WorkspaceProvider, useWorkspaces } from "@/context/WorkspaceContext";

// Tasks follow whichever workspace is active.
function WorkspaceScopedProviders({ children, logoutVersion }) {
  const { activeWorkspace } = useWorkspaces();
  return (
    <TaskProvider logoutVersion={logoutVersion} activeWorkspaceId={activeWorkspace?.id ?? null}>
      {children}
    </TaskProvider>
  );
}

// Bridge auth state into the workspace, profile and task providers without coupling the contexts directly.
function SessionProviders({ children }) {
  const { setUser, logoutVersion, isAuthenticated } = useAuth();

  return (
    <WorkspaceProvider isAuthenticated={isAuthenticated}>
      <UserProvider setUser={setUser}>
        <WorkspaceScopedProviders logoutVersion={logoutVersion}>{children}</WorkspaceScopedProviders>
      </UserProvider>
    </WorkspaceProvider>
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
