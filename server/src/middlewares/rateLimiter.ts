import { rateLimit } from "express-rate-limit";

// ─── Rate limits for sensitive auth endpoints (per client IP, in-memory) ─────────────────────
// NOTE: these are FACTORIES — call one per route. A single shared limiter instance keeps one
// counter across every route it's mounted on, so two verify-link clicks would eat into the
// login budget. Each route gets its own budget instead.
// NOTE: in-memory counters are per process — fine for one instance. If the API is ever
// scaled horizontally, move these to a shared store (Redis is already available).
// NOTE: correct client IPs depend on `trust proxy` (TRUST_PROXY_HOPS) in server.ts.

const limitReachedResponse = (message: string) => ({ status: "fail", message });

// The test suite makes hundreds of requests from one IP; limits would turn unrelated tests
// into 429s. They're skipped under NODE_ENV=test unless RATE_LIMITS_IN_TESTS=on, which the
// rate-limit tests set. Checked per request, so a test can flip it at runtime.
const skipInTests = () => process.env.NODE_ENV === "test" && process.env.RATE_LIMITS_IN_TESTS !== "on";

// Password guessing, token probing, account takeover attempts: 10 per 15 minutes.
export const credentialLimiter = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipInTests,
    message: limitReachedResponse("Too many attempts. Please wait 15 minutes and try again."),
});

// Anything that sends an email — stops inbox flooding: 5 per 15 minutes.
export const emailActionLimiter = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipInTests,
    message: limitReachedResponse("Too many requests. Please wait 15 minutes and try again."),
});

// Sending invitations: an Owner onboarding a whole team needs more headroom than a
// signup form, but the cap still stops the endpoint being used to spam inboxes.
export const invitationLimiter = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipInTests,
    message: limitReachedResponse("Too many invitations sent. Please wait 15 minutes and try again."),
});

// The public Contact page: no account behind it, so tighter than signed-in support.
export const contactLimiter = () => rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipInTests,
    message: limitReachedResponse("You've sent several messages in the last hour. We'll answer those first; try again later if you need to."),
});

// Opening support tickets: plenty for a real problem, not enough to flood the inbox.
export const supportTicketLimiter = () => rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipInTests,
    message: limitReachedResponse("You've opened several requests in the last hour. Add to an existing one, or try again later."),
});
