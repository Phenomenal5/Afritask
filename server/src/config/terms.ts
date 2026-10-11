// ─── Terms of Service / Privacy Policy version ─────────────────────
// Bump this (a date string) whenever the terms change in a way people must agree to again.
// Anyone whose User.termsVersion differs is asked to accept before using the app; the
// client's /terms page shows the same date as "Last updated".
export const CURRENT_TERMS_VERSION = "2026-10-11";

export const TERMS_REQUIRED_MESSAGE = "Please accept the Terms of Service and Privacy Policy to continue.";

export const hasAcceptedCurrentTerms = (user: { termsVersion: string | null }) => user.termsVersion === CURRENT_TERMS_VERSION;
