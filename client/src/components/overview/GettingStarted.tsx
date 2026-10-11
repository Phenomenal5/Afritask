"use client";

// First-use checklist. Every tick comes from real data (a task exists, a project exists,
// someone else has joined) — nothing is ticked just for visiting. It can be hidden, and it
// disappears on its own once everything is done.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { cx } from "@/lib/cx";

interface GettingStartedProps {
  workspaceId: string;
  hasTask: boolean;
  hasProject: boolean;
  hasTeammate: boolean;
  isManager: boolean;
}

const dismissKey = (workspaceId: string) => `afritask_getting_started_hidden:${workspaceId}`;

export default function GettingStarted({ workspaceId, hasTask, hasProject, hasTeammate, isManager }: GettingStartedProps) {
  const { openComposer } = useTaskPanels();
  // Hidden until we've read the saved preference, so it never flashes in then out.
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(dismissKey(workspaceId)) === "1");
    } catch {
      setHidden(false);
    }
  }, [workspaceId]);

  const steps = [
    { done: true, title: "Create a workspace", body: "Done. This is your workspace.", action: null },
    {
      done: hasTask,
      title: "Add a task",
      body: "One clear next step. Only the title is required.",
      action: (
        <button type="button" onClick={() => openComposer()} className="cursor-pointer font-semibold text-forest underline-offset-4 hover:underline">
          Add a task
        </button>
      ),
    },
    {
      done: hasProject,
      title: "Group work into a project (optional)",
      body: isManager ? "Useful once you have related tasks." : "An Owner or Admin can create projects.",
      action: isManager ? (
        <Link href="/projects?new=1" className="font-semibold text-forest underline-offset-4 hover:underline">
          Create a project
        </Link>
      ) : null,
    },
    {
      done: hasTeammate,
      title: "Bring someone along (optional)",
      body: isManager ? "Invite by email. They join when they accept." : "Owners and Admins can invite people.",
      action: isManager ? (
        <Link href="/people" className="font-semibold text-forest underline-offset-4 hover:underline">
          Invite people
        </Link>
      ) : null,
    },
  ];

  const allDone = steps.every((step) => step.done);
  if (hidden || allDone) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(dismissKey(workspaceId), "1");
    } catch {
      // Hidden for this visit only.
    }
  };

  return (
    <section aria-labelledby="getting-started-heading" className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="getting-started-heading" className="text-[17px] font-semibold text-ink">
            Getting started
          </h2>
          <p className="mt-0.5 text-[14px] text-muted">
            {steps.filter((step) => step.done).length} of {steps.length} done. The optional steps can wait.
          </p>
        </div>
        <button type="button" onClick={hide} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 text-[14px] text-muted hover:bg-surface-muted hover:text-ink">
          <X size={16} aria-hidden="true" />
          Hide
        </button>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className={cx("flex gap-3 rounded-[12px] border p-3.5", step.done ? "border-line-soft bg-surface-muted" : "border-line")}>
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                step.done ? "bg-done text-white" : "border-2 border-line text-muted"
              )}
            >
              {step.done ? <Check size={15} strokeWidth={3} /> : index + 1}
            </span>
            <div className="min-w-0 text-[14.5px]">
              <p className={cx("font-semibold", step.done ? "text-muted" : "text-ink")}>
                {step.title}
                <span className="sr-only">{step.done ? " (done)" : " (not done yet)"}</span>
              </p>
              <p className="mt-0.5 text-muted">{step.body}</p>
              {!step.done && step.action && <div className="mt-1.5">{step.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
