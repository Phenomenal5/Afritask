import type { Prisma } from "../generated/prisma/client.js";

// ─── Activity history (SRS SR09) ─────────────────────
// One append-only row per meaningful change. Callers pass their transaction client so the
// entry commits (or rolls back) together with the change itself.

export type ActivityEntityType = "task" | "project" | "membership" | "workspace";

export type ActivityAction =
    | "task.created"
    | "task.updated"
    | "task.deleted"
    | "subtask.created"
    | "project.created"
    | "project.updated"
    | "project.archived"
    | "project.restored"
    | "member.joined"
    | "member.role_changed"
    | "member.removed"
    | "member.left"
    | "ownership.transferred"
    | "workspace.created"
    | "workspace.renamed";

// { field: { from, to } } — only fields that actually changed.
export type ActivityChanges = Record<string, { from: unknown; to: unknown }>;

export interface ActivityEntry {
    workspaceId: string;
    actorId: string;
    entityType: ActivityEntityType;
    entityId: string;
    projectId?: string | null;
    action: ActivityAction;
    changes?: ActivityChanges;
    summary?: string;
}

// Long text (task/project descriptions) is clipped in history: the before/after stays
// readable and a 20,000-character description can't bloat every entry.
const MAX_STORED_TEXT_LENGTH = 500;
const clipText = (value: unknown) =>
    typeof value === "string" && value.length > MAX_STORED_TEXT_LENGTH ? `${value.slice(0, MAX_STORED_TEXT_LENGTH)}…` : value;

// Compare before/after for the given fields. Dates compare by instant, arrays by contents.
export function diffFields<Row extends Record<string, unknown>>(
    before: Row,
    after: Partial<Row>,
    fields: (keyof Row & string)[]
): ActivityChanges {
    const changes: ActivityChanges = {};
    for (const field of fields) {
        if (!(field in after) || after[field] === undefined) continue;
        const toComparable = (value: unknown) => (value instanceof Date ? value.toISOString() : JSON.stringify(value ?? null));
        if (toComparable(before[field]) === toComparable(after[field])) continue;
        changes[field] = { from: clipText(before[field] ?? null), to: clipText(after[field] ?? null) };
    }
    return changes;
}

export const recordActivity = (db: Prisma.TransactionClient, entry: ActivityEntry) =>
    db.activity.create({
        data: {
            ...entry,
            projectId: entry.projectId ?? null,
            summary: entry.summary ?? "",
            // NOTE: an empty diff is stored as NULL, not {}, so "no field changes" is one shape.
            changes: entry.changes && Object.keys(entry.changes).length > 0 ? (entry.changes as Prisma.InputJsonValue) : undefined,
        },
    });
