// Unit: the PRD §8 task permission matrix.
import { describe, expect, it } from "@jest/globals";
import type { Membership, WorkspaceRole } from "../../src/generated/prisma/client.js";
import { canAssignTask, canDeleteTask, canEditTask } from "../../src/utils/taskPermissions.js";

const membership = (role: WorkspaceRole, userId: string, membershipId: string) =>
    ({ id: membershipId, userId, role, workspaceId: "ws", status: "active" }) as Membership;

const owner = membership("owner", "u-owner", "m-owner");
const admin = membership("admin", "u-admin", "m-admin");
const creator = membership("member", "u-creator", "m-creator");
const assignee = membership("member", "u-assignee", "m-assignee");
const bystander = membership("member", "u-bystander", "m-bystander");

const task = { creatorId: "u-creator", assigneeMembershipId: "m-assignee" };

describe("task permission matrix (PRD §8)", () => {
    it.each([
        ["Owner", owner, true, true, true],
        ["Admin", admin, true, true, true],
        ["Member who created it", creator, true, true, true],
        ["Member it's assigned to", assignee, true, true, false],
        ["Other Member", bystander, false, false, false],
    ])("%s → edit %p, assign %p, delete %p", (_label, actor, mayEdit, mayAssign, mayDelete) => {
        expect(canEditTask(actor, task)).toBe(mayEdit);
        expect(canAssignTask(actor, task)).toBe(mayAssign);
        expect(canDeleteTask(actor, task)).toBe(mayDelete);
    });

    it("a former assignee loses edit rights once the task is reassigned", () => {
        expect(canEditTask(assignee, { ...task, assigneeMembershipId: "m-someone-else" })).toBe(false);
    });

    it("an unassigned task is editable only by managers and its creator", () => {
        const unassigned = { creatorId: "u-creator", assigneeMembershipId: null };
        expect(canEditTask(creator, unassigned)).toBe(true);
        expect(canEditTask(bystander, unassigned)).toBe(false);
    });
});
