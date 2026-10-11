/**
 * Workspace membership and the active workspace live here.
 * Every workspace screen reads `activeWorkspace` to know which workspace it is showing.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  createWorkspace as createWorkspaceRequest,
  getMyWorkspaces,
  renameWorkspace as renameWorkspaceRequest,
} from "@/lib/services/workspaceService";
import { failureMessage } from "@/lib/errors";
import type { ActionResult, WorkspaceSummary } from "@/types/models";

interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  workspacesLoading: boolean;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string) => Promise<ActionResult<WorkspaceSummary>>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<ActionResult>;
  refreshWorkspaces: () => Promise<ActionResult<WorkspaceSummary[]>>;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

// Remembers the last workspace per browser. A convenience only: the server re-checks
// membership on every request, so a stale or tampered value just falls back below.
const ACTIVE_WORKSPACE_KEY = "afritask_active_workspace";

const readStoredWorkspaceId = () => {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
};

const storeWorkspaceId = (workspaceId: string | null) => {
  try {
    if (workspaceId) localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
    else localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    // Private mode / blocked storage: switching still works for this tab.
  }
};

// Provide the user's workspaces and the active one. `isAuthenticated` comes from AuthContext.
export function WorkspaceProvider({ children, isAuthenticated }: { children: ReactNode; isAuthenticated: boolean }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  // Whether the list for the CURRENT session has loaded. `workspacesLoading` is derived
  // from it so pages can wait before deciding "no workspace yet, go to onboarding".
  // NOTE: it used to be its own state, set false while signed out. On a hard refresh the
  // session check resolves first, so for one render the app saw "signed in, not loading,
  // zero workspaces" and bounced every deep link to onboarding. Deriving it closes that gap.
  const [loadedForSession, setLoadedForSession] = useState(false);
  const workspacesLoading = isAuthenticated && !loadedForSession;

  const refreshWorkspaces = useCallback(async (): Promise<ActionResult<WorkspaceSummary[]>> => {
    try {
      const response = await getMyWorkspaces();
      const loadedWorkspaces: WorkspaceSummary[] = response.data.data.workspaces;
      setWorkspaces(loadedWorkspaces);
      setActiveWorkspaceId((currentId) => {
        const preferredId = currentId || readStoredWorkspaceId();
        const stillMember = loadedWorkspaces.some((workspace) => workspace.id === preferredId);
        const nextId = stillMember ? preferredId : loadedWorkspaces[0]?.id ?? null;
        storeWorkspaceId(nextId);
        return nextId;
      });
      return { success: true, data: loadedWorkspaces };
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't load your workspaces. Refresh to try again."));
      return { success: false };
    } finally {
      setLoadedForSession(true);
    }
  }, []);

  // Load on sign-in; clear everything on sign-out so the next account starts clean.
  useEffect(() => {
    if (isAuthenticated) {
      refreshWorkspaces();
    } else {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setLoadedForSession(false);
    }
  }, [isAuthenticated, refreshWorkspaces]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    storeWorkspaceId(workspaceId);
  }, []);

  // NOTE: always creates a NEW workspace alongside the others — it never renames or
  // replaces an existing one. Onboarding guards against creating twice (see OnboardingFlow).
  const createWorkspace = useCallback(
    async (name: string): Promise<ActionResult<WorkspaceSummary>> => {
      try {
        const response = await createWorkspaceRequest(name);
        const workspace: WorkspaceSummary = response.data.data.workspace;
        setWorkspaces((previous) => [...previous.filter((existing) => existing.id !== workspace.id), workspace]);
        switchWorkspace(workspace.id);
        return { success: true, data: workspace };
      } catch (error) {
        return { success: false, message: failureMessage(error, "Couldn't create the workspace. Try again.") };
      }
    },
    [switchWorkspace]
  );

  const renameWorkspace = useCallback(async (workspaceId: string, name: string): Promise<ActionResult> => {
    try {
      const response = await renameWorkspaceRequest(workspaceId, name);
      const { name: savedName } = response.data.data.workspace;
      setWorkspaces((previous) => previous.map((workspace) => (workspace.id === workspaceId ? { ...workspace, name: savedName } : workspace)));
      return { success: true };
    } catch (error) {
      return { success: false, message: failureMessage(error, "Couldn't rename the workspace.") };
    }
  }, []);

  const activeWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null, [workspaces, activeWorkspaceId]);

  const value = useMemo(
    () => ({ workspaces, activeWorkspace, workspacesLoading, switchWorkspace, createWorkspace, renameWorkspace, refreshWorkspaces }),
    [workspaces, activeWorkspace, workspacesLoading, switchWorkspace, createWorkspace, renameWorkspace, refreshWorkspaces]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces(): WorkspaceState {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspaces must be used within a WorkspaceProvider");
  return context;
}
