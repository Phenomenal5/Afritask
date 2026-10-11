// API: Terms of Service acceptance — required at signup, and enforced for accounts that
// never ticked the box (Google sign-ups, older accounts) until they accept.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { CURRENT_TERMS_VERSION } from "../../src/config/terms.js";
import { createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, uniqueEmail } from "../helpers/factories.js";
import { clearMailbox } from "../helpers/mailbox.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const signupBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Grace Hopper",
    email: uniqueEmail("terms"),
    password: "compiler-123",
    ...overrides,
});

describe("POST /auth/signup — terms", () => {
    it.each([
        ["missing", {}],
        ["false", { acceptTerms: false }],
        ["a truthy string", { acceptTerms: "true" }],
    ])("refuses an account when acceptance is %s", async (_label, overrides) => {
        const body = signupBody(overrides);
        const response = await createClient().post("/auth/signup", body);

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/Terms of Service/);
        await expect(prisma.user.findUnique({ where: { email: body.email } })).resolves.toBeNull();
    });

    it("records when and which version was accepted", async () => {
        const body = signupBody({ acceptTerms: true });
        await expect(createClient().post("/auth/signup", body)).resolves.toMatchObject({ status: 201 });

        const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
        expect(user.termsVersion).toBe(CURRENT_TERMS_VERSION);
        expect(user.termsAcceptedAt).toBeInstanceOf(Date);
    });
});

describe("accounts without the current terms", () => {
    it("are blocked from the app until they accept, then let through", async () => {
        const { client } = await createSignedInUser({ acceptedTerms: false });

        await expect(client.get("/workspaces")).resolves.toMatchObject({ status: 403, body: { code: "terms_required" } });
        // Still reachable: who am I (with the flag the client shows the step from), and profile.
        await expect(client.get("/auth/me")).resolves.toMatchObject({ status: 200, body: { termsRequired: true } });
        await expect(client.put("/users/profile", { name: "Grace H" })).resolves.toMatchObject({ status: 200 });

        await expect(client.post("/auth/accept-terms", {})).resolves.toMatchObject({ status: 400 });
        const accepted = await client.post("/auth/accept-terms", { acceptTerms: true });
        expect(accepted.status).toBe(200);
        expect(accepted.body).toMatchObject({ termsRequired: false, user: { termsVersion: CURRENT_TERMS_VERSION } });

        await expect(client.get("/workspaces")).resolves.toMatchObject({ status: 200 });
        await expect(client.get("/auth/me")).resolves.toMatchObject({ body: { termsRequired: false } });
    });

    it("are asked again after the terms change", async () => {
        const { user, client } = await createSignedInUser();
        await prisma.user.update({ where: { id: user.id }, data: { termsVersion: "2000-01-01" } });

        await expect(client.get("/workspaces")).resolves.toMatchObject({ status: 403, body: { code: "terms_required" } });
    });
});
