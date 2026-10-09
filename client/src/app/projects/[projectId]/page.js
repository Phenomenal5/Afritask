"use client";

// One project: its state controls (Owner/Admin) and its tasks.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useTasks } from "@/context/TaskContext";
import { archiveProject, getProject, restoreProject, updateProject } from "@/lib/services/projectService";
import { PROJECT_STATE_LABELS, SETTABLE_PROJECT_STATES } from "@/utils/projects";
import ProtectedRoute from "@/components/ProtectedRoute";
import Navbar from "@/components/Navbar";
import TaskCard from "@/components/TaskCard";
import TaskFormModal from "@/components/TaskFormModal";
import EmptyState from "@/components/EmptyState";
import Button from "@/components/Button";
import LoadingScreen from "@/components/LoadingScreen";

function ProjectDetail() {
  const { projectId } = useParams();
  const { tasks, tasksLoading, fetchTasks, updateTaskStatus, deleteTask } = useTasks();
  const [project, setProject] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const loadProject = useCallback(async () => {
    try {
      const res = await getProject(projectId);
      setProject(res.data.data.project);
    } catch {
      // Missing, or in a workspace this account isn't in — same answer either way.
      setNotFound(true);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // The project's tasks (including when it's archived — shown read-only).
  useEffect(() => {
    if (project?.id) fetchTasks({ projectId: project.id });
  }, [project?.id, fetchTasks]);

  const isArchived = project?.state === "archived";

  const changeState = async (state) => {
    // NOTE: completing a project never completes its tasks (PRD FR05) — say so first.
    if (state === "completed" && project.taskCounts.open > 0) {
      const confirmed = window.confirm(
        `${project.taskCounts.open} task(s) in this project are still open. Mark the project completed anyway? The tasks stay open.`
      );
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const res = await updateProject(project.id, { state });
      setProject((prev) => ({ ...prev, ...res.data.data.project }));
      toast.success(`Project marked ${PROJECT_STATE_LABELS[state].toLowerCase()}`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not update the project");
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!isArchived && !window.confirm("Archive this project? It becomes read-only and its reminders pause until restored.")) return;
    setBusy(true);
    try {
      if (isArchived) await restoreProject(project.id);
      else await archiveProject(project.id);
      toast.success(isArchived ? "Project restored" : "Project archived");
      await loadProject();
      fetchTasks({ projectId: project.id });
    } catch (err) {
      toast.error(err.response?.data?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="max-w-3xl w-full mx-auto px-6 py-10">
          <EmptyState title="Project not found" message="It may have been moved, or you don't have access to its workspace." />
        </main>
      </div>
    );
  }
  if (!project) return <LoadingScreen />;

  // On this page the shared task list is this project's tasks.
  const projectTasks = tasks.filter((task) => task.projectId === project.id);

  return (
    <div className="flex-1 flex flex-col">
      <Navbar />
      <main className="max-w-3xl w-full mx-auto px-6 py-10 flex-1">
        <Link href="/projects" className="text-xs" style={{ color: "var(--moss)" }}>
          ← All projects
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mt-2 mb-1">
          <h1 className="font-display text-3xl" style={{ color: "var(--ink)" }}>
            {project.name}
          </h1>
          {project.canManage && (
            <div className="flex items-center gap-2">
              {!isArchived && (
                <select
                  aria-label="Project state"
                  value={project.state}
                  disabled={busy}
                  onChange={(e) => changeState(e.target.value)}
                  className="text-sm px-2.5 py-1.5 rounded-md outline-none"
                  style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
                >
                  {SETTABLE_PROJECT_STATES.map((state) => (
                    <option key={state} value={state}>
                      {PROJECT_STATE_LABELS[state]}
                    </option>
                  ))}
                </select>
              )}
              <Button size="sm" variant="secondary" loading={busy} onClick={toggleArchive}>
                {isArchived ? "Restore" : "Archive"}
              </Button>
            </div>
          )}
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          {PROJECT_STATE_LABELS[project.state]} · {project.taskCounts.open} open · {project.taskCounts.completed} completed
        </p>

        {isArchived && (
          <p className="text-sm rounded-lg p-3 mb-6" style={{ background: "var(--line-soft)", color: "var(--ink)" }}>
            This project is archived, so it&apos;s read-only and its reminders are paused.
            {project.canManage ? " Restore it to make changes." : " An Owner or Admin can restore it."}
          </p>
        )}

        {!isArchived && (
          <div className="mb-6">
            <Button
              onClick={() => {
                setEditingTask(null);
                setModalOpen(true);
              }}
            >
              Add task to project
            </Button>
          </div>
        )}

        {tasksLoading ? (
          <div className="h-20 rounded-xl animate-pulse" style={{ background: "var(--line-soft)" }} />
        ) : projectTasks.length === 0 ? (
          <EmptyState title="No tasks in this project yet" message="Tasks you add here stay grouped under this project." />
        ) : (
          <div className="flex flex-col gap-3">
            {projectTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showProject={false}
                onToggleComplete={updateTaskStatus}
                onEdit={(selectedTask) => {
                  setEditingTask(selectedTask);
                  setModalOpen(true);
                }}
                onDelete={deleteTask}
              />
            ))}
          </div>
        )}
      </main>

      <TaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        defaultProjectId={project.id}
      />
    </div>
  );
}

export default function ProjectPage() {
  return (
    <ProtectedRoute>
      <ProjectDetail />
    </ProtectedRoute>
  );
}
