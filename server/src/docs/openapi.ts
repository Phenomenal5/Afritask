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
                { name: "status", in: "query", schema: ref("TaskStatus") },
                { name: "priority", in: "query", schema: ref("TaskPriority") },
                { name: "projectId", in: "query", schema: { type: "string" }, description: "A project id, or `none`" },
                { name: "assignee", in: "query", schema: { type: "string" }, description: "`me`, `none`, or a membership id. Filtering by assignee also returns their subtasks (with `parent`)." },
                { name: "labelId", in: "query", schema: { type: "string" } },
                { name: "includeSubtasks", in: "query", schema: { type: "boolean" }, description: "Lists show top-level tasks only unless true" },
                { name: "sort", in: "query", schema: { type: "string", example: "-createdAt,title" } },
            ],
            responses: { 200: jsonResponse("Tasks", listEnvelope("tasks", ref("Task"))), ...errorResponses(400, 401, 404) },
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
            parameters: [{ name: "includeArchived", in: "query", schema: { type: "boolean" } }],
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
    ],
    security: signedIn,
    components: {
        securitySchemes: {
            sessionCookie: { type: "apiKey", in: "cookie", name: "afritask_session", description: "Set by POST /auth/login" },
        },
        schemas,
    },
    paths: withOperationIds({ ...authPaths, ...userPaths, ...workspacePaths, ...invitationPaths, ...projectPaths, ...labelPaths, ...taskPaths, ...subtaskPaths }),
};

export default openApiDocument;
