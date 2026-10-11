// ─── OpenAPI 3.1 description of the Afritask API (served at /api/docs) ─────────────────────
// NOTE: keep this in step with the routes — every route file has a matching section here.
// Written as plain data (not JSDoc comments on routes) so one file shows the whole API
// and TypeScript catches structural typos.

type SchemaRef = { $ref: string };
type JsonObject = Record<string, unknown>;

const ref = (name: string): SchemaRef => ({ $ref: `#/components/schemas/${name}` });

const jsonBody = (schema: JsonObject | SchemaRef, required = true) => ({
    required,
    content: { "application/json": { schema } },
});

const jsonResponse = (description: string, schema?: JsonObject | SchemaRef) => ({
    description,
    ...(schema && { content: { "application/json": { schema } } }),
});

// Standard success envelopes: { status: "success", data: { <key>: ... } }
const dataEnvelope = (key: string, schema: JsonObject | SchemaRef) => ({
    type: "object",
    properties: {
        status: { type: "string", example: "success" },
        data: { type: "object", properties: { [key]: schema } },
    },
});
const listEnvelope = (key: string, itemSchema: SchemaRef) => ({
    type: "object",
    properties: {
        status: { type: "string", example: "success" },
        results: { type: "integer" },
        data: { type: "object", properties: { [key]: { type: "array", items: itemSchema } } },
    },
});
const messageEnvelope = { $ref: "#/components/schemas/Message" };

const errorResponses = (...statusCodes: number[]) => {
    const descriptions: Record<number, string> = {
        400: "Invalid input",
        401: "Not signed in (or session expired/revoked)",
        403: "Signed in, but not allowed (or missing X-Requested-With on a write)",
        404: "Not found — also returned for resources in workspaces you're not a member of",
        409: "Conflict with the current state (e.g. stale version, already used, archived)",
        410: "Expired",
        429: "Rate limited",
        502: "Email provider failed",
    };
    return Object.fromEntries(
        statusCodes.map((statusCode) => [statusCode, jsonResponse(descriptions[statusCode] ?? "Error", ref("Error"))])
    );
};

const pathParam = (name: string, description: string) => ({
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string" },
});
const workspaceIdParam = pathParam("workspaceId", "Workspace id (UUID)");

// Cookie session + CSRF header for everything except the explicitly public routes.
const signedIn = [{ sessionCookie: [] }];
const publicRoute: never[] = [];

// ─── Components ─────────────────────

const schemas = {
    Error: {
        type: "object",
        properties: {
            status: { type: "string", enum: ["fail", "error"] },
            message: { type: "string" },
            requestId: { type: "string", description: "Only on 500s: a reference that matches the server's log entry (also in the X-Request-Id header)" },
        },
    },
    Message: {
        type: "object",
        properties: { status: { type: "string", example: "success" }, message: { type: "string" } },
    },
    User: {
        type: "object",
        description: "A user as the API returns it — passwords and tokens are never included.",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            age: { type: ["integer", "null"] },
            photo: { type: ["string", "null"], description: "Path under /uploads" },
            role: { type: "string", enum: ["user", "admin"], description: "Legacy account role (not a workspace role)" },
            provider: { type: "string", enum: ["local", "google"] },
            providerId: { type: ["string", "null"] },
            isVerified: { type: "boolean" },
            timezone: { type: "string", example: "Africa/Lagos" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
        },
    },
    UserResponse: {
        type: "object",
        properties: { status: { type: "string", example: "success" }, user: ref("User") },
    },
    WorkspaceRole: { type: "string", enum: ["owner", "admin", "member"] },
    WorkspaceSummary: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            role: ref("WorkspaceRole"),
            memberCount: { type: "integer" },
        },
    },
    Member: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid", description: "Membership id (used for assignment and member actions)" },
            role: ref("WorkspaceRole"),
            joinedAt: { type: "string", format: "date-time" },
            user: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    email: { type: "string" },
                    photo: { type: ["string", "null"] },
                },
            },
        },
    },
    WorkspaceDetails: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            role: { ...ref("WorkspaceRole"), description: "The caller's role" },
            members: { type: "array", items: ref("Member") },
        },
    },
    TaskStatus: { type: "string", enum: ["todo", "in_progress", "in_review", "completed"] },
    TaskPriority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    Task: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            workspaceId: { type: "string", format: "uuid" },
            creatorId: { type: "string", format: "uuid" },
            projectId: { type: ["string", "null"], format: "uuid" },
            parentTaskId: { type: ["string", "null"], format: "uuid", description: "Set on subtasks (one level only)" },
            assigneeMembershipId: { type: ["string", "null"], format: "uuid" },
            title: { type: "string" },
            description: { type: "string" },
            status: ref("TaskStatus"),
            priority: ref("TaskPriority"),
            dueAt: { type: ["string", "null"], format: "date-time", description: "The due instant (UTC)" },
            dueKind: { type: ["string", "null"], enum: ["date", "datetime", null], description: "date = due by 23:59 that day in dueTimezone" },
            dueTimezone: { type: ["string", "null"] },
            completedAt: { type: ["string", "null"], format: "date-time" },
            reminderOffset: { type: ["string", "null"], enum: ["at_due", "one_hour", "one_day", "three_days", "one_week", null] },
            remindAt: { type: ["string", "null"], format: "date-time", description: "When the pending reminder fires (null: none pending)" },
            startAt: { type: ["string", "null"], format: "date-time" },
            startKind: { type: ["string", "null"], enum: ["date", "datetime", null] },
            startTimezone: { type: ["string", "null"] },
            startReminderAt: { type: ["string", "null"], format: "date-time", description: "When the 'starts tomorrow' reminder fires (To do tasks only)" },
            overdueCheckAt: { type: ["string", "null"], format: "date-time", description: "When the pending overdue alert fires (null: none pending)" },
            version: { type: "integer", description: "Send it back on every update (optimistic concurrency)" },
            clientRequestId: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            project: {
                type: ["object", "null"],
                properties: { id: { type: "string" }, name: { type: "string" }, state: ref("ProjectState") },
            },
            assignee: {
                type: ["object", "null"],
                properties: {
                    id: { type: "string", description: "Membership id" },
                    user: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, photo: { type: ["string", "null"] } } },
                },
            },
            labels: { type: "array", items: ref("Label") },
            parent: { type: ["object", "null"], description: "On subtasks: the parent's id and title", properties: { id: { type: "string" }, title: { type: "string" } } },
            subtaskCounts: { type: "object", properties: { total: { type: "integer" }, completed: { type: "integer" } } },
            subtasks: { type: "array", items: { $ref: "#/components/schemas/Task" }, description: "Only on GET /tasks/{id}" },
        },
    },
    Label: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", maxLength: 40 },
            color: { type: "string", enum: ["gray", "moss", "clay", "gold", "sky", "plum"] },
            taskCount: { type: "integer", description: "Only on the workspace label list" },
        },
    },
    TaskWrite: {
        type: "object",
        description:
            "Send dueDate (YYYY-MM-DD → due 23:59 that day in dueTimezone, default your profile timezone) OR dueAt (exact ISO instant); null clears. Legacy `deadline` and statuses `pending`/`in progress` are still accepted.",
        properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: "string", maxLength: 20000 },
            status: ref("TaskStatus"),
            priority: ref("TaskPriority"),
            projectId: { type: ["string", "null"], format: "uuid" },
            assigneeMembershipId: { type: ["string", "null"], format: "uuid", description: "An ACTIVE membership of the same workspace" },
            dueDate: { type: ["string", "null"], format: "date", example: "2026-12-01" },
            dueAt: { type: ["string", "null"], format: "date-time" },
            dueTimezone: { type: "string", example: "Africa/Lagos" },
            labelIds: { type: "array", items: { type: "string", format: "uuid" }, description: "Replaces the task's labels (same workspace). [] removes all." },
            startDate: { type: ["string", "null"], format: "date", description: "Planned start (YYYY-MM-DD → 00:00 that day in startTimezone). Can't be after the due date. null clears." },
            startAt: { type: ["string", "null"], format: "date-time", description: "Planned start as an exact instant (instead of startDate)" },
            startTimezone: { type: "string", example: "Africa/Lagos" },
            reminderOffset: {
                type: ["string", "null"],
                enum: ["none", "at_due", "one_hour", "one_day", "three_days", "one_week", null],
                description: "One reminder per task. Defaults to one_day when a deadline is set without a choice. Date-only deadlines anchor at 09:00 local on the due date.",
            },
        },
    },
    ProjectState: { type: "string", enum: ["active", "on_hold", "completed", "archived"] },
    Project: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            workspaceId: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string" },
            state: ref("ProjectState"),
            priorState: { type: ["string", "null"], description: "State before archiving" },
            createdById: { type: "string", format: "uuid" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            taskCounts: {
                type: "object",
                properties: { total: { type: "integer" }, open: { type: "integer" }, completed: { type: "integer" } },
            },
            canManage: { type: "boolean", description: "Only on GET /projects/{id}" },
        },
    },
    Invitation: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            workspaceId: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "member"] },
            status: { type: "string", enum: ["pending", "expired", "accepted", "declined", "revoked"] },
            deliveryStatus: { type: "string", enum: ["pending", "sent", "failed"] },
            expiresAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            inviterName: { type: "string" },
            workspaceName: { type: "string", description: "On preview and /mine" },
        },
    },
    InvitationReference: {
        type: "object",
        description: "Either the token from the emailed link, or the invitation id from /invitations/mine.",
        properties: { token: { type: "string" }, invitationId: { type: "string", format: "uuid" } },
    },
    ActivityEntry: {
        type: "object",
        description: "One immutable history entry. `summary` is the task/project/member name at the time.",
        properties: {
            id: { type: "string", format: "uuid" },
            action: { type: "string", example: "task.updated" },
            entityType: { type: "string", enum: ["task", "project", "membership", "workspace"] },
            entityId: { type: "string", format: "uuid" },
            projectId: { type: ["string", "null"], format: "uuid" },
            changes: {
                type: ["object", "null"],
                description: "Changed fields only, e.g. { \"status\": { \"from\": \"todo\", \"to\": \"completed\" } }",
                additionalProperties: { type: "object", properties: { from: {}, to: {} } },
            },
            summary: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            actor: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, photo: { type: ["string", "null"] } } },
        },
    },
    Comment: {
        type: "object",
        description: "A task comment. Deleted comments keep their place with `deletedAt`/`deletedBy` and an empty body.",
        properties: {
            id: { type: "string", format: "uuid" },
            taskId: { type: "string", format: "uuid" },
            body: { type: "string", maxLength: 5000 },
            author: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, photo: { type: ["string", "null"] } } },
            createdAt: { type: "string", format: "date-time" },
            editedAt: { type: ["string", "null"], format: "date-time", description: "Set when the author changed the text" },
            deletedAt: { type: ["string", "null"], format: "date-time" },
            deletedBy: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
            mentions: {
                type: "array",
                items: { type: "object", properties: { membershipId: { type: "string" }, userId: { type: "string" }, name: { type: "string" } } },
            },
            canEdit: { type: "boolean", description: "You wrote it (and it isn't deleted)" },
            canDelete: { type: "boolean", description: "You wrote it, or you're an Owner/Admin" },
        },
    },
    CommentWrite: {
        type: "object",
        required: ["body"],
        properties: {
            body: { type: "string", minLength: 1, maxLength: 5000 },
            mentionMembershipIds: {
                type: "array",
                items: { type: "string", format: "uuid" },
                description: "Active members of the task's workspace. Duplicates collapse. On edit, omit to keep the current mentions.",
            },
        },
    },
    Notification: {
        type: "object",
        description: "One in-app notification. `available` is re-checked on every read: deleted tasks, lost access or closed invitations make it false and withhold `summary`/links.",
        properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string", enum: ["task_assigned", "comment_mention", "invitation_received", "task_reminder", "task_overdue", "task_starting"] },
            createdAt: { type: "string", format: "date-time" },
            readAt: { type: ["string", "null"], format: "date-time" },
            actor: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" }, photo: { type: ["string", "null"] } } },
            workspace: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
            taskId: { type: ["string", "null"], format: "uuid" },
            commentId: { type: ["string", "null"], format: "uuid" },
            invitationId: { type: ["string", "null"], format: "uuid" },
            summary: { type: "string", description: "Task title (or workspace name for invitations) at the time" },
            available: { type: "boolean" },
            unavailableReason: { type: ["string", "null"] },
        },
    },
    UnreadCount: {
        type: "object",
        properties: { status: { type: "string" }, data: { type: "object", properties: { unreadCount: { type: "integer" } } } },
    },
    AdminDelivery: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            kind: { type: "string", enum: ["task_reminder", "task_overdue"] },
            status: { type: "string", enum: ["pending", "sent", "failed", "suppressed"] },
            attempts: { type: "integer" },
            lastError: { type: ["string", "null"], description: "Sanitised provider error" },
            recipient: { type: "object", properties: { id: { type: "string" }, email: { type: "string" } } },
            taskId: { type: ["string", "null"] },
            workspaceId: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
        },
    },
    AdminAuditEntry: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            action: { type: "string", example: "account.suspended" },
            actor: { type: ["object", "null"], description: "Null for deployment-script actions", properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" } } },
            targetType: { type: ["string", "null"] },
            targetId: { type: ["string", "null"] },
            reason: { type: "string" },
            ipAddress: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
        },
    },
    AdminAccount: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            email: { type: "string" },
            isVerified: { type: "boolean" },
            status: { type: "string", enum: ["active", "suspended"] },
            createdAt: { type: "string", format: "date-time" },
            workspaceCount: { type: "integer" },
            suspendedAt: { type: ["string", "null"], format: "date-time", description: "Detail only" },
            suspendReason: { type: ["string", "null"], description: "Detail only" },
            memberships: {
                type: "array",
                description: "Detail only — metadata, never workspace content",
                items: {
                    type: "object",
                    properties: { workspaceId: { type: "string" }, workspaceName: { type: "string" }, role: ref("WorkspaceRole"), status: { type: "string" }, joinedAt: { type: "string", format: "date-time" } },
                },
            },
        },
    },
    AdminWorkspace: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            status: { type: "string", enum: ["active", "suspended", "deleted"] },
            createdAt: { type: "string", format: "date-time" },
            memberCount: { type: "integer" },
            owner: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" } } },
            suspendedAt: { type: ["string", "null"], format: "date-time", description: "Detail only" },
            suspendReason: { type: ["string", "null"], description: "Detail only" },
            deletedAt: { type: ["string", "null"], format: "date-time", description: "Detail only: deleted by its Owner (data kept)" },
            counts: { type: "object", description: "Detail only", properties: { projects: { type: "integer" }, tasks: { type: "integer" } } },
        },
    },
    Operator: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            email: { type: "string" },
            role: { type: "string", enum: ["superadmin"] },
            mfa: { type: "object", properties: { enrolled: { type: "boolean" }, verified: { type: "boolean" } } },
        },
    },
    Readiness: {
        type: "object",
        properties: {
            status: { type: "string", enum: ["ok", "unavailable"] },
            version: { type: "string" },
            checks: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    properties: { status: { type: "string", enum: ["ok", "unavailable"] }, latencyMs: { type: "integer" } },
                },
            },
        },
    },
    ActivityPage: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            data: {
                type: "object",
                properties: {
                    entries: { type: "array", items: { $ref: "#/components/schemas/ActivityEntry" } },
                    nextCursor: { type: ["string", "null"], description: "Pass as ?before= for the next (older) page" },
                },
            },
        },
    },
};

// ─── Paths ─────────────────────

const authPaths = {
    "/auth/signup": {
        post: {
            tags: ["Auth"],
            summary: "Create an account (sends a verification email)",
            security: publicRoute,
            requestBody: jsonBody({
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 6 },
                    age: { type: "integer", minimum: 0 },
                    timezone: { type: "string", example: "Africa/Lagos" },
                },
            }),
            responses: { 201: jsonResponse("Created — verify the email before signing in", messageEnvelope), ...errorResponses(400, 429, 502) },
        },
    },
    "/auth/verify-email/{token}": {
        get: {
            tags: ["Auth"],
            summary: "Verify an email address (idempotent)",
            security: publicRoute,
            parameters: [pathParam("token", "Token from the verification email")],
            responses: { 200: jsonResponse("Verified (or already verified)", messageEnvelope), ...errorResponses(400, 429) },
        },
    },
    "/auth/login": {
        post: {
            tags: ["Auth"],
            summary: "Sign in — sets the httpOnly afritask_session cookie",
            security: publicRoute,
            requestBody: jsonBody({
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string" }, password: { type: "string" } },
            }),
            responses: { 200: jsonResponse("Signed in", ref("UserResponse")), ...errorResponses(400, 401, 429) },
        },
    },
    "/auth/logout": {
        post: {
            tags: ["Auth"],
            summary: "End the current session",
            security: signedIn,
            responses: { 200: jsonResponse("Signed out", messageEnvelope), ...errorResponses(401) },
        },
    },
    "/auth/me": {
        get: {
            tags: ["Auth"],
            summary: "The signed-in user",
            security: signedIn,
            responses: { 200: jsonResponse("Current user", ref("UserResponse")), ...errorResponses(401) },
        },
    },
    "/auth/forgot-password": {
        post: {
            tags: ["Auth"],
            summary: "Email a reset link (same answer whether or not the account exists)",
            security: publicRoute,
            requestBody: jsonBody({ type: "object", required: ["email"], properties: { email: { type: "string" } } }),
            responses: { 200: jsonResponse("Request accepted", messageEnvelope), ...errorResponses(400, 429) },
        },
    },
    "/auth/reset-password/{token}": {
        patch: {
            tags: ["Auth"],
            summary: "Set a new password with a single-use link (signs out every device)",
            security: publicRoute,
            parameters: [pathParam("token", "Token from the reset email")],
            requestBody: jsonBody({ type: "object", required: ["password"], properties: { password: { type: "string", minLength: 6 } } }),
            responses: { 200: jsonResponse("Password reset", messageEnvelope), ...errorResponses(400, 429) },
        },
    },
    "/auth/google": {
        get: {
            tags: ["Auth"],
            summary: "Start Google sign-in (browser navigation, redirects to Google)",
            security: publicRoute,
            responses: { 302: { description: "Redirect to Google" }, 500: jsonResponse("Google OAuth not configured", ref("Error")) },
        },
    },
    "/auth/google/callback": {
        get: {
            tags: ["Auth"],
            summary: "Google redirects here; redirects on to the client's /auth/callback?code=…",
            security: publicRoute,
            responses: { 302: { description: "Redirect to the client with a one-time code (or ?error=google)" } },
        },
    },
    "/auth/google/exchange": {
        post: {
            tags: ["Auth"],
            summary: "Trade the one-time Google code for a session cookie",
            security: publicRoute,
            requestBody: jsonBody({ type: "object", required: ["code"], properties: { code: { type: "string" } } }),
            responses: { 200: jsonResponse("Signed in", ref("UserResponse")), ...errorResponses(400, 401, 429) },
        },
    },
};

const userPaths = {
    "/users/profile": {
        put: {
            tags: ["Users"],
            summary: "Update name, age, timezone and/or avatar",
            security: signedIn,
            requestBody: {
                content: {
                    "multipart/form-data": {
                        schema: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                age: { type: "integer" },
                                timezone: { type: "string" },
                                photo: { type: "string", format: "binary", description: "png/jpg/jpeg/gif, up to 5 MB" },
                            },
                        },
                    },
                    "application/json": {
                        schema: { type: "object", properties: { name: { type: "string" }, age: { type: ["integer", "null"] }, timezone: { type: "string" } } },
                    },
                },
            },
            responses: { 200: jsonResponse("Updated user", ref("UserResponse")), ...errorResponses(400, 401) },
        },
    },
    "/users/password": {
        put: {
            tags: ["Users"],
            summary: "Change password (signs out your other devices)",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                required: ["currentPassword", "newPassword"],
                properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 6 } },
            }),
            responses: { 200: jsonResponse("Password changed", messageEnvelope), ...errorResponses(400, 401) },
        },
    },
};

const workspacePaths = {
    "/workspaces": {
        get: {
            tags: ["Workspaces"],
            summary: "Workspaces I'm an active member of",
            security: signedIn,
            responses: { 200: jsonResponse("My workspaces", listEnvelope("workspaces", ref("WorkspaceSummary"))), ...errorResponses(401) },
        },
        post: {
            tags: ["Workspaces"],
            summary: "Create a workspace (you become its Owner)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 100 } } }),
            responses: { 201: jsonResponse("Created", dataEnvelope("workspace", ref("WorkspaceSummary"))), ...errorResponses(400, 401) },
        },
    },
    "/workspaces/{workspaceId}": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Workspaces"],
            summary: "Workspace details and active members",
            security: signedIn,
            responses: { 200: jsonResponse("Details", dataEnvelope("workspace", ref("WorkspaceDetails"))), ...errorResponses(401, 404) },
        },
        patch: {
            tags: ["Workspaces"],
            summary: "Rename (Owner only)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["name"], properties: { name: { type: "string" } } }),
            responses: { 200: jsonResponse("Renamed"), ...errorResponses(400, 401, 403, 404) },
        },
        delete: {
            tags: ["Workspaces"],
            summary: "Delete (Owner only). Permanent if only the Owner has records in it; otherwise a soft delete that closes it to everyone but keeps their work.",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["confirmName"], properties: { confirmName: { type: "string", description: "Must equal the workspace's name" } } }),
            responses: {
                200: jsonResponse("Deleted", dataEnvelope("mode", { type: "string", enum: ["permanent", "soft"] })),
                ...errorResponses(400, 401, 403, 404, 409),
            },
        },
    },
    "/workspaces/{workspaceId}/deletion-preview": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Workspaces"],
            summary: "What deleting would do (Owner only): permanent or soft, and why",
            security: signedIn,
            responses: {
                200: jsonResponse("Plan", {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        data: {
                            type: "object",
                            properties: {
                                mode: { type: "string", enum: ["permanent", "soft"] },
                                otherContributors: { type: "integer", description: "People other than the Owner with tasks, comments, projects or changes here" },
                                counts: { type: "object", properties: { tasks: { type: "integer" }, projects: { type: "integer" }, members: { type: "integer" } } },
                            },
                        },
                    },
                }),
                ...errorResponses(401, 403, 404),
            },
        },
    },
    "/workspaces/{workspaceId}/members/{membershipId}": {
        parameters: [workspaceIdParam, pathParam("membershipId", "Membership id")],
        patch: {
            tags: ["Members"],
            summary: "Change a role to admin or member (Owner only)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["role"], properties: { role: { type: "string", enum: ["admin", "member"] } } }),
            responses: { 200: jsonResponse("Role changed"), ...errorResponses(400, 401, 403, 404, 409) },
        },
        delete: {
            tags: ["Members"],
            summary: "Remove a member (Owner: anyone but the Owner; Admin: Members only). Their open tasks become unassigned.",
            security: signedIn,
            responses: { 200: jsonResponse("Removed", messageEnvelope), ...errorResponses(400, 401, 403, 404, 409) },
        },
    },
    "/workspaces/{workspaceId}/leave": {
        parameters: [workspaceIdParam],
        post: {
            tags: ["Members"],
            summary: "Leave the workspace (the Owner must transfer ownership first)",
            security: signedIn,
            responses: { 200: jsonResponse("Left", messageEnvelope), ...errorResponses(401, 404, 409) },
        },
    },
    "/workspaces/{workspaceId}/transfer-ownership": {
        parameters: [workspaceIdParam],
        post: {
            tags: ["Members"],
            summary: "Make another member the Owner; you become an Admin",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["membershipId"], properties: { membershipId: { type: "string", format: "uuid" } } }),
            responses: { 200: jsonResponse("Transferred", messageEnvelope), ...errorResponses(400, 401, 403, 404, 409) },
        },
    },
};

const taskPaths = {
    "/workspaces/{workspaceId}/tasks": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Tasks"],
            summary: "A workspace's tasks (archived projects' tasks left out unless filtered by projectId)",
            security: signedIn,
            parameters: [
                { name: "q", in: "query", schema: { type: "string", maxLength: 200 }, description: "Search task titles, descriptions and project names (case-insensitive). Includes matching subtasks, with `parent`." },
                { name: "status", in: "query", schema: { type: "string" }, description: "One or more statuses, comma-separated or repeated (OR)" },
                { name: "priority", in: "query", schema: { type: "string" }, description: "One or more priorities (OR)" },
                { name: "projectId", in: "query", schema: { type: "string" }, description: "Project ids and/or `none` (OR). Without it, archived projects' tasks are left out." },
                { name: "assignee", in: "query", schema: { type: "string" }, description: "`me`, `none` and/or membership ids (OR). Filtering by assignee also returns their subtasks (with `parent`)." },
                { name: "labelId", in: "query", schema: { type: "string" }, description: "One or more label ids (OR)" },
                { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
                { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 }, description: "Page size; enables `data.pagination`. Without it, every match is returned." },
                { name: "includeSubtasks", in: "query", schema: { type: "boolean" }, description: "Lists show top-level tasks only unless true" },
                { name: "sort", in: "query", schema: { type: "string", example: "-createdAt,title" } },
                {
                    name: "due",
                    in: "query",
                    schema: { type: "string", enum: ["open", "today", "upcoming", "overdue", "none", "completed", "week", "scheduled"] },
                    description:
                        "My Tasks views, in your profile timezone. `today` = your local date (an item due earlier today is also `overdue`); `overdue` = open and past its due instant; `none` = open without a due date; `week` = completed since Monday; `scheduled` = open with a start date still ahead.",
                },
                { name: "counts", in: "query", schema: { type: "boolean" }, description: "Also return `data.counts`: the size of every `due` view under the same other filters" },
            ],
            responses: {
                200: jsonResponse("Tasks", {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        results: { type: "integer" },
                        data: {
                            type: "object",
                            properties: {
                                tasks: { type: "array", items: ref("Task") },
                                counts: { type: "object", additionalProperties: { type: "integer" }, description: "Only with counts=true" },
                                pagination: {
                                    type: "object",
                                    description: "Only with limit/page",
                                    properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } },
                                },
                            },
                        },
                    },
                }),
                ...errorResponses(400, 401, 404),
            },
        },
        post: {
            tags: ["Tasks"],
            summary: "Create a task (only title is required)",
            security: signedIn,
            requestBody: jsonBody({
                allOf: [
                    ref("TaskWrite"),
                    {
                        type: "object",
                        required: ["title"],
                        properties: { clientRequestId: { type: "string", maxLength: 100, description: "Idempotency key: a repeat returns the first task (200)" } },
                    },
                ],
            }),
            responses: {
                201: jsonResponse("Created", dataEnvelope("task", ref("Task"))),
                200: jsonResponse("Already created with this clientRequestId", dataEnvelope("task", ref("Task"))),
                ...errorResponses(400, 401, 404, 409),
            },
        },
    },
    "/tasks/{id}": {
        parameters: [pathParam("id", "Task id")],
        get: {
            tags: ["Tasks"],
            summary: "One task",
            security: signedIn,
            responses: { 200: jsonResponse("Task", dataEnvelope("task", ref("Task"))), ...errorResponses(400, 401, 404) },
        },
        put: {
            tags: ["Tasks"],
            summary: "Edit a task — requires the version you last read",
            security: signedIn,
            requestBody: jsonBody({
                allOf: [ref("TaskWrite"), { type: "object", required: ["version"], properties: { version: { type: "integer" } } }],
            }),
            responses: { 200: jsonResponse("Updated", dataEnvelope("task", ref("Task"))), ...errorResponses(400, 401, 403, 404, 409) },
        },
        delete: {
            tags: ["Tasks"],
            summary: "Delete (Owner/Admin, or the task's creator)",
            security: signedIn,
            responses: { 204: { description: "Deleted" }, ...errorResponses(400, 401, 403, 404, 409) },
        },
    },
    "/tasks/{id}/status": {
        parameters: [pathParam("id", "Task id")],
        patch: {
            tags: ["Tasks"],
            summary: "Change only the status — requires the version you last read",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                required: ["status", "version"],
                properties: { status: ref("TaskStatus"), version: { type: "integer" } },
            }),
            responses: { 200: jsonResponse("Updated", dataEnvelope("task", ref("Task"))), ...errorResponses(400, 401, 403, 404, 409) },
        },
    },
};

const subtaskPaths = {
    "/tasks/{id}/subtasks": {
        parameters: [pathParam("id", "Parent task id (must be top-level)")],
        post: {
            tags: ["Tasks"],
            summary: "Add a subtask (one level only; inherits the parent's workspace and project)",
            security: signedIn,
            requestBody: jsonBody({ allOf: [ref("TaskWrite"), { type: "object", required: ["title"] }] }),
            responses: { 201: jsonResponse("Created", dataEnvelope("task", ref("Task"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
};

const labelPaths = {
    "/workspaces/{workspaceId}/labels": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Labels"],
            summary: "The workspace's labels with how many tasks use each",
            security: signedIn,
            responses: { 200: jsonResponse("Labels", listEnvelope("labels", ref("Label"))), ...errorResponses(401, 404) },
        },
        post: {
            tags: ["Labels"],
            summary: "Create a label (Owner/Admin; names unique per workspace ignoring case)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["name"], properties: { name: { type: "string", maxLength: 40 }, color: { type: "string" } } }),
            responses: { 201: jsonResponse("Created", dataEnvelope("label", ref("Label"))), ...errorResponses(400, 401, 403, 404, 409) },
        },
    },
    "/labels/{labelId}": {
        parameters: [pathParam("labelId", "Label id")],
        patch: {
            tags: ["Labels"],
            summary: "Rename or recolor (Owner/Admin)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", properties: { name: { type: "string" }, color: { type: "string" } } }),
            responses: { 200: jsonResponse("Updated", dataEnvelope("label", ref("Label"))), ...errorResponses(400, 401, 403, 404, 409) },
        },
        delete: {
            tags: ["Labels"],
            summary: "Delete (removes it from tasks; never deletes tasks)",
            security: signedIn,
            responses: { 204: { description: "Deleted" }, ...errorResponses(401, 403, 404) },
        },
    },
};

const projectPaths = {
    "/workspaces/{workspaceId}/projects": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Projects"],
            summary: "A workspace's projects with task counts",
            security: signedIn,
            parameters: [{ name: "includeArchived", in: "query", schema: { type: "boolean" } }, { name: "q", in: "query", schema: { type: "string" }, description: "Search project names" }],
            responses: { 200: jsonResponse("Projects", listEnvelope("projects", ref("Project"))), ...errorResponses(401, 404) },
        },
        post: {
            tags: ["Projects"],
            summary: "Create a project (Owner/Admin)",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                required: ["name"],
                properties: { name: { type: "string", maxLength: 100 }, description: { type: "string" } },
            }),
            responses: { 201: jsonResponse("Created", dataEnvelope("project", ref("Project"))), ...errorResponses(400, 401, 403, 404) },
        },
    },
    "/projects/{projectId}": {
        parameters: [pathParam("projectId", "Project id")],
        get: {
            tags: ["Projects"],
            summary: "One project",
            security: signedIn,
            responses: { 200: jsonResponse("Project", dataEnvelope("project", ref("Project"))), ...errorResponses(401, 404) },
        },
        patch: {
            tags: ["Projects"],
            summary: "Edit name/description/state (Owner/Admin). Completing never completes its tasks.",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    state: { type: "string", enum: ["active", "on_hold", "completed"] },
                },
            }),
            responses: { 200: jsonResponse("Updated", dataEnvelope("project", ref("Project"))), ...errorResponses(400, 401, 403, 404, 409) },
        },
    },
    "/projects/{projectId}/archive": {
        parameters: [pathParam("projectId", "Project id")],
        post: {
            tags: ["Projects"],
            summary: "Archive — read-only, its reminders pause",
            security: signedIn,
            responses: { 200: jsonResponse("Archived", messageEnvelope), ...errorResponses(401, 403, 404, 409) },
        },
    },
    "/projects/{projectId}/restore": {
        parameters: [pathParam("projectId", "Project id")],
        post: {
            tags: ["Projects"],
            summary: "Restore to the state it had before archiving",
            security: signedIn,
            responses: { 200: jsonResponse("Restored", dataEnvelope("project", ref("Project"))), ...errorResponses(401, 403, 404, 409) },
        },
    },
};

const invitationPaths = {
    "/workspaces/{workspaceId}/invitations": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Invitations"],
            summary: "Pending invitations (Owner/Admin)",
            security: signedIn,
            responses: { 200: jsonResponse("Invitations", listEnvelope("invitations", ref("Invitation"))), ...errorResponses(401, 403, 404) },
        },
        post: {
            tags: ["Invitations"],
            summary: "Invite by email (Owner: admin|member, Admin: member)",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" }, role: { type: "string", enum: ["admin", "member"], default: "member" } },
            }),
            responses: { 201: jsonResponse("Invited (check deliveryStatus)", dataEnvelope("invitation", ref("Invitation"))), ...errorResponses(400, 401, 403, 404, 409, 429) },
        },
    },
    "/invitations/preview/{token}": {
        get: {
            tags: ["Invitations"],
            summary: "What an emailed invitation link points at (public)",
            security: publicRoute,
            parameters: [pathParam("token", "Token from the invitation email")],
            responses: { 200: jsonResponse("Invitation", dataEnvelope("invitation", ref("Invitation"))), ...errorResponses(404, 429) },
        },
    },
    "/invitations/mine": {
        get: {
            tags: ["Invitations"],
            summary: "Pending invitations addressed to my email",
            security: signedIn,
            responses: { 200: jsonResponse("Invitations", listEnvelope("invitations", ref("Invitation"))), ...errorResponses(401) },
        },
    },
    "/invitations/accept": {
        post: {
            tags: ["Invitations"],
            summary: "Accept (must be signed in as the invited email)",
            security: signedIn,
            requestBody: jsonBody(ref("InvitationReference")),
            responses: {
                200: jsonResponse("Joined", {
                    type: "object",
                    properties: { status: { type: "string" }, data: { type: "object", properties: { workspaceId: { type: "string" }, role: ref("WorkspaceRole") } } },
                }),
                ...errorResponses(400, 401, 403, 404, 409, 410),
            },
        },
    },
    "/invitations/decline": {
        post: {
            tags: ["Invitations"],
            summary: "Decline",
            security: signedIn,
            requestBody: jsonBody(ref("InvitationReference")),
            responses: { 200: jsonResponse("Declined", messageEnvelope), ...errorResponses(400, 401, 403, 404, 409, 410) },
        },
    },
    "/invitations/{invitationId}/resend": {
        parameters: [pathParam("invitationId", "Invitation id")],
        post: {
            tags: ["Invitations"],
            summary: "Resend with a new link (old links stop working)",
            security: signedIn,
            responses: { 200: jsonResponse("Resent", dataEnvelope("invitation", ref("Invitation"))), ...errorResponses(401, 403, 404, 409, 429) },
        },
    },
    "/invitations/{invitationId}/revoke": {
        parameters: [pathParam("invitationId", "Invitation id")],
        post: {
            tags: ["Invitations"],
            summary: "Withdraw an invitation",
            security: signedIn,
            responses: { 200: jsonResponse("Revoked", messageEnvelope), ...errorResponses(401, 403, 404, 409) },
        },
    },
};

const commentPaths = {
    "/tasks/{id}/comments": {
        parameters: [pathParam("id", "Task id")],
        get: {
            tags: ["Comments"],
            summary: "A task's comments, oldest first",
            security: signedIn,
            responses: { 200: jsonResponse("Comments", listEnvelope("comments", ref("Comment"))), ...errorResponses(400, 401, 404) },
        },
        post: {
            tags: ["Comments"],
            summary: "Comment on a task (any active member; not in archived projects)",
            security: signedIn,
            requestBody: jsonBody(ref("CommentWrite")),
            responses: { 201: jsonResponse("Created", dataEnvelope("comment", ref("Comment"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
    "/comments/{commentId}": {
        parameters: [pathParam("commentId", "Comment id")],
        patch: {
            tags: ["Comments"],
            summary: "Edit your own comment (shows an edited marker)",
            security: signedIn,
            requestBody: jsonBody(ref("CommentWrite")),
            responses: { 200: jsonResponse("Updated", dataEnvelope("comment", ref("Comment"))), ...errorResponses(400, 401, 403, 404, 409) },
        },
        delete: {
            tags: ["Comments"],
            summary: "Delete your own comment, or anyone's as Owner/Admin (attribution kept)",
            security: signedIn,
            responses: { 200: jsonResponse("Deleted", dataEnvelope("comment", ref("Comment"))), ...errorResponses(401, 403, 404, 409) },
        },
    },
};

const notificationPaths = {
    "/notifications": {
        get: {
            tags: ["Notifications"],
            summary: "My notifications across all my workspaces, newest first",
            security: signedIn,
            parameters: [
                { name: "unread", in: "query", schema: { type: "boolean" } },
                { name: "limit", in: "query", schema: { type: "integer", default: 30, maximum: 100 } },
                { name: "before", in: "query", description: "nextCursor from the previous page", schema: { type: "string", format: "uuid" } },
            ],
            responses: {
                200: jsonResponse("Notifications", {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        data: {
                            type: "object",
                            properties: {
                                notifications: { type: "array", items: ref("Notification") },
                                nextCursor: { type: ["string", "null"] },
                                unreadCount: { type: "integer" },
                            },
                        },
                    },
                }),
                ...errorResponses(401),
            },
        },
    },
    "/notifications/unread-count": {
        get: {
            tags: ["Notifications"],
            summary: "Unread count for the bell badge",
            security: signedIn,
            responses: { 200: jsonResponse("Count", ref("UnreadCount")), ...errorResponses(401) },
        },
    },
    "/notifications/read-all": {
        post: {
            tags: ["Notifications"],
            summary: "Mark all my notifications read",
            security: signedIn,
            responses: { 200: jsonResponse("Marked", ref("UnreadCount")), ...errorResponses(401) },
        },
    },
    "/notifications/{notificationId}/read": {
        parameters: [pathParam("notificationId", "Notification id")],
        post: {
            tags: ["Notifications"],
            summary: "Mark one notification read (keeps the first read time)",
            security: signedIn,
            responses: { 200: jsonResponse("Marked", ref("UnreadCount")), ...errorResponses(401, 404) },
        },
    },
};

const dashboardPaths = {
    "/workspaces/{workspaceId}/dashboard": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Workspaces"],
            summary: "Dashboard counts. Personal = assigned to you (subtasks included); workspace/projects = top-level tasks; archived projects excluded; week = since Monday in your timezone",
            security: signedIn,
            responses: {
                200: jsonResponse("Counts", {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        data: {
                            type: "object",
                            properties: {
                                generatedAt: { type: "string", format: "date-time" },
                                timezone: { type: "string" },
                                personal: {
                                    type: "object",
                                    description: "Links: ?assignee=me&due=today | due=overdue | status=in_progress | due=week",
                                    properties: { dueToday: { type: "integer" }, overdue: { type: "integer" }, inProgress: { type: "integer" }, completedThisWeek: { type: "integer" } },
                                },
                                workspace: {
                                    type: "object",
                                    properties: { open: { type: "integer" }, completed: { type: "integer" }, overdue: { type: "integer" }, activeProjects: { type: "integer" } },
                                },
                                projects: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string" },
                                            name: { type: "string" },
                                            state: ref("ProjectState"),
                                            total: { type: "integer" },
                                            completed: { type: "integer" },
                                            open: { type: "integer" },
                                            percentComplete: { type: ["integer", "null"], description: "null for a project with no tasks" },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
                ...errorResponses(401, 404),
            },
        },
    },
};

// ─── Admin console (Platform Superadmin) ─────────────────────
// Separate sign-in and cookie (afritask_operator_session, Path=/api/admin). Customer
// sessions are never accepted here, and operator sessions never work on customer routes.
const operatorSession = [{ operatorCookie: [] }];
const operatorEnvelope = dataEnvelope("operator", ref("Operator"));

const adminAuthPaths = {
    "/admin/auth/login": {
        post: {
            tags: ["Admin"],
            summary: "Step 1: password. Starts an operator session that can only complete MFA. Same 401 for every failure.",
            security: publicRoute,
            requestBody: jsonBody({ type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } }),
            responses: {
                200: jsonResponse("Password accepted", {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        data: { type: "object", properties: { operator: ref("Operator"), next: { type: "string", enum: ["mfa_setup", "mfa_verify"] } } },
                    },
                }),
                ...errorResponses(400, 401, 429),
            },
        },
    },
    "/admin/auth/mfa/setup": {
        post: {
            tags: ["Admin"],
            summary: "First sign-in only: a new authenticator secret (refused once MFA is set up)",
            security: operatorSession,
            responses: {
                200: jsonResponse("Secret", dataEnvelope("secret", { type: "string" })),
                ...errorResponses(401, 409),
            },
        },
    },
    "/admin/auth/mfa/verify": {
        post: {
            tags: ["Admin"],
            summary: "Step 2: a current 6-digit code. A used code can't be replayed.",
            security: operatorSession,
            requestBody: jsonBody({ type: "object", required: ["code"], properties: { code: { type: "string", pattern: "^\d{6}$" } } }),
            responses: { 200: jsonResponse("Signed in", operatorEnvelope), ...errorResponses(401, 409, 429) },
        },
    },
    "/admin/auth/me": {
        get: {
            tags: ["Admin"],
            summary: "The signed-in operator and their MFA state",
            security: operatorSession,
            responses: { 200: jsonResponse("Operator", operatorEnvelope), ...errorResponses(401) },
        },
    },
    "/admin/auth/logout": {
        post: {
            tags: ["Admin"],
            summary: "End the console session",
            security: operatorSession,
            responses: { 200: jsonResponse("Signed out", messageEnvelope), ...errorResponses(401) },
        },
    },
};

const reasonBody = jsonBody({
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 5, maxLength: 500, description: "Kept in the audit trail" } },
});
const pagingParams = [
    { name: "q", in: "query", schema: { type: "string" }, description: "Name or email (accounts) / name (workspaces), or an exact id" },
    { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
];
const pageEnvelope = (itemSchema: SchemaRef) => ({
    type: "object",
    properties: {
        status: { type: "string" },
        data: {
            type: "object",
            properties: {
                items: { type: "array", items: itemSchema },
                pagination: { type: "object", properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } },
            },
        },
    },
});

// Directory (SRS SR17): metadata only — never a workspace's projects, tasks or comments.
const adminDirectoryPaths = {
    "/admin/accounts": {
        get: {
            tags: ["Admin"],
            summary: "Search accounts by name, email or id",
            security: operatorSession,
            parameters: [...pagingParams, { name: "status", in: "query", schema: { type: "string", enum: ["active", "suspended"] } }],
            responses: { 200: jsonResponse("Accounts", pageEnvelope(ref("AdminAccount"))), ...errorResponses(400, 401) },
        },
    },
    "/admin/accounts/{accountId}": {
        parameters: [pathParam("accountId", "Account id")],
        get: {
            tags: ["Admin"],
            summary: "An account with its membership metadata",
            security: operatorSession,
            responses: { 200: jsonResponse("Account", dataEnvelope("account", ref("AdminAccount"))), ...errorResponses(401, 404) },
        },
    },
    "/admin/accounts/{accountId}/suspend": {
        parameters: [pathParam("accountId", "Account id")],
        post: {
            tags: ["Admin"],
            summary: "Suspend: signs them out everywhere and blocks sign-in; ownership and assignments stay",
            security: operatorSession,
            requestBody: reasonBody,
            responses: { 200: jsonResponse("Suspended", dataEnvelope("account", ref("AdminAccount"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
    "/admin/accounts/{accountId}/restore": {
        parameters: [pathParam("accountId", "Account id")],
        post: {
            tags: ["Admin"],
            summary: "Restore: they can sign in again (fresh login)",
            security: operatorSession,
            requestBody: reasonBody,
            responses: { 200: jsonResponse("Restored", dataEnvelope("account", ref("AdminAccount"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
    "/admin/workspaces": {
        get: {
            tags: ["Admin"],
            summary: "Search workspaces by name or id",
            security: operatorSession,
            parameters: [...pagingParams, { name: "status", in: "query", schema: { type: "string", enum: ["active", "suspended", "deleted"] } }],
            responses: { 200: jsonResponse("Workspaces", pageEnvelope(ref("AdminWorkspace"))), ...errorResponses(400, 401) },
        },
    },
    "/admin/workspaces/{workspaceId}": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Admin"],
            summary: "A workspace's owner, size and state (counts only)",
            security: operatorSession,
            responses: { 200: jsonResponse("Workspace", dataEnvelope("workspace", ref("AdminWorkspace"))), ...errorResponses(401, 404) },
        },
    },
    "/admin/workspaces/{workspaceId}/suspend": {
        parameters: [workspaceIdParam],
        post: {
            tags: ["Admin"],
            summary: "Suspend: members can't read, change or join it; reminders pause",
            security: operatorSession,
            requestBody: reasonBody,
            responses: { 200: jsonResponse("Suspended", dataEnvelope("workspace", ref("AdminWorkspace"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
    "/admin/workspaces/{workspaceId}/restore": {
        parameters: [workspaceIdParam],
        post: {
            tags: ["Admin"],
            summary: "Restore: access returns; reminders re-planned for future times only",
            security: operatorSession,
            requestBody: reasonBody,
            responses: { 200: jsonResponse("Restored", dataEnvelope("workspace", ref("AdminWorkspace"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
};

// Operations (SRS SR18). Failure details are sanitised provider errors — never task content.
const adminOperationsPaths = {
    "/admin/operations/health": {
        get: {
            tags: ["Admin"],
            summary: "Dependency checks, reminder-queue depth and delivery counts",
            security: operatorSession,
            responses: {
                200: jsonResponse("Health", {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        data: {
                            allOf: [
                                ref("Readiness"),
                                {
                                    type: "object",
                                    properties: {
                                        queues: { type: "object", description: "Omitted when Redis is unreachable", additionalProperties: { type: "object" } },
                                        deliveries: { type: "object", properties: { failed: { type: "integer" }, pending: { type: "integer" } } },
                                    },
                                },
                            ],
                        },
                    },
                }),
                ...errorResponses(401),
            },
        },
    },
    "/admin/deliveries": {
        get: {
            tags: ["Admin"],
            summary: "Reminder/overdue email deliveries, newest first",
            security: operatorSession,
            parameters: [
                { name: "status", in: "query", schema: { type: "string", enum: ["pending", "sent", "failed", "suppressed"] } },
                { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
                { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            ],
            responses: { 200: jsonResponse("Deliveries", pageEnvelope(ref("AdminDelivery"))), ...errorResponses(400, 401) },
        },
    },
    "/admin/deliveries/{deliveryId}/retry": {
        parameters: [pathParam("deliveryId", "Delivery id")],
        post: {
            tags: ["Admin"],
            summary: "Retry a failed delivery (same identity; re-checks the task and recipient first — may be suppressed instead)",
            security: operatorSession,
            requestBody: reasonBody,
            responses: {
                200: jsonResponse("Retried", {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        data: { type: "object", properties: { delivery: ref("AdminDelivery"), outcome: { type: "string", enum: ["sent", "failed", "suppressed"] } } },
                    },
                }),
                ...errorResponses(400, 401, 404, 409),
            },
        },
    },
    "/admin/audit": {
        get: {
            tags: ["Admin"],
            summary: "Operator audit trail, newest first (read-only)",
            security: operatorSession,
            parameters: [
                { name: "action", in: "query", schema: { type: "string" } },
                { name: "targetId", in: "query", schema: { type: "string", format: "uuid" } },
                { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
                { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            ],
            responses: { 200: jsonResponse("Audit", pageEnvelope(ref("AdminAuditEntry"))), ...errorResponses(400, 401) },
        },
    },
};

const healthPaths = {
    "/health": {
        get: {
            tags: ["Health"],
            summary: "Liveness: the process is up (never checks dependencies)",
            security: publicRoute,
            responses: {
                200: jsonResponse("Alive", {
                    type: "object",
                    properties: { status: { type: "string", example: "ok" }, version: { type: "string" }, uptimeSeconds: { type: "integer" } },
                }),
            },
        },
    },
    "/health/ready": {
        get: {
            tags: ["Health"],
            summary: "Readiness: PostgreSQL and Redis both answer (503 if not)",
            security: publicRoute,
            responses: {
                200: jsonResponse("Ready", ref("Readiness")),
                503: jsonResponse("A dependency is unavailable", ref("Readiness")),
            },
        },
    },
};

const activityPageParams = [
    { name: "limit", in: "query", schema: { type: "integer", default: 30, maximum: 100 } },
    { name: "before", in: "query", description: "nextCursor from the previous page", schema: { type: "string", format: "uuid" } },
];

const activityPaths = {
    "/tasks/{id}/activity": {
        parameters: [pathParam("id", "Task id")],
        get: {
            tags: ["Activity"],
            summary: "A task's history, newest first (subtask additions/deletions included)",
            security: signedIn,
            parameters: activityPageParams,
            responses: { 200: jsonResponse("History", ref("ActivityPage")), ...errorResponses(400, 401, 404) },
        },
    },
    "/workspaces/{workspaceId}/activity": {
        parameters: [workspaceIdParam],
        get: {
            tags: ["Activity"],
            summary: "The workspace's history, or one project's with ?projectId=",
            security: signedIn,
            parameters: [{ name: "projectId", in: "query", schema: { type: "string", format: "uuid" } }, ...activityPageParams],
            responses: { 200: jsonResponse("History", ref("ActivityPage")), ...errorResponses(401, 404) },
        },
    },
};

// operationId for every operation, derived from method + path, e.g.
// POST /workspaces/{workspaceId}/tasks → postWorkspacesByWorkspaceIdTasks. Generated
// clients use these as method names; deriving them means a new route can't forget one.
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const toOperationId = (method: string, path: string) =>
    method +
    path
        .split("/")
        .filter(Boolean)
        .map((segment) => {
            const isParam = segment.startsWith("{");
            const words = segment.replace(/[{}]/g, "").split(/[-_]/);
            const pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
            return isParam ? `By${pascal}` : pascal;
        })
        .join("");

function withOperationIds<T extends Record<string, Record<string, unknown>>>(paths: T): T {
    for (const [path, pathItem] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (HTTP_METHODS.has(method) && typeof operation === "object" && operation !== null) {
                (operation as { operationId?: string }).operationId ??= toOperationId(method, path);
            }
        }
    }
    return paths;
}

const openApiDocument = {
    openapi: "3.1.0",
    info: {
        title: "Afritask API",
        version: "1.0.0",
        description: [
            "Workspaces, projects, tasks and invitations for Afritask.",
            "",
            "**Auth:** sign in with `POST /auth/login` — the response sets an httpOnly `afritask_session` cookie that this page then sends automatically.",
            "**CSRF:** every POST/PUT/PATCH/DELETE must send `X-Requested-With: XMLHttpRequest`. This page adds it for you.",
            "**Isolation:** anything in a workspace you're not an active member of answers `404`, exactly like something that doesn't exist.",
        ].join("\n"),
    },
    servers: [{ url: "/api" }],
    tags: [
        { name: "Auth", description: "Sign-up, email verification, sessions, password recovery and Google sign-in" },
        { name: "Users", description: "Your own profile and password" },
        { name: "Workspaces", description: "Workspaces you belong to; every task and project lives in one" },
        { name: "Members", description: "Roles, removal, leaving and ownership transfer" },
        { name: "Invitations", description: "Inviting people by email and responding to invitations" },
        { name: "Projects", description: "Groups of related tasks inside a workspace" },
        { name: "Tasks", description: "Tasks and subtasks: status, priority, assignee, due dates, labels, versioned updates" },
        { name: "Labels", description: "Workspace labels for tagging tasks" },
        { name: "Comments", description: "Discussion on tasks, with @mentions of workspace members" },
        { name: "Notifications", description: "In-app notifications: assignments, mentions and invitations" },
        { name: "Admin", description: "Admin console (Platform Superadmin): its own sign-in with MFA" },
        { name: "Health", description: "Liveness and readiness probes for hosts and load balancers" },
        { name: "Activity", description: "Read-only history: who changed what, with before/after values" },
    ],
    security: signedIn,
    components: {
        securitySchemes: {
            sessionCookie: { type: "apiKey", in: "cookie", name: "afritask_session", description: "Set by POST /auth/login" },
            operatorCookie: { type: "apiKey", in: "cookie", name: "afritask_operator_session", description: "Set by POST /admin/auth/login; sent only to /api/admin" },
        },
        schemas,
    },
    paths: withOperationIds({ ...authPaths, ...userPaths, ...workspacePaths, ...invitationPaths, ...projectPaths, ...labelPaths, ...taskPaths, ...subtaskPaths, ...commentPaths, ...notificationPaths, ...activityPaths, ...dashboardPaths, ...healthPaths, ...adminAuthPaths, ...adminDirectoryPaths, ...adminOperationsPaths }),
};

export default openApiDocument;
