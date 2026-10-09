/**
 * Workspace membership and the active workspace live here.
 * Every task screen reads `activeWorkspace` to know which workspace it is showing.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  createWorkspace as createWorkspaceRequest,
  getMyWorkspaces,
  renameWorkspace as renameWorkspaceRequest,
} from "@/lib/services/workspaceService";

const WorkspaceContext = createContext(null);

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

const storeWorkspaceId = (workspaceId) => {
  try {
    if (workspaceId) localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
    else localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    // Private mode / blocked storage: switching still works for this tab.
  }
};

// Provide the user's workspaces and the active one. `isAuthenticated` comes from AuthContext.
export function WorkspaceProvider({ children, isAuthenticated }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  // true until the first list for this session has loaded — lets pages wait before
  // deciding "you have no workspace yet, go to onboarding".
  const [workspacesLoading, setWorkspacesLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await getMyWorkspaces();
      const loadedWorkspaces = res.data.data.workspaces;
      setWorkspaces(loadedWorkspaces);
      setActiveWorkspaceId((currentId) => {
        const preferredId = currentId || readStoredWorkspaceId();
        const stillMember = loadedWorkspaces.some((workspace) => workspace.id === preferredId);
        const nextId = stillMember ? preferredId : loadedWorkspaces[0]?.id ?? null;
        storeWorkspaceId(nextId);
        return nextId;
      });
      return { success: true, workspaces: loadedWorkspaces };
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load your workspaces");
      return { success: false };
    } finally {
      setWorkspacesLoading(false);
    }
  }, []);

  // Load on sign-in; clear everything on sign-out so the next account starts clean.
  useEffect(() => {
    if (isAuthenticated) {
      setWorkspacesLoading(true);
      refreshWorkspaces();
    } else {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setWorkspacesLoading(false);
    }
  }, [isAuthenticated, refreshWorkspaces]);

  const switchWorkspace = useCallback((workspaceId) => {
    setActiveWorkspaceId(workspaceId);
    storeWorkspaceId(workspaceId);
  }, []);

  const createWorkspace = useCallback(async (name) => {
    try {
      const res = await createWorkspaceRequest(name);
      const workspace = res.data.data.workspace;
      setWorkspaces((prev) => [...prev, workspace]);
      switchWorkspace(workspace.id);
      toast.success(`${workspace.name} is ready`);
      return { success: true, workspace };
    } catch (err) {
      const message = err.response?.data?.message || "Could not create workspace";
      toast.error(message);
      return { success: false, message };
    }
  }, [switchWorkspace]);

  const renameWorkspace = useCallback(async (workspaceId, name) => {
    try {
      const res = await renameWorkspaceRequest(workspaceId, name);
      const { name: savedName } = res.data.data.workspace;
      setWorkspaces((prev) => prev.map((workspace) => (workspace.id === workspaceId ? { ...workspace, name: savedName } : workspace)));
      toast.success("Workspace renamed");
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || "Could not rename workspace";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  const value = useMemo(
    () => ({
      workspaces,
      activeWorkspace,
      workspacesLoading,
      switchWorkspace,
      createWorkspace,
      renameWorkspace,
      refreshWorkspaces,
    }),
    [workspaces, activeWorkspace, workspacesLoading, switchWorkspace, createWorkspace, renameWorkspace, refreshWorkspaces]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaces must be used within a WorkspaceProvider");
  return ctx;
}
