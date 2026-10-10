"use client";

// The search + filters toolbar shared by List and Board. Filters combine with AND; the
// due-date chips show how many tasks sit in each bucket before you click.
import { useEffect, useRef, useState } from "react";
import { LayoutList, Search, SquareKanban, X } from "lucide-react";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { PRIORITY_STYLES, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES } from "@/utils/taskMeta";
import { cx } from "@/lib/cx";
import Button from "@/components/ui/Button";
import type { DueFilter, TaskFilters } from "@/hooks/useTaskFilters";
import type { TaskPriority, TaskStatus } from "@/types/models";

const DUE_CHIPS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "none", label: "No due date" },
  { value: "completed", label: "Completed" },
  { value: "week", label: "Done this week" },
];

interface TaskFilterBarProps {
  filters: TaskFilters;
  setParams: (changes: Record<string, string | null>) => void;
  clearFilters: () => void;
  activeFilterCount: number;
  dueCounts: Record<DueFilter, number> | null;
  // Hidden on a project page (the project is fixed) and on "Assigned to me".
  showProjectFilter?: boolean;
  showAssigneeFilter?: boolean;
}

const compactSelect = "field-control field-compact w-auto min-w-0 max-w-[12rem] pr-8!";

export default function TaskFilterBar({
  filters,
  setParams,
  clearFilters,
  activeFilterCount,
  dueCounts,
  showProjectFilter = true,
  showAssigneeFilter = true,
}: TaskFilterBarProps) {
  const { members, projects } = useWorkspaceResources();

  // Typing updates the URL after a short pause, not on every keystroke.
  // NOTE: only adopt the URL's value when it changed from OUTSIDE (Clear filters, back
  // button). Our own debounced write lands a moment later and would otherwise overwrite
  // whatever was typed in the meantime.
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const lastWrittenSearchRef = useRef(filters.search);
  useEffect(() => {
    if (filters.search !== lastWrittenSearchRef.current) {
      lastWrittenSearchRef.current = filters.search;
      setSearchDraft(filters.search);
    }
  }, [filters.search]);
  useEffect(() => {
    if (searchDraft === lastWrittenSearchRef.current) return;
    const timer = window.setTimeout(() => {
      lastWrittenSearchRef.current = searchDraft;
      setParams({ q: searchDraft });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft, setParams]);

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="task-search" className="sr-only">
            Search tasks
          </label>
          <input
            id="task-search"
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search titles, descriptions and projects"
            className="field-control pl-10!"
          />
        </div>
        <div role="group" aria-label="View" className="inline-flex shrink-0 self-start rounded-[10px] border border-line bg-surface p-1">
          {(["list", "board"] as const).map((view) => {
            const Icon = view === "list" ? LayoutList : SquareKanban;
            const selected = filters.view === view;
            return (
              <button
                key={view}
                type="button"
                aria-pressed={selected}
                onClick={() => setParams({ view })}
                className={cx(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] px-3 text-[14px] font-medium transition-colors",
                  selected ? "bg-forest text-on-forest" : "text-muted hover:text-ink"
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {view === "list" ? "List" : "Board"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="filter-status">
          Status
        </label>
        <select id="filter-status" value={filters.status} onChange={(event) => setParams({ status: event.target.value })} className={compactSelect}>
          <option value="">Any status</option>
          {TASK_STATUSES.map((status: TaskStatus) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-priority">
          Priority
        </label>
        <select id="filter-priority" value={filters.priority} onChange={(event) => setParams({ priority: event.target.value })} className={compactSelect}>
          <option value="">Any priority</option>
          {TASK_PRIORITIES.map((priority: TaskPriority) => (
            <option key={priority} value={priority}>
              {PRIORITY_STYLES[priority].label}
            </option>
          ))}
        </select>

        {showAssigneeFilter && (
          <>
            <label className="sr-only" htmlFor="filter-assignee">
              Assignee
            </label>
            <select id="filter-assignee" value={filters.assignee} onChange={(event) => setParams({ assignee: event.target.value })} className={compactSelect}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="none">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.user.name}
                </option>
              ))}
            </select>
          </>
        )}

        {showProjectFilter && (
          <>
            <label className="sr-only" htmlFor="filter-project">
              Project
            </label>
            <select id="filter-project" value={filters.project} onChange={(event) => setParams({ project: event.target.value })} className={compactSelect}>
              <option value="">Any project</option>
              <option value="none">No project</option>
              {projects
                .filter((project) => project.state !== "archived")
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </>
        )}

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" icon={<X size={15} aria-hidden="true" />} onClick={clearFilters}>
            Clear filters ({activeFilterCount})
          </Button>
        )}
      </div>

      <div role="group" aria-label="When it's due" className="relative -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {DUE_CHIPS.map((chip) => {
          const selected = filters.due === chip.value;
          const count = dueCounts?.[chip.value];
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setParams({ due: chip.value })}
              className={cx(
                "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors",
                selected ? "border-forest bg-forest text-on-forest" : "border-line bg-surface text-ink hover:border-forest/40",
                chip.value === "overdue" && !selected && count ? "text-brick" : undefined
              )}
            >
              {chip.label}
              {count !== undefined && (
                <span className={cx("text-[12.5px] font-semibold", selected ? "text-on-forest/80" : "text-muted")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
