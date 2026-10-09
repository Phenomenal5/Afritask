import { rateLimit } from "express-rate-limit";

// ─── Rate limits for sensitive auth endpoints (per client IP, in-memory) ─────────────────────
// NOTE: these are FACTORIES — call one per route. A single shared limiter instance keeps one
// counter across every route it's mounted on, so two verify-link clicks would eat into the
// login budget. Each route gets its own budget instead.
// NOTE: in-memory counters are per process — fine for one instance. If the API is ever
// scaled horizontally, move these to a shared store (Redis is already available).
// NOTE: correct client IPs depend on `trust proxy` (TRUST_PROXY_HOPS) in server.ts.

const limitReachedResponse = (message: string) => ({ status: "fail", message });

// Password guessing, token probing, account takeover attempts: 10 per 15 minutes.
export const credentialLimiter = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: limitReachedResponse("Too many attempts. Please wait 15 minutes and try again."),
});

// Anything that sends an email — stops inbox flooding: 5 per 15 minutes.
export const emailActionLimiter = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: limitReachedResponse("Too many requests. Please wait 15 minutes and try again."),
});
