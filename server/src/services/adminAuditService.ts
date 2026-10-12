import type { Request } from "express";
import type { Prisma } from "../generated/prisma/client.js";

// ─── Operator audit trail (SRS SR18) ─────────────────────
// One append-only row per operator action or access event. Pass the transaction client so
// the entry commits with the change it records. Never put task/comment content in metadata.

export type AdminAuditAction =
    | "operator.granted"
    | "operator.revoked"
    | "operator.signed_in"
    | "operator.mfa_enrolled"
    | "operator.signed_out"
    | "account.created"
    | "account.updated"
    | "account.setup_link_sent"
    | "account.suspended"
    | "account.restored"
    | "workspace.suspended"
    | "workspace.restored"
    | "delivery.retried"
    | "newsletter.drafted"
    | "newsletter.edited"
    | "newsletter.published"
    | "newsletter.deleted"
    | "support.replied"
    | "support.status_changed";

export interface AdminAuditInput {
    actorId: string | null;
    action: AdminAuditAction;
    targetType?: "user" | "workspace" | "delivery" | "operator" | "newsletter_post" | "support_ticket";
    targetId?: string;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string | null;
}

// Accepts a transaction client or the global client (for standalone entries like sign-out).
export const recordAdminAudit = (db: Pick<Prisma.TransactionClient, "adminAuditEntry">, entry: AdminAuditInput) =>
    db.adminAuditEntry.create({
        data: { ...entry, reason: entry.reason ?? "", ipAddress: entry.ipAddress ?? null },
    });

// The caller's IP as Express resolved it (honours TRUST_PROXY_HOPS in production).
export const requestIp = (req: Request) => req.ip ?? null;
