"use client";

// Project directory: each project's identity, state, progress and next action.
// Everyone sees every project in the workspace (PRD §8); Owners/Admins create them.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Archive, ChevronRight, FolderKanban, Plus } from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { createProject, getWorkspaceProjects } from "@/lib/services/projectService";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import { ProjectStateBadge } from "@/components/ui/Badges";
import { EmptyState, FailurePanel, SkeletonRows } from "@/components/ui/States";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";
import type { Project } from "@/types/models";

// The one thing to say about where a project stands.
const nextActionOf = (project: Project) => {
  if (project.state === "archived") return "Archived. Read-only until it's restored.";
  if (project.taskCounts.total === 0) return "No tasks yet. Add the first one.";
  if (project.taskCounts.open === 0) return project.state === "completed" ? "All tasks done." : "All tasks done. Mark it completed?";
  if (project.state === "on_hold") return `On hold with ${project.taskCounts.open} open task${project.taskCounts.open === 1 ? "" : "s"}.`;
  return `${project.taskCounts.open} open task${project.taskCounts.open === 1 ? "" : "s"} to move forward.`;
};

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspaces();
  const { isManager, reloadProjects } = useWorkspaceResources();
  const workspaceId: string | undefined = activeWorkspace?.id;

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const createOpen = searchParams.get("new") === "1" && isManager;

  const loadProjects = useCallback(async () => {
    if (!workspaceId) return;
    setFailure(null);
    try {
      const response = await getWorkspaceProjects(workspaceId, { includeArchived: showArchived });
      setProjects(response.data.data.projects);
    } catch (error) {
      setFailure(describeFailure(error, "Couldn't load projects."));
    }
  }, [workspaceId, showArchived]);

  useEffect(() => {
    setProjects(null);
    loadProjects();
  }, [loadProjects]);

  // Native history (see useTaskFilters): the dialog is client state, kept linkable via ?new=1.
  const setCreateOpen = (open: boolean) => window.history.replaceState(null, "", open ? "/projects?new=1" : "/projects");

  const handleCreate = async ({ name, description }: { name: string; description: string }) => {
    if (!workspaceId) return "No workspace is open.";
    try {
      const response = await createProject(workspaceId, { name, description });
      toast.success(`Created “${name}”`);
      setCreateOpen(false);
      loadProjects();
      reloadProjects();
      router.push(`/projects/${response.data.data.project.id}`);
      return null;
    } catch (error) {
      return failureMessage(error, "Couldn't create the project.");
    }
  };

  const archivedCount = projects?.filter((project) => project.state === "archived").length ?? 0;

  return (
    <>
      <title>{`Projects · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      <PageHeader
        eyebrow={activeWorkspace?.name}
        title="Projects"
        description={
          isManager
            ? "Projects group related tasks so progress is easy to follow. Everyone in the workspace can see them; Owners and Admins manage them."
            : "Projects group related tasks. You can see every project here; Owners and Admins create and manage them."
        }
        actions={
          isManager && (
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreateOpen(true)}>
              New project
            </Button>
          )
        }
      />

      <label className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-ink">
        <input type="checkbox" className="task-check" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        Show archived projects
      </label>

      {failure ? (
        <div className="rounded-[14px] border border-line bg-surface">
          <FailurePanel failure={failure} onRetry={loadProjects} />
        </div>
      ) : projects === null ? (
        <SkeletonRows rows={3} label="Loading projects" />
      ) : projects.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-surface">
          <EmptyState
            icon={FolderKanban}
            title={showArchived ? "No projects, archived or otherwise" : "No projects yet"}
            body={
              isManager
                ? "Create a project when you have a few related tasks, like a launch, a client or a course. Tasks without a project still live in the workspace."
                : "An Owner or Admin can create projects. Until then, tasks live in the workspace without one, and nothing is blocked."
            }
            action={
              isManager && (
                <Button icon={<Plus size={17} aria-hidden="true" />} onClick={() => setCreateOpen(true)}>
                  Create the first project
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[14px] border border-line bg-surface">
          {projects.map((project) => {
            const percent = project.taskCounts.total ? Math.round((project.taskCounts.completed / project.taskCounts.total) * 100) : null;
            return (
              <li key={project.id} className="border-t border-line-soft first:border-t-0">
                <Link href={`/projects/${project.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-muted/60">
                  <span
                    aria-hidden="true"
                    className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-lime font-display text-lg font-semibold text-forest-deep sm:inline-flex"
                  >
                    {project.state === "archived" ? <Archive size={19} /> : project.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[16px] font-semibold text-ink group-hover:underline">{project.name}</span>
                      <ProjectStateBadge state={project.state} />
                    </span>
                    {project.description && <span className="mt-0.5 block truncate text-[14px] text-muted">{project.description}</span>}
                    <span className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                      <span className="text-[14px] text-ink">{nextActionOf(project)}</span>
                      {percent !== null && (
                        <span className="flex items-center gap-2 text-[13px] text-muted">
                          <span
                            role="progressbar"
                            aria-label={`${project.name}: ${project.taskCounts.completed} of ${project.taskCounts.total} tasks completed`}
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="block h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted"
                          >
                            <span className="block h-full rounded-full bg-forest" style={{ width: `${percent}%` }} />
                          </span>
                          {project.taskCounts.completed}/{project.taskCounts.total} done
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight size={19} aria-hidden="true" className="shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {showArchived && archivedCount > 0 && (
        <p className="mt-3 text-[14px] text-muted">Archived projects stay viewable but read-only. {isManager ? "Open one to restore it." : "An Owner or Admin can restore them."}</p>
      )}

      <ProjectFormDialog mode="create" open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />
    </>
  );
}
