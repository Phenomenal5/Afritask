"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { completedThisWeek, compareByUrgency, hasNoDueDate, isDueToday, isOverdue, isUpcoming, type DueBucket } from "@/utils/taskBuckets";
import type { Task, TaskPriority, TaskStatus } from "@/types/models";

// Filters live in the URL: links from the Overview ("3 overdue") land pre-filtered, the
// back button works, and List/Board read the very same values.
// "week" = completed this week (Mon–Sun, viewer's zone) — the Overview count's drill-down.
// "scheduled" = To-do work planned to start later (same rule as the server's ?due=scheduled).
export type DueFilter = "all" | "open" | Exclude<DueBucket, "completed"> | "completed" | "week" | "scheduled";
export type TaskView = "list" | "board";

export interface TaskFilters {
  view: TaskView;
  search: string;
  status: TaskStatus | "";
  priority: TaskPriority | "";
  // "" any, "me", "none" (unassigned) or a membership id.
  assignee: string;
  // "" any, "none" (no project) or a project id.
  project: string;
  due: DueFilter;
}

// Params that are filters. `view`, `scope` and `task` are not — clearing keeps them.
const FILTER_KEYS = ["q", "status", "priority", "assignee", "project", "due"] as const;

export function useTaskFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const filters = useMemo<TaskFilters>(
    () => ({
      view: searchParams.get("view") === "board" ? "board" : "list",
      search: searchParams.get("q") ?? "",
      status: (searchParams.get("status") as TaskStatus | null) ?? "",
      priority: (searchParams.get("priority") as TaskPriority | null) ?? "",
      assignee: searchParams.get("assignee") ?? "",
      project: searchParams.get("project") ?? "",
      due: (searchParams.get("due") as DueFilter | null) ?? "all",
    }),
    [searchParams]
  );

  // NOTE: native history.replaceState, not router.replace. A filter is client-only state —
  // there's nothing to fetch from the server — and router.replace issued while the page was
  // still settling after load got silently discarded (clicking Board did nothing). Next
  // keeps useSearchParams in sync with native history calls. The current query is read at
  // call time so a stale closure can never drop another parameter.
  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const nextParams = new URLSearchParams(window.location.search);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === "" || (key === "due" && value === "all") || (key === "view" && value === "list")) nextParams.delete(key);
        else nextParams.set(key, value);
      });
      const query = nextParams.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname]
  );

  const clearFilters = useCallback(() => {
    setParams(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  }, [setParams]);

  const activeFilterCount = FILTER_KEYS.filter((key) => {
    const value = searchParams.get(key);
    return value !== null && value !== "" && !(key === "due" && value === "all");
  }).length;

  return { filters, setParams, clearFilters, activeFilterCount };
}

// Everything except the due-date filter (so due chips can show their own counts).
export function applyBaseFilters(tasks: Task[], filters: TaskFilters, myMembershipId: string | null): Task[] {
  const searchText = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.assignee === "me" && (!myMembershipId || task.assigneeMembershipId !== myMembershipId)) return false;
    if (filters.assignee === "none" && task.assigneeMembershipId) return false;
    if (filters.assignee && !["me", "none"].includes(filters.assignee) && task.assigneeMembershipId !== filters.assignee) return false;
    if (filters.project === "none" && task.projectId) return false;
    if (filters.project && filters.project !== "none" && task.projectId !== filters.project) return false;
    if (searchText) {
      const haystack = `${task.title} ${task.description ?? ""} ${task.project?.name ?? ""} ${task.parent?.title ?? ""}`.toLowerCase();
      if (!haystack.includes(searchText)) return false;
    }
    return true;
  });
}

export function matchesDueFilter(task: Task, due: DueFilter, now: Date | null, timezone: string): boolean {
  if (due === "all") return true;
  if (due === "open") return task.status !== "completed";
  if (due === "completed") return task.status === "completed";
  // Date buckets need "now", which only exists after mount.
  if (!now) return true;
  if (due === "week") return completedThisWeek(task, now, timezone);
  // NOTE: the server's ?due= rules — an item due earlier today is in Today AND Overdue.
  if (due === "overdue") return isOverdue(task, now);
  if (due === "today") return isDueToday(task, now, timezone);
  if (due === "upcoming") return isUpcoming(task, now, timezone);
  if (due === "scheduled") return task.status !== "completed" && !!task.startAt && new Date(task.startAt).getTime() > now.getTime();
  return hasNoDueDate(task);
}

// List order: open work by urgency, completed work last (most recently completed first).
export function sortForList(tasks: Task[]): Task[] {
  const openTasks = tasks.filter((task) => task.status !== "completed").sort(compareByUrgency);
  const completedTasks = tasks
    .filter((task) => task.status === "completed")
    .sort((first, second) => new Date(second.completedAt ?? second.updatedAt).getTime() - new Date(first.completedAt ?? first.updatedAt).getTime());
  return [...openTasks, ...completedTasks];
}
