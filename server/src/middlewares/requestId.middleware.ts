import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// ─── Request IDs (Technical Design: "propagate correlation IDs") ─────────────────────
// Every request gets an id — the caller's X-Request-Id if it sent a sane one (a proxy or
// the client), otherwise a fresh UUID. It's echoed in the response header, written into
// every log line about the request, and returned with 500 errors, so "I got an error" can
// be matched to the exact log entry.

declare module "express-serve-static-core" {
    interface Request {
        id: string;
    }
}

// Accept only short, plain ids from outside — never let a header inject text into logs.
const SAFE_INCOMING_ID = /^[A-Za-z0-9._-]{8,100}$/;

export default function assignRequestId(req: Request, res: Response, next: NextFunction) {
    const incoming = req.get("x-request-id");
    req.id = incoming && SAFE_INCOMING_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", req.id);
    next();
}

// ─── Redaction for logs ─────────────────────
// NOTE: URLs can carry secrets — invitation tokens in /api/invitations/preview/:token, and
// ?token= / ?code= on verification, reset and OAuth hand-off links. Logs must never hold
// them (Technical Design: "prevent reset tokens entering operational output").
const SECRET_PATH_SEGMENTS = [/(\/api\/invitations\/preview\/)[^/?#]+/i, /(\/verify-email\/)[^/?#]+/i, /(\/reset-password\/)[^/?#]+/i];
const SECRET_QUERY_KEYS = /([?&](?:token|code|secret|password)=)[^&#]*/gi;

export const redactUrl = (url: string): string =>
    SECRET_PATH_SEGMENTS.reduce((redacted, pattern) => redacted.replace(pattern, "$1[redacted]"), url).replace(SECRET_QUERY_KEYS, "$1[redacted]");
