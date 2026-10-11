// ─── Test data factories ─────────────────────
// Setup goes straight to the database (few round trips — the test DB is remote), and
// through the API only where the API IS the behaviour under test.
import { randomUUID } from "node:crypto";
import prisma from "../../src/config/prisma.js";
import type { WorkspaceRole } from "../../src/generated/prisma/client.js";
import { hashPassword } from "../../src/utils/password.js";
import { generateSecureToken, hashSecureToken } from "../../src/utils/secureToken.js";
import { createClient, type ApiClient } from "./client.js";
import { CURRENT_TERMS_VERSION } from "../../src/config/terms.js";
import env from "../../src/config/env.js";
import { signAccessToken } from "../../src/utils/accessToken.js";

export const DEFAULT_PASSWORD = "correct-horse-1";

// bcrypt is deliberately slow; hash the shared test password once per test file.
let defaultPasswordHash: Promise<string> | null = null;
const passwordHashFor = (password: string) => {
    if (password !== DEFAULT_PASSWORD) return hashPassword(password);
    defaultPasswordHash ??= hashPassword(DEFAULT_PASSWORD);
    return defaultPasswordHash;
};

let userCounter = 0;
export const uniqueEmail = (label = "user") => `${label}-${++userCounter}-${randomUUID().slice(0, 8)}@afritask.invalid`;

interface UserOptions {
    name?: string;
    email?: string;
    password?: string;
    verified?: boolean;
    timezone?: string;
    acceptedTerms?: boolean;
}

// A user straight in the database (verified and with the current terms accepted by default).
export const createUser = async ({ name = "Test User", email = uniqueEmail(), password = DEFAULT_PASSWORD, verified = true, timezone = "UTC", acceptedTerms = true }: UserOptions = {}) =>
    prisma.user.create({
        data: {
            name,
            email,
            password: await passwordHashFor(password),
            isVerified: verified,
            timezone,
            ...(acceptedTerms && { termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION }),
        },
    });

// A client that's signed in through the REAL login endpoint (use when login is the point).
export const signIn = async (email: string, password = DEFAULT_PASSWORD): Promise<ApiClient> => {
    const client = createClient();
    const response = await client.post("/auth/login", { email, password });
    if (response.status !== 200) throw new Error(`signIn(${email}) failed: ${response.status} ${JSON.stringify(response.body)}`);
    return client;
};

// A signed-in client via a session row created directly (same shape login creates):
// the row is the refresh token, plus a signed 15-minute access token naming it.
export const clientWithSession = async (userId: string): Promise<ApiClient> => {
    const refreshToken = generateSecureToken();
    const session = await prisma.session.create({
        data: { userId, secretHash: hashSecureToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    });
    const accessToken = signAccessToken({ userId, sessionId: session.id }, env.accessTokenSecret, 15 * 60 * 1000);
    return createClient({ accessToken, refreshToken });
};

// Verified user + signed-in client in one go.
export const createSignedInUser = async (options: UserOptions = {}) => {
    const user = await createUser(options);
    const client = await clientWithSession(user.id);
    return { user, client };
};

export const createWorkspace = async (ownerId: string, name = "Test Workspace") => {
    const workspace = await prisma.workspace.create({
        data: { name, memberships: { create: { userId: ownerId, role: "owner" } } },
        include: { memberships: true },
    });
    return { workspace, ownerMembership: workspace.memberships[0]! };
};

export const addMember = (workspaceId: string, userId: string, role: WorkspaceRole = "member") =>
    prisma.membership.create({ data: { workspaceId, userId, role } });

// A workspace with an Owner, an Admin and a Member, plus an Outsider — each signed in.
export const createTeam = async () => {
    const [owner, admin, member, outsider] = await Promise.all([
        createSignedInUser({ name: "Olu Owner" }),
        createSignedInUser({ name: "Ada Admin" }),
        createSignedInUser({ name: "Musa Member" }),
        createSignedInUser({ name: "Oscar Outsider" }),
    ]);
    const workspace = await prisma.workspace.create({
        data: {
            name: "Team Space",
            memberships: {
                create: [
                    { userId: owner.user.id, role: "owner" },
                    { userId: admin.user.id, role: "admin" },
                    { userId: member.user.id, role: "member" },
                ],
            },
        },
        include: { memberships: true },
    });
    const membershipOf = (userId: string) => workspace.memberships.find((membership) => membership.userId === userId)!;
    return {
        workspace,
        owner: { ...owner, membership: membershipOf(owner.user.id) },
        admin: { ...admin, membership: membershipOf(admin.user.id) },
        member: { ...member, membership: membershipOf(member.user.id) },
        outsider,
    };
};

export const createProject = (workspaceId: string, createdById: string, overrides: { name?: string; state?: "active" | "on_hold" | "completed" | "archived" } = {}) =>
    prisma.project.create({
        data: { workspaceId, createdById, name: overrides.name ?? "Test Project", state: overrides.state ?? "active" },
    });

export const createTask = (
    workspaceId: string,
    creatorId: string,
    overrides: Partial<{ title: string; projectId: string | null; assigneeMembershipId: string | null; status: "todo" | "in_progress" | "in_review" | "completed"; dueAt: Date | null }> = {}
) =>
    prisma.task.create({
        data: {
            workspaceId,
            creatorId,
            title: overrides.title ?? "Test task",
            projectId: overrides.projectId ?? null,
            assigneeMembershipId: overrides.assigneeMembershipId ?? null,
            status: overrides.status ?? "todo",
            dueAt: overrides.dueAt ?? null,
            dueKind: overrides.dueAt ? "datetime" : null,
        },
    });
