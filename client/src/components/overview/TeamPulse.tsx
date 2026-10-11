"use client";

// Who's on what right now: each teammate with the work they've started (in progress or in
// review). People are what make a workspace feel inhabited — shown only when you're not
// working alone.
import { useTaskPanels } from "@/context/TaskPanelContext";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badges";
import type { Task } from "@/types/models";

const PEOPLE_LIMIT = 6;
const TASKS_PER_PERSON = 2;

interface PersonAtWork {
  userId: string;
  name: string;
  photo: string | null | undefined;
  tasks: Task[];
}

export function peopleAtWork(tasks: Task[]): PersonAtWork[] {
  const byPerson = new Map<string, PersonAtWork>();
  for (const task of tasks) {
    if ((task.status !== "in_progress" && task.status !== "in_review") || !task.assignee) continue;
    const { user } = task.assignee;
    const person = byPerson.get(user.id) ?? { userId: user.id, name: user.name, photo: user.photo, tasks: [] };
    person.tasks.push(task);
    byPerson.set(user.id, person);
  }
  // Most recently touched work first, so the list reads like "what's happening now".
  const latestUpdate = (person: PersonAtWork) => Math.max(...person.tasks.map((task) => new Date(task.updatedAt).getTime()));
  return [...byPerson.values()].sort((first, second) => latestUpdate(second) - latestUpdate(first));
}

export default function TeamPulse({ tasks, viewerId }: { tasks: Task[]; viewerId: string | undefined }) {
  const { openTask } = useTaskPanels();
  const people = peopleAtWork(tasks).slice(0, PEOPLE_LIMIT);

  return (
    <section aria-labelledby="pulse-heading" className="rounded-[14px] border border-line bg-surface p-5">
      <h2 id="pulse-heading" className="text-[17px] font-semibold text-ink">
        Who&apos;s on what
      </h2>
      {people.length === 0 ? (
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">Nobody has work in progress right now. When someone starts a task, it shows here.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3.5">
          {people.map((person) => (
            <li key={person.userId} className="flex items-start gap-3">
              <Avatar user={person} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{person.userId === viewerId ? "You" : person.name}</p>
                <ul className="mt-0.5 flex flex-col gap-1">
                  {person.tasks.slice(0, TASKS_PER_PERSON).map((task) => (
                    <li key={task.id} className="flex items-center gap-2">
                      <button type="button" onClick={() => openTask(task.id)} className="min-w-0 cursor-pointer truncate rounded text-left text-[14px] text-muted hover:text-ink hover:underline">
                        {task.title}
                      </button>
                      {task.status === "in_review" && <StatusBadge status="in_review" />}
                    </li>
                  ))}
                  {person.tasks.length > TASKS_PER_PERSON && <li className="text-[12.5px] text-muted">and {person.tasks.length - TASKS_PER_PERSON} more</li>}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
