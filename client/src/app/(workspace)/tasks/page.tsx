"use client";

// My Tasks (PRD FR11) with a switch to everyone's tasks. "Assigned to me" includes
// separately assigned subtasks (with their parent shown); "Everyone" shows top-level tasks,
// as boards do. Both feed the same List/Board + filters.
import { ListChecks, Plus, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useMyWork } from "@/context/MyWorkContext";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useWorkspaceTasks } from "@/hooks/useWorkspaceTasks";
import { useTaskFilters } from "@/hooks/useTaskFilters";
import { cx } from "@/lib/cx";
import PageHeader from "@/components/layout/PageHeader";
import Button, { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import TaskWorkspace from "@/components/tasks/TaskWorkspace";

const EVERYONE = {} as const;

export default function TasksPage() {
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") === "all" ? "all" : "mine";
  const { activeWorkspace } = useWorkspaces();
  const { openComposer } = useTaskPanels();
  const { setParams } = useTaskFilters();
  const myWork = useMyWork();
  // Only fetch everyone's tasks when that scope is showing.
  const everyone = useWorkspaceTasks(scope === "all" ? activeWorkspace?.id : null, EVERYONE);

  const source =
    scope === "mine"
      ? { tasks: myWork.myTasks, status: myWork.myTasksStatus, failure: myWork.myTasksFailure, reload: myWork.reloadMyTasks }
      : everyone;

  const firstUseState =
    scope === "mine" ? (
      <div className="rounded-[14px] border border-line bg-surface">
        <EmptyState
          icon={ListChecks}
          title="Nothing is assigned to you yet"
          body="Tasks you're responsible for collect here, sorted by what's due first. Add one for yourself, or see what the rest of the workspace is working on."
          action={
            <>
              <Button icon={<Plus size={17} aria-hidden="true" />} onClick={() => openComposer()}>
                New task
              </Button>
              <ButtonLink href="/tasks?scope=all" variant="secondary">
                See everyone&apos;s tasks
              </ButtonLink>
            </>
          }
        />
      </div>
    ) : (
      <div className="rounded-[14px] border border-line bg-surface">
        <EmptyState
          icon={ListChecks}
          title="This workspace has no tasks yet"
          body="Start with one small, clear step. Only a title is needed — you can add a project, an owner and a date whenever you're ready."
          action={
            <Button icon={<Plus size={17} aria-hidden="true" />} onClick={() => openComposer()}>
              Add the first task
            </Button>
          }
        />
      </div>
    );

  return (
    <>
      <title>{`${scope === "mine" ? "My Tasks" : "All tasks"} · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      <PageHeader
        eyebrow={activeWorkspace?.name}
        title={scope === "mine" ? "My Tasks" : "Everyone's tasks"}
        description={
          scope === "mine"
            ? "Everything you're responsible for in this workspace, including subtasks assigned to you. Overdue and due-today work comes first."
            : "Every top-level task in this workspace. Subtasks live inside their parent task; archived projects are left out."
        }
        actions={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => openComposer()}>
            New task
          </Button>
        }
      >
        <div role="group" aria-label="Whose tasks" className="mt-5 inline-flex rounded-[10px] border border-line bg-surface p-1">
          {(
            [
              { value: "mine", label: "Assigned to me", icon: ListChecks },
              { value: "all", label: "Everyone", icon: Users },
            ] as const
          ).map((option) => {
            const selected = scope === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                // Switching scope drops the assignee filter — it means different things in each.
                onClick={() => setParams({ scope: option.value === "all" ? "all" : null, assignee: null })}
                className={cx(
                  "inline-flex h-10 cursor-pointer items-center gap-2 rounded-[8px] px-3.5 text-[14.5px] font-medium transition-colors",
                  selected ? "bg-lime text-forest-deep" : "text-muted hover:text-ink"
                )}
              >
                <Icon size={17} aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>
      </PageHeader>

      <TaskWorkspace
        tasks={source.tasks}
        status={source.status}
        failure={source.failure}
        reload={source.reload}
        firstUseState={firstUseState}
        showAssigneeFilter={scope === "all"}
      />
    </>
  );
}
