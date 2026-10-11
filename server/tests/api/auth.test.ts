// API: /api/auth — signup, verification, login/logout, sessions, recovery, Google hand-off.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { issueAccountToken } from "../../src/services/accountTokenService.js";
import { anonymous, createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { DEFAULT_PASSWORD, createUser, signIn, uniqueEmail } from "../helpers/factories.js";
import { RESET_LINK, VERIFY_LINK, clearMailbox, emailsTo, lastEmailTo, testMailbox, tokenFromEmail } from "../helpers/mailbox.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const signupBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Ada Lovelace",
    email: uniqueEmail("signup"),
    password: "analytical-engine",
    timezone: "Africa/Lagos",
    acceptTerms: true,
    ...overrides,
});

const cookieOf = (response: { headers: Record<string, unknown> }, name: "afritask_access" | "afritask_refresh") => {
    const cookies = (response.headers["set-cookie"] ?? []) as string[];
    return cookies.find((cookie) => cookie.startsWith(`${name}=`));
};
const accessCookieOf = (response: { headers: Record<string, unknown> }) => cookieOf(response, "afritask_access");
const refreshCookieOf = (response: { headers: Record<string, unknown> }) => cookieOf(response, "afritask_refresh");
const cookieValue = (cookie: string | undefined) => cookie?.split(";")[0]!.split("=")[1] ?? "";

describe("POST /auth/signup", () => {
    it("creates an unverified account and emails a verification link", async () => {
        const body = signupBody();
        const response = await createClient().post("/auth/signup", body);

        expect(response.status).toBe(201);
        const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email }, omit: { password: false } });
        expect(user.isVerified).toBe(false);
        expect(user.timezone).toBe("Africa/Lagos");
        expect(user.password).not.toBe(body.password);
        expect(lastEmailTo(body.email).subject).toBe("Verify Your Email");
        expect(lastEmailTo(body.email).text).toMatch(VERIFY_LINK);
    });

    it.each([
        [{ name: undefined }, 400, "Please provide all required fields"],
        [{ password: undefined }, 400, "Please provide all required fields"],
        [{ email: "not-an-email" }, 400, "Invalid email address"],
        [{ password: "12345" }, 400, "Password must be at least 6 characters"],
        [{ age: -4 }, 400, "Age must be a positive number"],
        [{ timezone: "Mars/Base" }, 400, "Please provide a valid timezone"],
    ])("rejects %p", async (overrides, status, message) => {
        const response = await createClient().post("/auth/signup", signupBody(overrides));
        expect(response.status).toBe(status);
        expect(response.body.message).toBe(message);
    });

    it("rejects an email that's already registered", async () => {
        const existing = await createUser();
        const response = await createClient().post("/auth/signup", signupBody({ email: existing.email }));
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Email already in use");
    });

    it("rolls the account back if the verification email can't be sent", async () => {
        const body = signupBody();
        testMailbox.failNextSend = true;
        const response = await createClient().post("/auth/signup", body);

        expect(response.status).toBe(502);
        await expect(prisma.user.findUnique({ where: { email: body.email } })).resolves.toBeNull();
        // …so a retry can succeed instead of "Email already in use".
        await expect(createClient().post("/auth/signup", body)).resolves.toMatchObject({ status: 201 });
    });
});

describe("GET /auth/verify-email/:token", () => {
    const signUpAndGetToken = async () => {
        const body = signupBody();
        await createClient().post("/auth/signup", body);
        return { email: body.email, token: tokenFromEmail(body.email, VERIFY_LINK) };
    };

    it("verifies the account and sends the welcome email", async () => {
        const { email, token } = await signUpAndGetToken();
        const response = await anonymous().get(`/api/auth/verify-email/${token}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("Email verified successfully");
        await expect(prisma.user.findUniqueOrThrow({ where: { email } })).resolves.toMatchObject({ isVerified: true });
        expect(emailsTo(email).map((sent) => sent.subject)).toContain("Welcome to AfriTask 🎉");
    });

    it("is idempotent — a repeated link (mail scanner, StrictMode) still answers success, one welcome email", async () => {
        const { email, token } = await signUpAndGetToken();
        await anonymous().get(`/api/auth/verify-email/${token}`);
        const repeat = await anonymous().get(`/api/auth/verify-email/${token}`);

        expect(repeat.status).toBe(200);
        expect(repeat.body.message).toBe("Email already verified");
        expect(emailsTo(email).filter((sent) => sent.subject.startsWith("Welcome"))).toHaveLength(1);
    });

    it("rejects an unknown token", async () => {
        const response = await anonymous().get("/api/auth/verify-email/0123456789abcdef");
        expect(response.status).toBe(400);
    });

    it("on an expired link, sends a fresh one", async () => {
        const { email, token } = await signUpAndGetToken();
        await prisma.accountToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
        const response = await anonymous().get(`/api/auth/verify-email/${token}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("A new verification email has been sent");
        expect(tokenFromEmail(email, VERIFY_LINK)).not.toBe(token);
    });

    it("an older link replaced by a resend no longer works", async () => {
        const { email, token: firstToken } = await signUpAndGetToken();
        // Logging in while unverified re-sends (and replaces) the link.
        await createClient().post("/auth/login", { email, password: "analytical-engine" });
        const response = await anonymous().get(`/api/auth/verify-email/${firstToken}`);
        expect(response.status).toBe(400);
    });
});

describe("POST /auth/login", () => {
    it("sets httpOnly access (15 min) and refresh (30 days) cookies and returns the user without secrets", async () => {
        const user = await createUser();
        const response = await createClient().post("/auth/login", { email: user.email, password: DEFAULT_PASSWORD });

        expect(response.status).toBe(200);
        const accessCookie = accessCookieOf(response);
        const refreshCookie = refreshCookieOf(response);
        expect(accessCookie).toMatch(/HttpOnly/i);
        expect(accessCookie).toMatch(/SameSite=Lax/i);
        expect(accessCookie).toMatch(/Path=\/;/);
        expect(accessCookie).toMatch(/Max-Age=900/);
        expect(refreshCookie).toMatch(/HttpOnly/i);
        expect(refreshCookie).toMatch(/Path=\/api\/auth/);
        expect(response.body.token).toBeUndefined();
        expect(response.body.user.email).toBe(user.email);
        expect(response.body.user).not.toHaveProperty("password");
        expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    });

    it("gives the same answer for a wrong password and an unknown email", async () => {
        const user = await createUser();
        const wrongPassword = await createClient().post("/auth/login", { email: user.email, password: "nope-nope" });
        const unknownEmail = await createClient().post("/auth/login", { email: uniqueEmail(), password: "nope-nope" });

        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.status).toBe(401);
        expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
        expect(accessCookieOf(wrongPassword)).toBeUndefined();
        expect(refreshCookieOf(wrongPassword)).toBeUndefined();
    });

    it("blocks an unverified account and re-sends the verification email", async () => {
        const user = await createUser({ verified: false });
        const response = await createClient().post("/auth/login", { email: user.email, password: DEFAULT_PASSWORD });

        expect(response.status).toBe(401);
        expect(response.body.message).toContain("verify your email");
        expect(lastEmailTo(user.email).text).toMatch(VERIFY_LINK);
    });

    it("rejects a Google-only account's password login without crashing", async () => {
        const googleUser = await prisma.user.create({ data: { name: "G", email: uniqueEmail("google"), provider: "google", providerId: "g-1", isVerified: true } });
        const response = await createClient().post("/auth/login", { email: googleUser.email, password: "anything" });
        expect(response.status).toBe(401);
    });

    it("requires email and password", async () => {
        const response = await createClient().post("/auth/login", { email: "" });
        expect(response.status).toBe(400);
    });
});

describe("GET /auth/me and POST /auth/logout", () => {
    it("me answers 401 without a session and the user with one", async () => {
        await expect(anonymous().get("/api/auth/me")).resolves.toMatchObject({ status: 401 });
        const user = await createUser();
        const client = await signIn(user.email);
        const response = await client.get("/auth/me");
        expect(response.status).toBe(200);
        expect(response.body.user.id).toBe(user.id);
    });

    it("logout revokes only the current session in the database and clears both cookies", async () => {
        const user = await createUser();
        const laptop = await signIn(user.email);
        const phone = await signIn(user.email);
        const laptopLogin = await createClient().post("/auth/login", { email: user.email, password: DEFAULT_PASSWORD });
        const stolenAccessToken = cookieValue(accessCookieOf(laptopLogin));

        const response = await laptop.post("/auth/logout");
        expect(response.status).toBe(200);
        expect(accessCookieOf(response)).toMatch(/afritask_access=;/);
        expect(refreshCookieOf(response)).toMatch(/afritask_refresh=;/);
        await expect(laptop.get("/auth/me")).resolves.toMatchObject({ status: 401 });
        await expect(laptop.post("/auth/refresh")).resolves.toMatchObject({ status: 401 });
        await expect(phone.get("/auth/me")).resolves.toMatchObject({ status: 200 });
        expect(await prisma.session.count({ where: { userId: user.id, revokedAt: { not: null } } })).toBe(1);
        // A different login's access token is untouched — only the signed-out session ended.
        await expect(createClient({ accessToken: stolenAccessToken }).get("/auth/me")).resolves.toMatchObject({ status: 200 });
    });

    it("an access token stops working the moment its session is signed out", async () => {
        const user = await createUser();
        const login = await createClient().post("/auth/login", { email: user.email, password: DEFAULT_PASSWORD });
        const accessToken = cookieValue(accessCookieOf(login));
        const refreshToken = cookieValue(refreshCookieOf(login));

        await createClient({ refreshToken }).post("/auth/logout");
        await expect(createClient({ accessToken }).get("/auth/me")).resolves.toMatchObject({ status: 401, body: { code: "access_token_invalid" } });
    });

    it("logout works with only the refresh token (access token already expired)", async () => {
        const user = await createUser();
        const login = await createClient().post("/auth/login", { email: user.email, password: DEFAULT_PASSWORD });
        const refreshToken = cookieValue(refreshCookieOf(login));

        await expect(createClient({ refreshToken }).post("/auth/logout")).resolves.toMatchObject({ status: 200 });
        await expect(createClient({ refreshToken }).post("/auth/refresh")).resolves.toMatchObject({ status: 401 });
    });

    it("an expired session is refused", async () => {
        const user = await createUser();
        const client = await signIn(user.email);
        await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
        await expect(client.get("/auth/me")).resolves.toMatchObject({ status: 401 });
    });
});

describe("POST /auth/refresh", () => {
    it("trades the refresh cookie for new access + refresh cookies", async () => {
        const user = await createUser();
        const browser = await signIn(user.email);

        const refreshed = await browser.post("/auth/refresh");
        expect(refreshed.status).toBe(200);
        expect(accessCookieOf(refreshed)).toBeDefined();
        expect(refreshCookieOf(refreshed)).toBeDefined();
        await expect(browser.get("/auth/me")).resolves.toMatchObject({ status: 200 });
    });

    it("answers 401 (and clears the cookies) without a usable refresh token", async () => {
        const response = await createClient().post("/auth/refresh");
        expect(response.status).toBe(401);
        expect(refreshCookieOf(response)).toMatch(/afritask_refresh=;/);
        await expect(createClient({ refreshToken: "made-up" }).post("/auth/refresh")).resolves.toMatchObject({ status: 401 });
    });

    it("a refresh token stops working after a password reset", async () => {
        const user = await createUser();
        const login = await createClient().post("/auth/login", { email: user.email, password: DEFAULT_PASSWORD });
        const refreshToken = cookieValue(refreshCookieOf(login));

        await prisma.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
        await expect(createClient({ refreshToken }).post("/auth/refresh")).resolves.toMatchObject({ status: 401 });
    });
});

describe("password recovery", () => {
    const GENERIC = "If an account exists for that email, a password reset link has been sent.";

    it("answers identically for known and unknown emails (no account discovery)", async () => {
        const user = await createUser();
        const known = await createClient().post("/auth/forgot-password", { email: user.email });
        const unknown = await createClient().post("/auth/forgot-password", { email: uniqueEmail() });

        expect(known.status).toBe(200);
        expect(unknown.status).toBe(200);
        expect(known.body).toEqual(unknown.body);
        expect(known.body.message).toBe(GENERIC);
        expect(emailsTo(user.email)).toHaveLength(1);
    });

    it("still answers generically when the email provider fails", async () => {
        const user = await createUser();
        testMailbox.failNextSend = true;
        const response = await createClient().post("/auth/forgot-password", { email: user.email });
        expect(response.status).toBe(200);
        expect(response.body.message).toBe(GENERIC);
    });

    it("resets the password once, signs out every device, and the old password stops working", async () => {
        const user = await createUser();
        const existingSession = await signIn(user.email);
        await createClient().post("/auth/forgot-password", { email: user.email });
        const token = tokenFromEmail(user.email, RESET_LINK);

        const tooShort = await createClient().patch(`/auth/reset-password/${token}`, { password: "123" });
        expect(tooShort.status).toBe(400);

        // The too-short attempt didn't burn the link:
        const reset = await createClient().patch(`/auth/reset-password/${token}`, { password: "brand-new-pass" });
        expect(reset.status).toBe(200);
        expect(lastEmailTo(user.email).subject).toBe("Password Changed Successfully");

        await expect(existingSession.get("/auth/me")).resolves.toMatchObject({ status: 401 });
        await expect(createClient().patch(`/auth/reset-password/${token}`, { password: "another-pass" })).resolves.toMatchObject({ status: 400 });
        await expect(createClient().post("/auth/login", { email: user.email, password: DEFAULT_PASSWORD })).resolves.toMatchObject({ status: 401 });
        await expect(createClient().post("/auth/login", { email: user.email, password: "brand-new-pass" })).resolves.toMatchObject({ status: 200 });
    });

    it("only the newest reset link works", async () => {
        const user = await createUser();
        await createClient().post("/auth/forgot-password", { email: user.email });
        const firstToken = tokenFromEmail(user.email, RESET_LINK);
        await createClient().post("/auth/forgot-password", { email: user.email });
        const response = await createClient().patch(`/auth/reset-password/${firstToken}`, { password: "brand-new-pass" });
        expect(response.status).toBe(400);
    });
});

describe("Google sign-in", () => {
    it("reports that Google isn't configured (tests run without credentials)", async () => {
        const response = await anonymous().get("/api/auth/google");
        expect(response.status).toBe(500);
        expect(response.body.message).toBe("Google OAuth credentials are not configured");
    });

    it("exchanges a one-time code for a session, exactly once", async () => {
        const user = await createUser();
        const code = await issueAccountToken(user.id, "oauth_exchange", 60_000);

        const client = createClient();
        const exchange = await client.post("/auth/google/exchange", { code });
        expect(exchange.status).toBe(200);
        expect(accessCookieOf(exchange)).toBeDefined();
        expect(refreshCookieOf(exchange)).toBeDefined();
        await expect(client.get("/auth/me")).resolves.toMatchObject({ status: 200 });

        const reuse = await createClient().post("/auth/google/exchange", { code });
        expect(reuse.status).toBe(401);
    });

    it("requires a code", async () => {
        await expect(createClient().post("/auth/google/exchange", {})).resolves.toMatchObject({ status: 400 });
    });
});
