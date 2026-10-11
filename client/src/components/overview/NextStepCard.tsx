"use client";

// "Your next step": the single most useful thing to do now, chosen from YOUR real tasks —
// overdue first, then due today, then work already in progress, then the soonest
// deadline. When there's nothing assigned, it says what to do instead.
import Link from "next/link";
import { ArrowRight, CircleCheck, Plus, Sparkles } from "lucide-react";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { compareByUrgency, dueBucketOf } from "@/utils/taskBuckets";
import { describeDue } from "@/utils/taskMeta";
import Button, { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badges";
import type { Task } from "@/types/models";

interface NextStepCardProps {
  myTasks: Task[];
  workspaceTaskCount: number;
  now: Date;
  timezone: string;
}

function pickNextTask(myTasks: Task[], now: Date, timezone: string): { task: Task; reason: string } | null {
  const openTasks = myTasks.filter((task) => task.status !== "completed").sort(compareByUrgency);
  const overdue = openTasks.find((task) => dueBucketOf(task, now, timezone) === "overdue");
  if (overdue) return { task: overdue, reason: `It's overdue. It was due ${describeDue(overdue, now)?.label}.` };
  const dueToday = openTasks.find((task) => dueBucketOf(task, now, timezone) === "today");
  if (dueToday) return { task: dueToday, reason: "It's due today." };
  const inProgress = openTasks.find((task) => task.status === "in_progress");
  if (inProgress) return { task: inProgress, reason: "You've already started it." };
  const inReview = openTasks.find((task) => task.status === "in_review");
  if (inReview) return { task: inReview, reason: "It's waiting in review." };
  const next = openTasks[0];
  if (next) return { task: next, reason: next.dueAt ? `It has the nearest deadline: ${describeDue(next, now)?.label}.` : "It's the newest work assigned to you." };
  return null;
}

export default function NextStepCard({ myTasks, workspaceTaskCount, now, timezone }: NextStepCardProps) {
  const { openTask, openComposer } = useTaskPanels();
  const next = pickNextTask(myTasks, now, timezone);

  return (
    <section aria-labelledby="next-step-heading" className="relative overflow-hidden rounded-[14px] bg-forest p-6 text-on-forest shadow-md sm:p-8">
      {/* Decorative path echoing the brand mark. */}
      <svg aria-hidden="true" viewBox="0 0 400 200" className="pointer-events-none absolute -right-10 -top-6 hidden h-[220px] w-[440px] opacity-25 sm:block">
        <path d="M10 180 C 120 180, 140 60, 240 70 S 360 20, 390 16" fill="none" stroke="var(--lime)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 10" />
        <circle cx="390" cy="16" r="9" fill="var(--harvest)" />
      </svg>

      <p className="relative flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-lime">
        <Sparkles size={15} aria-hidden="true" />
        Your next step
      </p>

      {next ? (
        <div className="relative mt-3">
          <h2 id="next-step-heading" className="font-display text-[26px] font-semibold leading-tight sm:text-[30px]">
            {next.task.title}
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-on-forest/80">
            {next.reason}
            {next.task.project ? ` In ${next.task.project.name}.` : ""}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-surface p-0.5">
              <StatusBadge status={next.task.status} />
            </span>
            <Button variant="lime" onClick={() => openTask(next.task.id)} icon={<ArrowRight size={17} aria-hidden="true" />}>
              Open task
            </Button>
            <Link href="/tasks?due=open" className="rounded px-1 text-[15px] font-medium text-lime underline-offset-4 hover:underline">
              See all your open work
            </Link>
          </div>
        </div>
      ) : workspaceTaskCount === 0 ? (
        <div className="relative mt-3">
          <h2 id="next-step-heading" className="font-display text-[26px] font-semibold leading-tight sm:text-[30px]">
            Write down the first small step.
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-on-forest/80">
            This workspace has no tasks yet. A title is all you need. Details, people and dates can come later.
          </p>
          <div className="mt-5">
            <Button variant="lime" onClick={() => openComposer()} icon={<Plus size={17} aria-hidden="true" />}>
              Add your first task
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative mt-3">
          <h2 id="next-step-heading" className="flex items-center gap-2 font-display text-[26px] font-semibold leading-tight sm:text-[30px]">
            <CircleCheck size={28} aria-hidden="true" className="text-lime" />
            You&apos;re clear for now.
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-on-forest/80">
            Nothing open is assigned to you. Pick up something nobody owns yet, or add the next task yourself.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/tasks?scope=all&assignee=none&due=open" variant="lime">
              See unassigned work
            </ButtonLink>
            <Button variant="ghost" className="text-on-forest hover:bg-white/10" onClick={() => openComposer()} icon={<Plus size={17} aria-hidden="true" />}>
              New task
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
