// ─── Test environment (runs before every test file, before any app import) ─────────────────────
// config/env.ts validates process.env the moment it's imported, so everything it needs is
// set here first. No real external service is used: email goes to the in-memory
// testMailbox, Redis isn't touched (only server.ts starts jobs), Google is unconfigured.
import { config as loadDotenv } from "dotenv";
import { assertSafeTestDatabase } from "./testDatabase.js";

loadDotenv({ quiet: true });

const testDatabaseUrl = assertSafeTestDatabase();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_DATABASE_URL = testDatabaseUrl;
process.env.REDIS_URL = "redis://127.0.0.1:6399";
process.env.BREVO_API_KEY = "test-brevo-key-never-used";
process.env.EMAIL_FROM_ADDRESS = "tests@afritask.invalid";
process.env.CLIENT_URL = "http://client.test";
process.env.API_DOCS = "on";
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.RATE_LIMITS_IN_TESTS;
// The admin bootstrap is tested directly; never let a developer's .env values leak in.
delete process.env.SUPERADMIN_EMAIL;
delete process.env.SUPERADMIN_PASSWORD;
delete process.env.SUPERADMIN_NAME;
// Fixed, test-only signing key for access tokens.
process.env.ACCESS_TOKEN_SECRET = "test-access-token-secret-0123456789abcdef";
// A fixed, test-only VAPID pair (web push). Pushes are captured by testPushOutbox, never sent.
process.env.VAPID_PUBLIC_KEY = "BDTFKdMGEFpjeg3Nur1H-Z0KAHR3QtFio_iYbvd0ImTCAThLqNK5C2zfHoyCCbSTrppya4YQn6QAnDILjJc3guI";
process.env.VAPID_PRIVATE_KEY = "YBvHLb3m94oA8RPqqkuFHBET7XRCLEgyLhFx7LKkm_k";
// A fixed, test-only key for operator MFA secrets (never a real environment's key).
process.env.OPERATOR_MFA_KEY = "0".repeat(64);
