/**
 * AppProviders composes the app-wide contexts.
 * Order matters: auth → workspaces (needs the session) → profile → task writes → confirm
 * dialogs. Workspace-specific data (members, projects, my tasks) is provided by the app
 * shell, so public pages never fetch it.
 */
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import TermsGate from "@/components/auth/TermsGate";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TaskProvider } from "@/context/TaskContext";
import { UserProvider } from "@/context/UserContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { CompletionNoteProvider } from "@/components/tasks/CompletionNoteProvider";

// Bridge auth state into the workspace and profile providers without coupling the contexts directly.
// The terms themselves stay readable while the accept step is showing.
const PAGES_OPEN_BEFORE_TERMS = new Set(["/terms", "/privacy"]);

function SessionProviders({ children }: { children: ReactNode }) {
  const { setUser, isAuthenticated, termsRequired } = useAuth();
  const pathname = usePathname();
  // NOTE: the gate replaces the providers too — WorkspaceProvider would otherwise fetch
  // workspaces the server refuses (403) until the terms are accepted.
  if (termsRequired && !PAGES_OPEN_BEFORE_TERMS.has(pathname)) return <TermsGate />;
  return (
    <WorkspaceProvider isAuthenticated={isAuthenticated && !termsRequired}>
      <UserProvider setUser={setUser}>
        <TaskProvider>
          <ConfirmProvider>
            <CompletionNoteProvider>{children}</CompletionNoteProvider>
          </ConfirmProvider>
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
