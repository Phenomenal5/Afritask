// Integration: rules the DATABASE enforces on its own (not just the controllers).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { Prisma } from "../../src/generated/prisma/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { addMember, createTask, createUser, createWorkspace } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const expectUniqueViolation = async (operation: Promise<unknown>) => {
    await expect(operation).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await operation.catch((error: Prisma.PrismaClientKnownRequestError) => expect(error.code).toBe("P2002"));
};

describe("database invariants", () => {
    it("allows only ONE active owner per workspace (partial unique index)", async () => {
        const owner = await createUser();
        const second = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        await expectUniqueViolation(addMember(workspace.id, second.id, "owner"));
    });

    it("…but a removed former owner doesn't block a new one", async () => {
        const formerOwner = await createUser();
        const newOwner = await createUser();
        const { workspace, ownerMembership } = await createWorkspace(formerOwner.id);
        await prisma.membership.update({ where: { id: ownerMembership.id }, data: { status: "removed", role: "owner" } });
        await expect(addMember(workspace.id, newOwner.id, "owner")).resolves.toBeDefined();
    });

    it("keeps one membership row per person per workspace", async () => {
        const owner = await createUser();
        const member = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        await addMember(workspace.id, member.id);
        await expectUniqueViolation(addMember(workspace.id, member.id));
    });

    it("allows one PENDING invitation per email per workspace, any number of finished ones", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const invitation = (tokenHash: string, status: "pending" | "declined") =>
            prisma.invitation.create({
                data: { workspaceId: workspace.id, email: "x@afritask.invalid", role: "member", inviterId: owner.id, tokenHash, status, expiresAt: new Date(Date.now() + 1e6) },
            });
        await invitation("hash-1", "declined");
        await invitation("hash-2", "declined");
        await invitation("hash-3", "pending");
        await expectUniqueViolation(invitation("hash-4", "pending"));
    });

    it("makes clientRequestId unique per workspace (idempotency key)", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const { workspace: otherWorkspace } = await createWorkspace(owner.id, "Other");
        const taskWithKey = (workspaceId: string) =>
            prisma.task.create({ data: { workspaceId, creatorId: owner.id, title: "t", clientRequestId: "same-key" } });
        await taskWithKey(workspace.id);
        await expect(taskWithKey(otherWorkspace.id)).resolves.toBeDefined(); // other workspace: fine
        await expectUniqueViolation(taskWithKey(workspace.id));
    });

    it("refuses to delete a user who created shared work (RESTRICT)", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        await createTask(workspace.id, owner.id);
        await expect(prisma.user.delete({ where: { id: owner.id } })).rejects.toBeDefined();
    });

    it("unassigns (SET NULL) tasks if a membership row is ever deleted", async () => {
        const owner = await createUser();
        const member = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const membership = await addMember(workspace.id, member.id);
        const task = await createTask(workspace.id, owner.id, { assigneeMembershipId: membership.id });
        await prisma.membership.delete({ where: { id: membership.id } });
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ assigneeMembershipId: null });
    });
});
