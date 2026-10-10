"use client";

// TaskWorkspace: filters + List/Board over ONE task list. Both views receive the exact
// same filtered array, so they can never disagree (PRD FR12 "same data and filters").
import { useMemo, type ReactNode } from "react";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useTaskFilters, applyBaseFilters, matchesDueFilter, sortForList, type DueFilter } from "@/hooks/useTaskFilters";
import { useNow } from "@/hooks/useNow";
import { useViewer } from "@/hooks/useViewer";
import { FailurePanel, FilteredEmptyState, SkeletonRows } from "@/components/ui/States";
import TaskFilterBar from "./TaskFilterBar";
import TaskList from "./TaskList";
import TaskBoard from "./TaskBoard";
import type { LoadStatus } from "@/hooks/useWorkspaceTasks";
import type { Failure } from "@/lib/errors";
import type { Task } from "@/types/models";

interface TaskWorkspaceProps {
  tasks: Task[];
  status: LoadStatus;
  failure: Failure | null;
  reload: () => void;
  // Shown when the list is empty BEFORE any filter (first use).
  firstUseState: ReactNode;
  showProject?: boolean;
  showProjectFilter?: boolean;
  showAssigneeFilter?: boolean;
}

const DUE_FILTERS: DueFilter[] = ["all", "open", "overdue", "today", "upcoming", "none", "completed", "week"];

export default function TaskWorkspace({
  tasks,
  status,
  failure,
  reload,
  firstUseState,
  showProject = true,
  showProjectFilter = true,
  showAssigneeFilter = true,
}: TaskWorkspaceProps) {
  const { filters, setParams, clearFilters, activeFilterCount } = useTaskFilters();
  const { myMembership } = useWorkspaceResources();
  const { timezone } = useViewer();
  const now = useNow();

  const baseFiltered = useMemo(() => applyBaseFilters(tasks, filters, myMembership?.id ?? null), [tasks, filters, myMembership?.id]);

  const dueCounts = useMemo(() => {
    if (status !== "ready" || !now) return null;
    return Object.fromEntries(
      DUE_FILTERS.map((due) => [due, baseFiltered.filter((task) => matchesDueFilter(task, due, now, timezone)).length])
    ) as Record<DueFilter, number>;
  }, [baseFiltered, status, now, timezone]);

  const visibleTasks = useMemo(
    () => sortForList(baseFiltered.filter((task) => matchesDueFilter(task, filters.due, now, timezone))),
    [baseFiltered, filters.due, now, timezone]
  );

  const filterBar = (
    <TaskFilterBar
      filters={filters}
      setParams={setParams}
      clearFilters={clearFilters}
      activeFilterCount={activeFilterCount}
      dueCounts={dueCounts}
      showProjectFilter={showProjectFilter}
      showAssigneeFilter={showAssigneeFilter}
    />
  );

  if (status === "error" && failure) {
    return <FailurePanel failure={failure} onRetry={reload} />;
  }

  // First use: nothing at all yet — no point showing filters for an empty list.
  if (status === "ready" && tasks.length === 0 && activeFilterCount === 0) {
    return <>{firstUseState}</>;
  }

  return (
    <>
      {filterBar}
      <p className="sr-only" aria-live="polite">
        {status === "ready" ? `${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"} shown` : ""}
      </p>
      {status === "loading" ? (
        <SkeletonRows rows={5} label="Loading tasks" />
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-surface">
          <FilteredEmptyState onClear={clearFilters} />
        </div>
      ) : filters.view === "board" ? (
        <TaskBoard tasks={visibleTasks} now={now} showProject={showProject} />
      ) : (
        <TaskList tasks={visibleTasks} now={now} showProject={showProject} />
      )}
    </>
  );
}
