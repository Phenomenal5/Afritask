"use client";

// The monthly summary itself — the same view on your own page and on a shared link.
// Numbers first, in plain words, then the pictures:
// - this month's finish: a single stacked bar of states (on time / on time after an
//   extension / late), in the fixed status colours, always with an icon and a label;
// - the last six months as two small charts on one shared unit (tasks), never a dual axis:
//   finished on time vs late (status colours), and extensions (one series).
// A table view carries the same numbers for screen readers and anyone who prefers it.
// NOTE: colours follow the data-viz method — status hues are fixed (never themed), the one
// series colour is stepped per theme, and none of them is ever the only cue.
import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { MonthSummary, TrendPoint } from "@/types/models";

// Fixed status scale (same in light and dark).
const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" } as const;
// Categorical slot 1, stepped per theme.
const SERIES_ONE = { light: "#2a78d6", dark: "#3987e5" } as const;

const percent = (rate: number | null) => (rate === null ? "No data" : `${Math.round(rate * 100)}%`);

export const monthLabel = (month: string, style: "long" | "short" = "long") => {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(undefined, { month: style, year: style === "long" ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
};

function Figure({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-4 py-3.5">
      <dt className="text-[13px] font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</dd>
      <dd className="mt-1.5 text-[13px] leading-snug text-muted">{detail}</dd>
    </div>
  );
}

// ─── This month: how deadline work finished ─────────────────────
function FinishBreakdown({ summary }: { summary: MonthSummary }) {
  const states = [
    { key: "clean", label: "On time, never extended", count: summary.metWithoutExtending, color: STATUS.good, icon: CircleCheck },
    { key: "extended", label: "On time after an extension", count: summary.onTimeAfterExtending, color: STATUS.warning, icon: Clock3 },
    { key: "late", label: "Late", count: summary.completedLate, color: STATUS.critical, icon: CircleAlert },
  ];
  const withDeadline = states.reduce((total, state) => total + state.count, 0);

  return (
    <section aria-labelledby="finish-heading" className="rounded-[14px] border border-line bg-surface p-4">
      <h3 id="finish-heading" className="text-[15px] font-semibold text-ink">
        How this month&apos;s deadlines went
      </h3>
      {withDeadline === 0 ? (
        <p className="mt-3 text-[14px] text-muted">No tasks with a deadline were completed this month.</p>
      ) : (
        <>
          {/* Decorative: the legend below states every number in words. */}
          <div aria-hidden="true" className="mt-4 flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]">
            {states
              .filter((state) => state.count > 0)
              .map((state) => (
                <div key={state.key} style={{ width: `${(state.count / withDeadline) * 100}%`, background: state.color }} className="h-full" title={`${state.label}: ${state.count}`} />
              ))}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {states.map((state) => {
              const Icon = state.icon;
              return (
                <li key={state.key} className="flex items-center gap-2 text-[14px] text-ink">
                  <Icon size={16} aria-hidden="true" style={{ color: state.color }} className="shrink-0" />
                  <span className="flex-1">{state.label}</span>
                  <span className="tabular-nums font-medium">{state.count}</span>
                  <span className="w-11 text-right tabular-nums text-muted">{Math.round((state.count / withDeadline) * 100)}%</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {summary.completedWithoutDeadline > 0 && (
        <p className="mt-3 text-[13px] text-muted">
          Plus {summary.completedWithoutDeadline} completed without a deadline (not counted as on time or late).
        </p>
      )}
    </section>
  );
}

// ─── What they did this month ─────────────────────
// The month's activity in plain counts, the same list a shared link shows.
function ActivityList({ summary }: { summary: MonthSummary }) {
  const rows = [
    { label: "Tasks created", value: summary.tasksCreated },
    { label: "Projects created", value: summary.projectsCreated },
    { label: "Tasks completed", value: summary.completed },
    { label: "Completed before the due date", value: summary.completedOnTime },
    { label: "Completed after the first due date", value: summary.completedAfterOriginalDue, hint: "Extended, or late" },
    { label: "Subtasks completed", value: summary.subtasksCompleted },
    { label: "Deadline extensions", value: summary.extensions },
    { label: "Comments written", value: summary.commentsWritten },
  ];
  return (
    <section aria-labelledby="activity-heading" className="rounded-[14px] border border-line bg-surface p-4">
      <h3 id="activity-heading" className="text-[15px] font-semibold text-ink">
        Activity this month
      </h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3 border-b border-line-soft py-2 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
            <dt className="flex-1 text-[14px] text-ink">
              {row.label}
              {row.hint && <span className="ml-1.5 text-[12.5px] text-muted">({row.hint})</span>}
            </dt>
            <dd className="text-[15px] font-semibold tabular-nums text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ─── The last six months ─────────────────────
function TrendCharts({ trend }: { trend: TrendPoint[] }) {
  const colors = useThemeColors();
  const seriesOne = colors.mode === "dark" ? SERIES_ONE.dark : SERIES_ONE.light;
  const data = trend.map((point) => ({ ...point, label: monthLabel(point.month, "short") }));
  const axisTick = { fontSize: 12, fill: colors["text-muted"] };
  const tooltipStyle = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text, fontSize: 13 };
  const gridProps = { stroke: colors.border, strokeOpacity: 0.7, vertical: false };

  return (
    <section aria-labelledby="trend-heading" className="rounded-[14px] border border-line bg-surface p-4">
      <h3 id="trend-heading" className="text-[15px] font-semibold text-ink">
        Last six months
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2">
        <figure>
          <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="font-medium text-ink">Finished with a deadline</span>
            <span className="inline-flex items-center gap-1">
              <CircleCheck size={13} aria-hidden="true" style={{ color: STATUS.good }} /> On time
            </span>
            <span className="inline-flex items-center gap-1">
              <CircleAlert size={13} aria-hidden="true" style={{ color: STATUS.critical }} /> Late
            </span>
          </figcaption>
          <div className="mt-2 h-[200px]" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: colors.border, opacity: 0.35 }} />
                {/* 2px surface gap between stacked segments; rounded ends only at the top. */}
                <Bar dataKey="completedOnTime" name="On time" stackId="finished" fill={STATUS.good} stroke={colors.surface} strokeWidth={2} maxBarSize={28} />
                <Bar dataKey="completedLate" name="Late" stackId="finished" fill={STATUS.critical} stroke={colors.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <figure>
          <figcaption className="text-[13px] font-medium text-ink">Extensions</figcaption>
          <div className="mt-2 h-[200px]" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: colors.border }} />
                <Line dataKey="extensions" name="Extensions" type="monotone" stroke={seriesOne} strokeWidth={2} dot={{ r: 4, fill: seriesOne, stroke: colors.surface, strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </div>

      <details className="mt-3 text-[13.5px]">
        <summary className="cursor-pointer font-medium text-forest">View as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Month</th>
                <th className="py-1.5 pr-3 font-medium">On time</th>
                <th className="py-1.5 pr-3 font-medium">Late</th>
                <th className="py-1.5 pr-3 font-medium">Extensions</th>
                <th className="py-1.5 font-medium">Planning days</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {trend.map((point) => (
                <tr key={point.month} className="border-t border-line-soft">
                  <td className="py-1.5 pr-3">{monthLabel(point.month)}</td>
                  <td className="py-1.5 pr-3">{point.completedOnTime}</td>
                  <td className="py-1.5 pr-3">{point.completedLate}</td>
                  <td className="py-1.5 pr-3">{point.extensions}</td>
                  <td className="py-1.5">{point.planningDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// `scopeNote` says whose work and where: "across your workspaces", "in Team Space"...
export default function PerformanceView({ summary, trend, scopeNote = "across your workspaces" }: { summary: MonthSummary; trend: TrendPoint[]; scopeNote?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Figure label="Completed" value={summary.completed} detail={`${summary.completedOnTime} on time · ${summary.completedLate} late · ${summary.completedWithoutDeadline} without a deadline`} />
        <Figure label="On-time rate" value={percent(summary.onTimeRate)} detail="Of tasks with a deadline, finished by it" />
        <Figure label="Met without extending" value={summary.metWithoutExtending} detail="On time, and the deadline never moved" />
        <Figure label="Extensions" value={summary.extensions} detail="Times one of your deadlines was pushed later" />
        <Figure label="Planning days" value={`${summary.planningDays} / ${summary.daysInMonth}`} detail="Days you created or updated tasks" />
        <Figure
          label="Planned ahead"
          value={percent(summary.plannedAheadRate)}
          detail={summary.tasksCreated ? `${summary.plannedAhead} of ${summary.tasksCreated} new tasks got a due or start date` : "No tasks created this month"}
        />
      </dl>

      <ActivityList summary={summary} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <FinishBreakdown summary={summary} />
        <TrendCharts trend={trend} />
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Counts tasks assigned to them, or created by them with nobody assigned, {scopeNote}, in {summary.timezone} time. No task titles or details are included.
      </p>
    </div>
  );
}
