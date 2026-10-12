"use client";

// One project: identity, state and progress, its tasks as List/Board, and its history.
// Owners/Admins change state, edit, archive and restore; archived = read-only for all.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Archive, ArrowLeft, ArchiveRestore, FolderKanban, Lock, Pencil, Plus } from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useTaskActions } from "@/context/TaskContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useWorkspaceTasks } from "@/hooks/useWorkspaceTasks";
import { archiveProject, getProject, restoreProject, updateProject } from "@/lib/services/projectService";
import { getWorkspaceActivity } from "@/lib/services/activityService";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import { PROJECT_STATE_LABELS, SETTABLE_PROJECT_STATES } from "@/utils/projects";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import { ProjectStateBadge } from "@/components/ui/Badges";
import { EmptyState, FailurePanel, Notice } from "@/components/ui/States";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";
import ActivityFeed from "@/components/activity/ActivityFeed";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";
import type { Project, ProjectState } from "@/types/models";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { activeWorkspace, workspaces, switchWorkspace } = useWorkspaces();
  const { reloadProjects } = useWorkspaceResources();
  const { openComposer } = useTaskPanels();
  const { subscribe } = useTaskActions();
  const confirm = useConfirm();

  const [project, setProject] = useState<(Project & { canManage?: boolean }) | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const response = await getProject(projectId);
      setProject(response.data.data.project);
      setFailure(null);
    } catch (error) {
      setFailure(describeFailure(error, "Couldn't open this project."));
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Task changes move the project's counts — refresh the header quietly.
  useEffect(() => subscribe(() => loadProject()), [subscribe, loadProject]);

  // Only fetch tasks once we know the project belongs to the open workspace.
  const inActiveWorkspace = !!project && project.workspaceId === activeWorkspace?.id;
  const taskQuery = useMemo(() => ({ projectId }), [projectId]);
  const projectTasks = useWorkspaceTasks(inActiveWorkspace ? activeWorkspace?.id : null, taskQuery);

  const loadActivity = useCallback(
    (page: { before?: string }) => getWorkspaceActivity(project?.workspaceId, { ...page, projectId }),
    [project?.workspaceId, projectId]
  );

  if (failure) {
    const message =
      failure.kind === "missing"
        ? "It may have been deleted, or it's in a workspace you're not a member of. If someone shared this link, ask them to check your access."
        : failure.message;
    return (
      <div className="rounded-[14px] border border-line bg-surface">
        <FailurePanel
          failure={{ ...failure, message }}
          onRetry={loadProject}
          action={
            <Link href="/projects" className="inline-flex h-11 items-center rounded-[10px] px-4 text-[15px] font-medium text-forest hover:underline">
              Back to projects
            </Link>
          }
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div role="status" aria-label="Loading project" className="flex flex-col gap-4">
        <span className="skeleton h-5 w-32" />
        <span className="skeleton h-10 w-2/3" />
        <span className="skeleton h-24" />
      </div>
    );
  }

  // A link to a project in another of my workspaces: offer to switch, don't mix data.
  if (!inActiveWorkspace) {
    const owningWorkspace = workspaces.find((workspace) => workspace.id === project.workspaceId);
    return (
      <div className="rounded-[14px] border border-line bg-surface">
        <EmptyState
          icon={FolderKanban}
          title={`“${project.name}” is in another workspace`}
          body={owningWorkspace ? `It belongs to ${owningWorkspace.name}. Switch to that workspace to see its tasks.` : "Switch to the workspace it belongs to to see its tasks."}
          action={owningWorkspace && <Button onClick={() => switchWorkspace(owningWorkspace.id)}>Switch to {owningWorkspace.name}</Button>}
        />
      </div>
    );
  }

  const isArchived = project.state === "archived";
  const canManage = !!project.canManage;
  const percent = project.taskCounts.total ? Math.round((project.taskCounts.completed / project.taskCounts.total) * 100) : null;

  const changeState = async (nextState: ProjectState) => {
    // NOTE: completing a project never completes its tasks (PRD FR05) — say so first.
    if (nextState === "completed" && project.taskCounts.open > 0) {
      const confirmed = await confirm({
        title: "Mark this project completed?",
        body: (
          <p>
            {project.taskCounts.open} task{project.taskCounts.open === 1 ? " is" : "s are"} still open. Completing the project doesn&apos;t complete
            them. They stay open and assigned as they are.
          </p>
        ),
        confirmLabel: "Mark project completed",
        cancelLabel: "Not yet",
      });
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const response = await updateProject(project.id, { state: nextState });
      setProject((previous) => (previous ? { ...previous, ...response.data.data.project } : previous));
      reloadProjects();
      toast.success(`Project is now ${PROJECT_STATE_LABELS[nextState].toLowerCase()}`);
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't change the project's status. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!isArchived) {
      const confirmed = await confirm({
        title: `Archive “${project.name}”?`,
        body: (
          <div className="flex flex-col gap-2">
            <p>Archiving makes the project and its {project.taskCounts.total} task{project.taskCounts.total === 1 ? "" : "s"} read-only for everyone, and pauses their reminders.</p>
            <p>Nothing is deleted. Archived projects drop out of task lists and the overview, and an Owner or Admin can restore it at any time.</p>
          </div>
        ),
        confirmLabel: "Archive project",
        cancelLabel: "Keep it active",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      if (isArchived) await restoreProject(project.id);
      else await archiveProject(project.id);
      toast.success(isArchived ? "Project restored. You can edit it again" : "Project archived");
      await loadProject();
      reloadProjects();
      projectTasks.reload();
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't archive or restore the project. Nothing changed. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async ({ name, description }: { name: string; description: string }) => {
    try {
      const response = await updateProject(project.id, { name, description });
      setProject((previous) => (previous ? { ...previous, ...response.data.data.project } : previous));
      reloadProjects();
      setEditOpen(false);
      toast.success("Project saved");
      return null;
    } catch (error) {
      return failureMessage(error, "Couldn't save the project. Try again.");
    }
  };

  return (
    <>
      <title>{`${project.name} · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      <Link href="/projects" className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded text-[14px] font-medium text-forest hover:underline">
        <ArrowLeft size={16} aria-hidden="true" />
        All projects
      </Link>

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2 normal-case tracking-normal">
            <ProjectStateBadge state={project.state} />
          </span>
        }
        title={project.name}
        description={project.description || (canManage ? "No description yet. Add one so people know what this project is for." : undefined)}
        actions={
          <>
            {!isArchived && (
              <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => openComposer({ projectId: project.id })}>
                Add task
              </Button>
            )}
            {canManage && !isArchived && (
              <Button variant="secondary" icon={<Pencil size={16} aria-hidden="true" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
          </>
        }
      >
        <div className="mt-5 flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-[15px] text-ink">
              {project.taskCounts.total === 0 ? (
                "No tasks yet."
              ) : (
                <>
                  <strong>{project.taskCounts.open}</strong> open · <strong>{project.taskCounts.completed}</strong> completed of {project.taskCounts.total}
                </>
              )}
            </p>
            {percent !== null && (
              <div
                role="progressbar"
                aria-label="Project progress"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-muted"
              >
                <div className="h-full rounded-full bg-forest transition-[width] duration-300" style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              {!isArchived && (
                <>
                  <label htmlFor="project-state" className="text-[14px] font-medium text-ink">
                    State
                  </label>
                  <select
                    id="project-state"
                    value={project.state}
                    disabled={busy}
                    onChange={(event) => changeState(event.target.value as ProjectState)}
                    className="field-control field-compact w-auto"
                  >
                    {SETTABLE_PROJECT_STATES.map((state: ProjectState) => (
                      <option key={state} value={state}>
                        {PROJECT_STATE_LABELS[state]}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <Button
                size="sm"
                variant={isArchived ? "primary" : "danger"}
                loading={busy}
                onClick={toggleArchive}
                icon={isArchived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
              >
                {isArchived ? "Restore project" : "Archive"}
              </Button>
            </div>
          )}
        </div>
      </PageHeader>

      {isArchived && (
        <Notice icon={Lock} tone="warning" className="mb-6">
          This project is archived, so it and its tasks are read-only and reminders are paused.{" "}
          {canManage ? "Restore it to make changes." : "An Owner or Admin can restore it."}
        </Notice>
      )}

      <TaskWorkspace
        tasks={projectTasks.tasks}
        status={projectTasks.status}
        failure={projectTasks.failure}
        reload={projectTasks.reload}
        showProject={false}
        showProjectFilter={false}
        firstUseState={
          <div className="rounded-[14px] border border-line bg-surface">
            <EmptyState
              icon={FolderKanban}
              title="No tasks in this project yet"
              body={isArchived ? "This project was archived before any tasks were added." : "Add the first step. Tasks you add here stay grouped under this project, and anyone in the workspace can see them."}
              action={
                !isArchived && (
                  <Button icon={<Plus size={17} aria-hidden="true" />} onClick={() => openComposer({ projectId: project.id })}>
                    Add a task to {project.name}
                  </Button>
                )
              }
            />
          </div>
        }
      />

      <section aria-labelledby="project-activity-heading" className="mt-10 rounded-[14px] border border-line bg-surface p-5">
        <h2 id="project-activity-heading" className="mb-4 text-[17px] font-semibold text-ink">
          Project activity
        </h2>
        <ActivityFeed
          loadPage={loadActivity}
          reloadKey={`${project.updatedAt}-${projectTasks.tasks.map((task) => task.version).join()}`}
          emptyMessage="Changes to this project and its tasks will appear here."
        />
      </section>

      <ProjectFormDialog
        mode="edit"
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
        initialValues={{ name: project.name, description: project.description || "" }}
      />
    </>
  );
}
