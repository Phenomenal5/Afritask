/**
 * The active workspace's people, projects and labels — loaded once per workspace and
 * shared by every screen and form that needs them (assignee pickers, project filters,
 * the sidebar's project shortcuts), instead of each one fetching its own copy.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getWorkspace } from "@/lib/services/workspaceService";
import { getWorkspaceProjects } from "@/lib/services/projectService";
import { getWorkspaceLabels } from "@/lib/services/labelService";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import type { Label, Member, Project, WorkspaceDetails, WorkspaceRole } from "@/types/models";
import type { LoadStatus } from "@/hooks/useWorkspaceTasks";

interface WorkspaceResources {
  workspace: WorkspaceDetails | null;
  members: Member[];
  // Non-archived projects (what pickers and shortcuts offer).
  projects: Project[];
  labels: Label[];
  myMembership: Member | null;
  role: WorkspaceRole | null;
  isManager: boolean;
  status: LoadStatus;
  reloadWorkspace: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  reloadLabels: () => Promise<void>;
}

const WorkspaceResourcesContext = createContext<WorkspaceResources | null>(null);

export function WorkspaceResourcesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspaces();
  const workspaceId: string | null = activeWorkspace?.id ?? null;

  const [workspace, setWorkspace] = useState<WorkspaceDetails | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");

  // NOTE: answers for a workspace we've switched away from are dropped (see useWorkspaceTasks).
  const currentWorkspaceRef = useRef(workspaceId);
  currentWorkspaceRef.current = workspaceId;

  const reloadWorkspace = useCallback(async () => {
    if (!workspaceId) return;
    const response = await getWorkspace(workspaceId);
    if (currentWorkspaceRef.current === workspaceId) setWorkspace(response.data.data.workspace);
  }, [workspaceId]);

  const reloadProjects = useCallback(async () => {
    if (!workspaceId) return;
    const response = await getWorkspaceProjects(workspaceId);
    if (currentWorkspaceRef.current === workspaceId) setProjects(response.data.data.projects);
  }, [workspaceId]);

  const reloadLabels = useCallback(async () => {
    if (!workspaceId) return;
    const response = await getWorkspaceLabels(workspaceId);
    if (currentWorkspaceRef.current === workspaceId) setLabels(response.data.data.labels);
  }, [workspaceId]);

  useEffect(() => {
    setWorkspace(null);
    setProjects([]);
    setLabels([]);
    if (!workspaceId) return;
    setStatus("loading");
    Promise.all([reloadWorkspace(), reloadProjects(), reloadLabels()])
      .then(() => setStatus("ready"))
      .catch(() => {
        if (currentWorkspaceRef.current === workspaceId) setStatus("error");
      });
  }, [workspaceId, reloadWorkspace, reloadProjects, reloadLabels]);

  const value = useMemo<WorkspaceResources>(() => {
    const members = workspace?.members ?? [];
    const myMembership = members.find((member) => member.user.id === user?.id) ?? null;
    const role = (activeWorkspace?.role as WorkspaceRole | undefined) ?? null;
    return {
      workspace,
      members,
      projects,
      labels,
      myMembership,
      role,
      isManager: role === "owner" || role === "admin",
      status,
      reloadWorkspace,
      reloadProjects,
      reloadLabels,
    };
  }, [workspace, projects, labels, user?.id, activeWorkspace?.role, status, reloadWorkspace, reloadProjects, reloadLabels]);

  return <WorkspaceResourcesContext.Provider value={value}>{children}</WorkspaceResourcesContext.Provider>;
}

export function useWorkspaceResources(): WorkspaceResources {
  const context = useContext(WorkspaceResourcesContext);
  if (!context) throw new Error("useWorkspaceResources must be used within a WorkspaceResourcesProvider");
  return context;
}
