// ─── Environment config, validated once at boot ─────────────────────
// Every setting comes from the environment (.env locally, the host's settings in
// production), and a missing or malformed one stops the boot with a message naming it.
// NOTE: addresses, ports and lifetimes have NO built-in fallback on purpose. A default
// quietly used in the wrong place (e.g. a relative Google callback built from a proxied
// request) caused "redirect_uri_mismatch" and similar surprises that were hard to trace.
// Keep .env.example in sync with this file.

const ALWAYS_REQUIRED = [
  "PORT",
  "DATABASE_URL",
  "REDIS_URL",
  "BREVO_API_KEY",
  "EMAIL_FROM_ADDRESS",
  // The customer app's address: CORS, OAuth redirects and every link in emails.
  "CLIENT_URL",
  // Signs access tokens. Changing it signs everyone's access tokens out (they refresh).
  "ACCESS_TOKEN_SECRET",
  "ACCESS_TOKEN_TTL_MINUTES",
  "REFRESH_TOKEN_TTL_DAYS",
] as const;

const isSet = (key: string) => Boolean(process.env[key]?.trim());

// Optional features need ALL their settings once ANY of them is set: half a Google setup
// fails at sign-in time, far from the cause.
const FEATURE_SETTINGS = {
  "Google sign-in": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL"],
  "Web push": ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
} as const;

const missingKeys: string[] = ALWAYS_REQUIRED.filter((key) => !isSet(key));
for (const keys of Object.values(FEATURE_SETTINGS)) {
  if (keys.some(isSet)) missingKeys.push(...keys.filter((key) => !isSet(key)));
}
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

// NOTE: a typo here ("7d", "0") would quietly give sessions a broken lifetime, so a value
// that isn't a positive number stops the boot instead.
const positiveNumber = (key: (typeof ALWAYS_REQUIRED)[number]): number => {
  const raw = requiredValue(key);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive number (got "${raw}") — see server/.env.example`);
  return value;
};

// A full http(s) address, without a trailing slash ("https://afritask.example.com").
const absoluteUrl = (key: string): string => {
  const raw = (process.env[key] ?? "").trim().replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return raw;
  } catch {
    // Reported below.
  }
  throw new Error(`${key} must be a full address starting with http:// or https:// (got "${raw}") — see server/.env.example`);
};

// The Google callback must be the exact address registered in Google Cloud Console AND
// a path this server answers. Checked here so a mismatch shows at boot, not at sign-in.
const GOOGLE_CALLBACK_PATH = "/api/v1/auth/google/callback";
const googleCallbackUrl = (): string | undefined => {
  if (!isSet("GOOGLE_CALLBACK_URL")) return undefined;
  const callbackUrl = absoluteUrl("GOOGLE_CALLBACK_URL");
  const { pathname, protocol } = new URL(callbackUrl);
  if (pathname !== GOOGLE_CALLBACK_PATH) {
    throw new Error(`GOOGLE_CALLBACK_URL must end with ${GOOGLE_CALLBACK_PATH} (got "${callbackUrl}")`);
  }
  if (process.env.NODE_ENV === "production" && protocol !== "https:") {
    throw new Error(`GOOGLE_CALLBACK_URL must use https in production (got "${callbackUrl}")`);
  }
  return callbackUrl;
};

const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  port: positiveNumber("PORT"),
  clientUrl: absoluteUrl("CLIENT_URL"),

  // Pooled URL for the app. Migrations use DIRECT_DATABASE_URL (prisma.config.ts).
  databaseUrl: requiredValue("DATABASE_URL"),
  redisUrl: requiredValue("REDIS_URL"),

  // Access token: short, sent with every request. Refresh token: how long a login lasts.
  accessTokenSecret: requiredValue("ACCESS_TOKEN_SECRET"),
  accessTokenTtlMinutes: positiveNumber("ACCESS_TOKEN_TTL_MINUTES"),
  refreshTokenTtlDays: positiveNumber("REFRESH_TOKEN_TTL_DAYS"),
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
  vapidSubject: process.env.VAPID_SUBJECT,

  // The admin console's own address (e.g. https://admin.example.com). Browsers there may
  // call the API directly, so it's allowed by CORS next to CLIENT_URL. Leave unset when
  // the console reaches the API through a same-origin /api proxy (as in local dev).
  adminUrl: process.env.ADMIN_URL?.replace(/\/$/, "") || undefined,

  // Optional: the first admin console (Platform Superadmin) account, created on boot if it
  // doesn't exist yet (services/bootstrapOperatorService.ts). Remove once it exists.
  superadminEmail: process.env.SUPERADMIN_EMAIL,
  superadminPassword: process.env.SUPERADMIN_PASSWORD,
  superadminName: process.env.SUPERADMIN_NAME,

  // Google sign-in is optional: without these, the Google button answers "not available".
  // When set, all three are required (checked above).
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: googleCallbackUrl(),

  // Swagger UI at /api/docs. On by default except in production (set API_DOCS=on there
  // to expose it, or API_DOCS=off anywhere to hide it).
  apiDocsEnabled: process.env.API_DOCS
    ? process.env.API_DOCS === "on"
    : process.env.NODE_ENV !== "production",
};

export default env;
