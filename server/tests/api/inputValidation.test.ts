// API: bad input is answered with a clear 400 (or 404), never a 500, and never stored as is.
// Each case here was found by an input audit; the comments say what used to happen.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { DEFAULT_PASSWORD, createSignedInUser, createTeam, createUser, uniqueEmail } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const signupBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Ada Lovelace",
    email: uniqueEmail("signup"),
    password: "analytical-engine",
    timezone: "Africa/Lagos",
    acceptTerms: true,
    ...overrides,
});

describe("accounts", () => {
    it("names are one short line; passwords have a sane maximum", async () => {
        const client = createClient();
        await expect(client.post("/auth/signup", signupBody({ name: "x".repeat(81) }))).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/auth/signup", signupBody({ password: "p".repeat(129) }))).resolves.toMatchObject({ status: 400 });

        const body = signupBody({ name: "  Ada \n\n Lovelace  " });
        await expect(client.post("/auth/signup", body)).resolves.toMatchObject({ status: 201 });
        await expect(prisma.user.findUniqueOrThrow({ where: { email: body.email } })).resolves.toMatchObject({ name: "Ada Lovelace" });
    });

    it("emails are one account whatever their case or spacing", async () => {
        const email = uniqueEmail("mixed");
        const client = createClient();
        await expect(client.post("/auth/signup", signupBody({ email: `  ${email.toUpperCase()} ` }))).resolves.toMatchObject({ status: 201 });
        await expect(prisma.user.count({ where: { email } })).resolves.toBe(1);
        await expect(client.post("/auth/signup", signupBody({ email }))).resolves.toMatchObject({ status: 400 });

        // An account stored with capitals (before emails were lowercased) can still sign in.
        const legacy = await createUser({ email: `Legacy-${uniqueEmail()}` });
        await expect(createClient().post("/auth/login", { email: legacy.email.toLowerCase(), password: DEFAULT_PASSWORD })).resolves.toMatchObject({ status: 200 });
    });

    it("a password change with non-text values is a 400, not a crash", async () => {
        const { client } = await createSignedInUser();
        await expect(client.put("/users/password", { currentPassword: 12345678, newPassword: "a-new-password" })).resolves.toMatchObject({ status: 400 });
        await expect(client.put("/users/password", { currentPassword: DEFAULT_PASSWORD, newPassword: "short" })).resolves.toMatchObject({ status: 400 });
    });
});

describe("request shape", () => {
    // Express 5 leaves req.body undefined without a JSON body; handlers then crashed (500).
    it("a write with no body at all is a 400", async () => {
        const team = await createTeam();
        await expect(createClient().raw("post", "/auth/login")).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.raw("post", `/workspaces/${team.workspace.id}/tasks`)).resolves.toMatchObject({ status: 400 });
    });

    it("ids that aren't text are refused, not crashed on", async () => {
        const team = await createTeam();
        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: 1 })).resolves.toMatchObject({ status: 404 });
        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: { not: "" } })).resolves.toMatchObject({ status: 404 });
    });

    it("pages and dates outside a sensible range are a 400", async () => {
        const team = await createTeam();
        const tasks = `/workspaces/${team.workspace.id}/tasks`;
        await expect(team.owner.client.get(`${tasks}?limit=10&page=99999999999`)).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.post(tasks, { title: "Loose date", dueAt: "1" })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.post(tasks, { title: "Far future", dueAt: "9999-01-01T00:00:00.000Z" })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.post(tasks, { title: "Fine", dueAt: "2027-01-01T09:00:00.000Z" })).resolves.toMatchObject({ status: 201 });
    });
});
