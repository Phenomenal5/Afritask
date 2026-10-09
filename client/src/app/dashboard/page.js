"use client";

// Dashboard combines task loading, filtering, and the create/edit flow.
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTasks } from "@/context/TaskContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import LoadingScreen from "@/components/LoadingScreen";
import ProtectedRoute from "@/components/ProtectedRoute";
import Navbar from "@/components/Navbar";
import TaskCard from "@/components/TaskCard";
import TaskFormModal from "@/components/TaskFormModal";
import EmptyState from "@/components/EmptyState";
import Button from "@/components/Button";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

// Render the authenticated task dashboard and connect it to the task context.
function DashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const { activeWorkspace, workspaces, workspacesLoading } = useWorkspaces();
  const { tasks, tasksLoading, fetchTasks, updateTaskStatus, deleteTask } = useTasks();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // A verified account with no workspace yet (new signup) starts at onboarding (PRD J1).
  useEffect(() => {
    if (!workspacesLoading && workspaces.length === 0) router.replace("/onboarding");
  }, [workspacesLoading, workspaces.length, router]);

  // Load tasks when the dashboard appears and again whenever the active workspace
  // changes (fetchTasks is re-created per workspace).
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filter !== "all") {
      result = result.filter((t) => t.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [tasks, filter, search]);

  const stats = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "completed").length;
    return { total: tasks.length, completed };
  }, [tasks]);

  const handleOpenCreate = () => {
    setEditingTask(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (task) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const firstName = user?.name?.split(" ")[0];

  if (workspacesLoading || !activeWorkspace) return <LoadingScreen />;

  return (
    <div className="flex-1 flex flex-col">
      <Navbar />

      <main className="max-w-3xl w-full mx-auto px-6 py-10 flex-1">
        <div className="flex items-end justify-between mb-1">
          <h1 className="font-display text-3xl" style={{ color: "var(--ink)" }}>
            {firstName ? `Hi, ${firstName}` : "Your tasks"}
          </h1>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "var(--moss)" }}>
          {activeWorkspace.name}
        </p>
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
          {stats.total === 0
            ? "Start with one clear win."
            : `${stats.completed} of ${stats.total} tasks done. Keep the rhythm going.`}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2"
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
            >
              <circle cx="6.5" cy="6.5" r="5" stroke="var(--ink-soft)" strokeWidth="1.3" />
              <path d="M10.5 10.5L13.5 13.5" stroke="var(--ink-soft)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your tasks..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
            />
          </div>
          <Button onClick={handleOpenCreate}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Add task
          </Button>
        </div>

        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap cursor-pointer transition-colors"
              style={{
                background: filter === f.key ? "var(--ink)" : "var(--paper-raised)",
                color: filter === f.key ? "var(--paper)" : "var(--ink-soft)",
                border: `1px solid ${filter === f.key ? "var(--ink)" : "var(--line)"}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {tasksLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl animate-pulse"
                style={{ background: "var(--line-soft)" }}
              />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState onAddTask={handleOpenCreate} filtered={filter !== "all" || !!search} />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleComplete={updateTaskStatus}
                onEdit={handleOpenEdit}
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
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
