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
  // Signs access tokens. Changing it signs everyone's access tokens out (they refresh).
  "ACCESS_TOKEN_SECRET",
] as const;

const missingKeys = ALWAYS_REQUIRED.filter((key) => !process.env[key]);
if (missingKeys.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingKeys.join(", ")} — see server/.env.example`
  );
}

// NOTE: a short secret makes HS256 tokens brute-forceable offline — refuse to boot with one.
if ((process.env.ACCESS_TOKEN_SECRET ?? "").length < 32) {
  throw new Error("ACCESS_TOKEN_SECRET must be at least 32 characters — see server/.env.example");
}

// Safe after the check above: every ALWAYS_REQUIRED key is a non-empty string.
const requiredValue = (key: (typeof ALWAYS_REQUIRED)[number]): string => process.env[key] as string;

const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  // 5000 matches the client's NEXT_PUBLIC_API_URL fallback.
  port: Number(process.env.PORT ?? 5000),

  // Pooled URL for the app. Migrations use DIRECT_DATABASE_URL (prisma.config.ts).
  databaseUrl: requiredValue("DATABASE_URL"),
  redisUrl: requiredValue("REDIS_URL"),

  // Access token: short, sent with every request. Refresh token: how long a login lasts.
  accessTokenSecret: requiredValue("ACCESS_TOKEN_SECRET"),
  accessTokenTtlMinutes: Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? 15),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  // Hops of reverse proxy in front of Express in production (e.g. the client's /api
  // rewrite + the host's load balancer). Needed for correct client IPs in rate limiting.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),

  brevoApiKey: requiredValue("BREVO_API_KEY"),
  emailFromName: process.env.EMAIL_FROM_NAME ?? "Afritask",
  emailFromAddress: requiredValue("EMAIL_FROM_ADDRESS"),

  // Web push is optional: without these keys, push is "not configured" (the setting can't
  // be turned on) and everything else — SSE, sound, email — works as usual.
  // Generate a pair with: npx web-push generate-vapid-keys
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  // A contact the push services can reach about abuse: "mailto:..." or an https URL.
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:support@afritask.app",

  // Optional: the first admin console (Platform Superadmin) account, created on boot if it
  // doesn't exist yet (services/bootstrapOperatorService.ts). Remove once it exists.
  superadminEmail: process.env.SUPERADMIN_EMAIL,
  superadminPassword: process.env.SUPERADMIN_PASSWORD,
  superadminName: process.env.SUPERADMIN_NAME,

  // Google OAuth is optional: routes answer 500 "not configured" when these are missing.
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "/api/v1/auth/google/callback",

  // Swagger UI at /api/docs. On by default except in production (set API_DOCS=on there
  // to expose it, or API_DOCS=off anywhere to hide it).
  apiDocsEnabled: process.env.API_DOCS
    ? process.env.API_DOCS === "on"
    : process.env.NODE_ENV !== "production",
};

export default env;
