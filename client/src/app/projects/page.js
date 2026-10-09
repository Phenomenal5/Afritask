"use client";

// Project directory for the active workspace (PRD "project directory" interface area).
// Everyone sees every project; Owners/Admins can create them.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { createProject, getWorkspaceProjects } from "@/lib/services/projectService";
import { PROJECT_STATE_LABELS } from "@/utils/projects";
import ProtectedRoute from "@/components/ProtectedRoute";
import Navbar from "@/components/Navbar";
import FormField from "@/components/FormField";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import LoadingScreen from "@/components/LoadingScreen";

function ProjectDirectory() {
  const { activeWorkspace } = useWorkspaces();
  const [projects, setProjects] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const workspaceId = activeWorkspace?.id;
  const canManage = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  const loadProjects = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await getWorkspaceProjects(workspaceId, { includeArchived: showArchived });
      setProjects(res.data.data.projects);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load projects");
      setProjects([]);
    }
  }, [workspaceId, showArchived]);

  useEffect(() => {
    setProjects(null);
    loadProjects();
  }, [loadProjects]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createProject(workspaceId, { name: newProjectName });
      toast.success("Project created");
      setNewProjectName("");
      loadProjects();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not create project");
    } finally {
      setCreating(false);
    }
  };

  if (!activeWorkspace || projects === null) return <LoadingScreen />;

  return (
    <div className="flex-1 flex flex-col">
      <Navbar />
      <main className="max-w-3xl w-full mx-auto px-6 py-10 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "var(--moss)" }}>
          {activeWorkspace.name}
        </p>
        <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>
          Projects
        </h1>

        {canManage && (
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 sm:items-end mb-6">
            <div className="flex-1">
              <FormField
                label="New project"
                name="projectName"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. Website redesign"
                required
              />
            </div>
            <Button type="submit" loading={creating}>
              Create project
            </Button>
          </form>
        )}

        <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer" style={{ color: "var(--ink-soft)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived projects
        </label>

        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            message={
              canManage
                ? "Group related tasks into a project. Tasks without a project still live in the workspace."
                : "An Owner or Admin can create projects. Your tasks can live in the workspace without one."
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block p-4 rounded-xl transition-colors hover:border-[var(--moss)]"
                  style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[15px] font-medium truncate" style={{ color: "var(--ink)" }}>
                      {project.name}
                    </h2>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: "var(--line-soft)", color: "var(--ink-soft)" }}
                    >
                      {PROJECT_STATE_LABELS[project.state]}
                    </span>
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "var(--ink-soft)" }}>
                    {project.taskCounts.open} open · {project.taskCounts.completed} completed
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <ProjectDirectory />
    </ProtectedRoute>
  );
}
