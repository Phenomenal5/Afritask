// API: admin console access (SRS SR16) — password, then MFA; separate from customer sessions.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { DEFAULT_PASSWORD, createSignedInUser, createUser } from "../helpers/factories.js";
import { totpCode } from "../../src/utils/totp.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const STEP_MS = 30_000;

// An account with an active grant (as the grant script would create).
const createOperator = async () => {
    const user = await createUser({ name: "Ola Operator" });
    await prisma.platformGrant.create({ data: { userId: user.id, note: "test" } });
    return user;
};

// Signs in through password + MFA enrolment. Returns the browser and the TOTP secret.
const signInOperator = async (email: string) => {
    const browser = createClient();
    const login = await browser.post("/admin/auth/login", { email, password: DEFAULT_PASSWORD });
    expect(login.status).toBe(200);
    const setup = await browser.post("/admin/auth/mfa/setup");
    const secret: string = setup.body.data.secret;
    const verified = await browser.post("/admin/auth/mfa/verify", { code: totpCode(secret) });
    expect(verified.status).toBe(200);
    return { browser, secret };
};

describe("operator sign-in", () => {
    it("password, then MFA enrolment, then a fully signed-in console", async () => {
        const operator = await createOperator();
        const browser = createClient();

        const login = await browser.post("/admin/auth/login", { email: operator.email, password: DEFAULT_PASSWORD });
        expect(login.body.data).toMatchObject({ next: "mfa_setup", operator: { email: operator.email, mfa: { enrolled: false, verified: false } } });
        // The operator cookie is scoped to /api/admin and strict.
        expect(String(login.headers["set-cookie"])).toMatch(/afritask_operator_session=.*Path=\/api\/admin.*HttpOnly.*SameSite=Strict/i);

        // Before MFA the session can only finish MFA.
        expect((await browser.get("/admin/auth/me")).body.data.operator.mfa).toEqual({ enrolled: false, verified: false });

        const setup = await browser.post("/admin/auth/mfa/setup");
        expect(setup.body.data.otpauthUri).toContain("otpauth://totp/");
        const stored = await prisma.platformGrant.findUniqueOrThrow({ where: { userId: operator.id } });
        expect(stored.mfaSecretEncrypted).not.toContain(setup.body.data.secret);

        await expect(browser.post("/admin/auth/mfa/verify", { code: "000000" })).resolves.toMatchObject({ status: 401 });
        const verified = await browser.post("/admin/auth/mfa/verify", { code: totpCode(setup.body.data.secret) });
        expect(verified.body.data.operator.mfa).toEqual({ enrolled: true, verified: true });

        const audit = await prisma.adminAuditEntry.findMany({ where: { actorId: operator.id }, orderBy: { createdAt: "asc" } });
        expect(audit.map((entry) => entry.action)).toEqual(["operator.mfa_enrolled", "operator.signed_in"]);
    });

    it("gives the same answer for unknown emails, wrong passwords and accounts without access", async () => {
        const operator = await createOperator();
        const customer = await createUser();
        const attempts = await Promise.all([
            createClient().post("/admin/auth/login", { email: "nobody@afritask.invalid", password: DEFAULT_PASSWORD }),
            createClient().post("/admin/auth/login", { email: operator.email, password: "wrong-password" }),
            createClient().post("/admin/auth/login", { email: customer.email, password: DEFAULT_PASSWORD }),
        ]);
        expect(attempts.map((attempt) => attempt.status)).toEqual([401, 401, 401]);
        expect(new Set(attempts.map((attempt) => attempt.body.message)).size).toBe(1);
    });

    it("a second sign-in skips enrolment, and a used code can't be replayed", async () => {
        const operator = await createOperator();
        const { secret } = await signInOperator(operator.email);

        const browser = createClient();
        const login = await browser.post("/admin/auth/login", { email: operator.email, password: DEFAULT_PASSWORD });
        expect(login.body.data.next).toBe("mfa_verify");
        await expect(browser.post("/admin/auth/mfa/setup")).resolves.toMatchObject({ status: 409 });

        // The code from the first sign-in was already used in this step.
        const replay = await browser.post("/admin/auth/mfa/verify", { code: totpCode(secret) });
        expect(replay.status).toBe(401);
        // The next step's code is accepted (±1 step of drift).
        const next = await browser.post("/admin/auth/mfa/verify", { code: totpCode(secret, Date.now() + STEP_MS) });
        expect(next.status).toBe(200);
    });
});

describe("separation from customer sessions", () => {
    it("a customer session can't open the console, and an operator session can't use the app", async () => {
        const { client: customer } = await createSignedInUser();
        await expect(customer.get("/admin/auth/me")).resolves.toMatchObject({ status: 401 });

        const operator = await createOperator();
        const { browser } = await signInOperator(operator.email);
        await expect(browser.get("/auth/me")).resolves.toMatchObject({ status: 401 });
        await expect(browser.get("/workspaces")).resolves.toMatchObject({ status: 401 });
    });

    it("replaying an operator secret as the customer refresh token doesn't work either", async () => {
        const operator = await createOperator();
        const browser = createClient();
        const login = await browser.post("/admin/auth/login", { email: operator.email, password: DEFAULT_PASSWORD });
        const rawSecret = String(login.headers["set-cookie"]).match(/afritask_operator_session=([^;]+)/)![1]!;

        const replayed = await createClient({ refreshToken: rawSecret }).post("/auth/refresh");
        expect(replayed.status).toBe(401);
    });
});

describe("revocation and sign-out", () => {
    it("revoking the grant ends the console session on the next request", async () => {
        const operator = await createOperator();
        const { browser } = await signInOperator(operator.email);
        await prisma.platformGrant.update({ where: { userId: operator.id }, data: { revokedAt: new Date() } });

        await expect(browser.get("/admin/auth/me")).resolves.toMatchObject({ status: 401 });
        await expect(prisma.session.count({ where: { userId: operator.id, kind: "operator", revokedAt: null } })).resolves.toBe(0);
    });

    it("signing out revokes the session and is audited", async () => {
        const operator = await createOperator();
        const { browser } = await signInOperator(operator.email);

        await expect(browser.post("/admin/auth/logout")).resolves.toMatchObject({ status: 200 });
        await expect(browser.get("/admin/auth/me")).resolves.toMatchObject({ status: 401 });
        await expect(prisma.adminAuditEntry.count({ where: { action: "operator.signed_out" } })).resolves.toBe(1);
    });

    it("the audit trail can't be edited", async () => {
        const operator = await createOperator();
        await signInOperator(operator.email);
        const entry = await prisma.adminAuditEntry.findFirstOrThrow();
        await expect(prisma.adminAuditEntry.update({ where: { id: entry.id }, data: { reason: "rewritten" } })).rejects.toThrow(/immutable/);
    });
});
