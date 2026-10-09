// ─── Environment config, validated once at boot ─────────────────────
// Required values (and anything other modules need typed) are read from here,
// so a missing value crashes the boot loudly rather than 500-ing a request later.
// Optional values with a local default (token lifetimes, email logo, CLIENT_URL)
// still live next to the code that uses them.
// Keep .env.example in sync with this file.

const ALWAYS_REQUIRED = [
  "DATABASE_URL",
  "REDIS_URL",
  "BREVO_API_KEY",
  "EMAIL_FROM_ADDRESS",
] as const;

const missingKeys = ALWAYS_REQUIRED.filter((key) => !process.env[key]);
if (missingKeys.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingKeys.join(", ")} — see server/.env.example`
  );
}

// Safe after the check above: every ALWAYS_REQUIRED key is a non-empty string.
const requiredValue = (key: (typeof ALWAYS_REQUIRED)[number]): string => process.env[key] as string;

const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  // 5000 matches the client's NEXT_PUBLIC_API_URL fallback.
  port: Number(process.env.PORT ?? 5000),

  // Pooled URL for the app. Migrations use DIRECT_DATABASE_URL (prisma.config.ts).
  databaseUrl: requiredValue("DATABASE_URL"),
  redisUrl: requiredValue("REDIS_URL"),

  // How long a login lasts before the session cookie expires.
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  // Hops of reverse proxy in front of Express in production (e.g. the client's /api
  // rewrite + the host's load balancer). Needed for correct client IPs in rate limiting.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),

  brevoApiKey: requiredValue("BREVO_API_KEY"),
  emailFromName: process.env.EMAIL_FROM_NAME ?? "AfriTask",
  emailFromAddress: requiredValue("EMAIL_FROM_ADDRESS"),

  // Google OAuth is optional: routes answer 500 "not configured" when these are missing.
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "/api/auth/google/callback",
};

export default env;
