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
        404: "Not found. Also returned for resources in workspaces you're not a member of",
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
        description: "A user as the API returns it. Passwords and tokens are never included.",
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
            completionNote: { type: ["string", "null"], description: "What was done. Set when the task is completed; null once it's reopened" },
            originalDueAt: { type: ["string", "null"], format: "date-time", description: "The first due date the task was given" },
            dueExtensionCount: { type: "integer", description: "How many times the due date was moved later" },
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
            "Send dueDate (YYYY-MM-DD, meaning due at 23:59 that day in dueTimezone, which defaults to your profile timezone) OR dueAt (exact ISO instant); null clears. Legacy `deadline` and statuses `pending`/`in progress` are still accepted.",
        properties: {
            completionNote: { type: "string", maxLength: 2000, description: "With status \"completed\": what was done (required for top-level tasks). On a completed task: corrects the note." },
            dueChangeReason: { type: "string", maxLength: 500, description: "Optional: why the due date is moving later. Only used when dueDate/dueAt extends an existing deadline." },
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
            startDate: { type: ["string", "null"], format: "date", description: "Planned start (YYYY-MM-DD, meaning 00:00 that day in startTimezone). Can't be after the due date. null clears." },
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
    NewsletterPost: {
        type: "object",
        description: "A published post as the public feed shows it. body is plain text; blank lines separate paragraphs.",
        properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            summary: { type: "string" },
            body: { type: "string" },
            publishedAt: { type: "string", format: "date-time" },
        },
    },
    AdminNewsletterPost: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            summary: { type: "string" },
            body: { type: "string" },
            status: { type: "string", enum: ["draft", "published"] },
            publishedAt: { type: ["string", "null"], format: "date-time" },
            emailRequested: { type: "boolean" },
            emailCompletedAt: { type: ["string", "null"], format: "date-time", description: "Set once every subscriber batch has gone out" },
            author: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
            _count: { type: "object", properties: { deliveries: { type: "integer", description: "Emails sent so far" } } },
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
            timezone: { type: "string" },
            // Detail only: false for an account created in the console that hasn't set one yet.
            hasPassword: { type: "boolean" },
            isVerified: { type: "boolean" },
            status: { type: "string", enum: ["active", "suspended"] },
            createdAt: { type: "string", format: "date-time" },
            workspaceCount: { type: "integer" },
            suspendedAt: { type: ["string", "null"], format: "date-time", description: "Detail only" },
            suspendReason: { type: ["string", "null"], description: "Detail only" },
            memberships: {
                type: "array",
                description: "Detail only: metadata, never workspace content",
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
                required: ["name", "email", "password", "acceptTerms"],
                properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 6 },
                    acceptTerms: { type: "boolean", enum: [true], description: "Must be true. It means the user agrees to the Terms of Service and Privacy Policy" },
                    age: { type: "integer", minimum: 0 },
                    timezone: { type: "string", example: "Africa/Lagos" },
                },
            }),
            responses: { 201: jsonResponse("Created. Verify the email before signing in", messageEnvelope), ...errorResponses(400, 429, 502) },
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
            summary: "Sign in and set the httpOnly access and refresh token cookies",
            security: publicRoute,
            requestBody: jsonBody({
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string" }, password: { type: "string" } },
            }),
            responses: { 200: jsonResponse("Signed in", ref("UserResponse")), ...errorResponses(400, 401, 429) },
        },
    },
    "/auth/refresh": {
        post: {
            tags: ["Auth"],
            summary: "New access token from the refresh-token cookie (rotates the refresh token)",
            security: publicRoute,
            responses: { 200: jsonResponse("Refreshed, with new cookies set", messageEnvelope), ...errorResponses(401) },
        },
    },
    "/auth/logout": {
        post: {
            tags: ["Auth"],
            summary: "End the current session and revoke its refresh token in the database",
            security: publicRoute,
            responses: { 200: jsonResponse("Signed out", messageEnvelope) },
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
    "/auth/accept-terms": {
        post: {
            tags: ["Auth"],
            summary: "Accept the current Terms of Service and Privacy Policy",
            description: "Until accepted, every signed-in route outside /auth and /users answers 403 with code \"terms_required\".",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["acceptTerms"], properties: { acceptTerms: { type: "boolean", enum: [true] } } }),
            responses: { 200: jsonResponse("Accepted", ref("UserResponse")), ...errorResponses(400, 401) },
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
            summary: "Google redirects here; then redirects on to the client's /auth/callback with a code",
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
            summary: "Edit a task (send the version you last read)",
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
            summary: "Change only the status (send the version you last read)",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                required: ["status", "version"],
                properties: {
                    status: ref("TaskStatus"),
                    version: { type: "integer" },
                    completionNote: { type: "string", maxLength: 2000, description: "Required when completing a top-level task (400 code completion_note_required); optional for subtasks" },
                },
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
            summary: "Archive: the project becomes read-only and its reminders pause",
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

const notificationPreferencesSchema = {
    type: "object",
    properties: { soundEnabled: { type: "boolean" }, pushEnabled: { type: "boolean" }, pushAvailable: { type: "boolean" } },
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
    "/notifications/preferences": {
        get: {
            tags: ["Notifications"],
            summary: "Sound and web push settings (pushAvailable: false when the server has no VAPID keys)",
            security: signedIn,
            responses: { 200: jsonResponse("Preferences", dataEnvelope("preferences", notificationPreferencesSchema)), ...errorResponses(401) },
        },
        put: {
            tags: ["Notifications"],
            summary: "Change sound / web push. Turning push off removes this account's push subscriptions.",
            security: signedIn,
            requestBody: jsonBody({ type: "object", properties: { soundEnabled: { type: "boolean" }, pushEnabled: { type: "boolean" } } }),
            responses: { 200: jsonResponse("Saved", dataEnvelope("preferences", notificationPreferencesSchema)), ...errorResponses(400, 401, 409) },
        },
    },
    "/notifications/push/public-key": {
        get: {
            tags: ["Notifications"],
            summary: "The VAPID public key browsers subscribe with (404 when push isn't configured)",
            security: signedIn,
            responses: { 200: jsonResponse("Key", dataEnvelope("publicKey", { type: "string" })), ...errorResponses(401, 404) },
        },
    },
    "/notifications/push/subscriptions": {
        post: {
            tags: ["Notifications"],
            summary: "Register this browser for web push (its PushSubscription.toJSON())",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                required: ["endpoint", "keys"],
                properties: {
                    endpoint: { type: "string", format: "uri", description: "https push service URL" },
                    keys: { type: "object", required: ["p256dh", "auth"], properties: { p256dh: { type: "string" }, auth: { type: "string" } } },
                },
            }),
            responses: { 201: jsonResponse("Saved", messageEnvelope), ...errorResponses(400, 401) },
        },
        delete: {
            tags: ["Notifications"],
            summary: "Stop web push to this browser (e.g. when signing out)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["endpoint"], properties: { endpoint: { type: "string" } } }),
            responses: { 204: jsonResponse("Removed"), ...errorResponses(400, 401) },
        },
    },
};

const eventsPaths = {
    "/events": {
        get: {
            tags: ["Notifications"],
            summary: "Live updates (Server-Sent Events): `notification` and `comment` events, ids only",
            description:
                "text/event-stream. Events: `ready` on connect; `notification` { notificationId }; `comment` { action, taskId, commentId }. " +
                "Refetch through the normal endpoints to see content. The server ends the stream when the access token would expire. Reconnect when that happens, refreshing first if you get a 401.",
            security: signedIn,
            responses: { 200: { description: "Event stream", content: { "text/event-stream": { schema: { type: "string" } } } }, ...errorResponses(401) },
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
        post: {
            tags: ["Admin"],
            summary: "Create an account. It has no password: its owner is emailed a set-password link (valid 3 days). setupEmailSent says whether that email went out.",
            security: operatorSession,
            requestBody: jsonBody({ type: "object", required: ["name", "email", "reason"], properties: { name: { type: "string", maxLength: 80 }, email: { type: "string", format: "email" }, timezone: { type: "string" }, reason: { type: "string", minLength: 5, maxLength: 500 } } }),
            responses: { 201: jsonResponse("Created", { type: "object", properties: { data: { type: "object", properties: { account: ref("AdminAccount"), setupEmailSent: { type: "boolean" } } } } }), ...errorResponses(400, 401, 409) },
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
        patch: {
            tags: ["Admin"],
            summary: "Edit name, email or time zone. A new email signs them out everywhere and notifies the old address.",
            security: operatorSession,
            requestBody: jsonBody({ type: "object", required: ["reason"], properties: { name: { type: "string", maxLength: 80 }, email: { type: "string", format: "email" }, timezone: { type: "string" }, reason: { type: "string", minLength: 5, maxLength: 500 } } }),
            responses: { 200: jsonResponse("Updated", dataEnvelope("account", ref("AdminAccount"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
    "/admin/accounts/{accountId}/setup-link": {
        parameters: [pathParam("accountId", "Account id")],
        post: {
            tags: ["Admin"],
            summary: "Email a fresh set-password link (rate-limited; refused for suspended accounts)",
            security: operatorSession,
            responses: { 200: jsonResponse("Sent", dataEnvelope("account", ref("AdminAccount"))), ...errorResponses(401, 404, 409, 429, 502) },
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
            summary: "Retry a failed delivery (same identity). The task and recipient are checked again first, so it may be suppressed instead",
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

// ─── Newsletter ─────────────────────
const postIdParam = pathParam("postId", "Newsletter post id (UUID)");
const postPagingParams = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
];
const postInput = (required: string[]) => ({
    type: "object",
    required,
    properties: { title: { type: "string", maxLength: 150 }, summary: { type: "string", maxLength: 300 }, body: { type: "string", maxLength: 20000 } },
});
const subscribedEnvelope = dataEnvelope("subscribed", { type: "boolean" });

const newsletterPaths = {
    "/newsletter/posts": {
        get: { tags: ["Newsletter"], summary: "Published posts, newest first (public)", security: publicRoute, parameters: postPagingParams, responses: { 200: jsonResponse("Posts", pageEnvelope(ref("NewsletterPost"))), ...errorResponses(400) } },
    },
    "/newsletter/posts/{postId}": {
        get: { tags: ["Newsletter"], summary: "One published post (drafts are 404)", security: publicRoute, parameters: [postIdParam], responses: { 200: jsonResponse("Post", dataEnvelope("post", ref("NewsletterPost"))), ...errorResponses(404) } },
    },
    "/newsletter/subscribe": {
        post: {
            tags: ["Newsletter"],
            summary: "Subscribe an email address: sends a confirmation link (double opt-in). Same answer whether or not it is already subscribed.",
            security: publicRoute,
            requestBody: jsonBody({ type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } }),
            responses: { 200: jsonResponse("Confirmation sent (if needed)", messageEnvelope), ...errorResponses(400, 429) },
        },
    },
    "/newsletter/confirm": {
        post: {
            tags: ["Newsletter"],
            summary: "Confirm a subscription with the signed link from the confirmation email",
            security: publicRoute,
            requestBody: jsonBody({ type: "object", required: ["subscriber", "expires", "signature"], properties: { subscriber: { type: "string" }, expires: { type: "string" }, signature: { type: "string" } } }),
            responses: { 200: jsonResponse("Subscribed", messageEnvelope), ...errorResponses(400) },
        },
    },
    "/newsletter/unsubscribe": {
        post: {
            tags: ["Newsletter"],
            summary: "Unsubscribe with the signed link from any newsletter email (RFC 8058 one-click: no X-Requested-With needed)",
            security: publicRoute,
            parameters: [
                { name: "subscriber", in: "query", schema: { type: "string" } },
                { name: "signature", in: "query", schema: { type: "string" } },
            ],
            responses: { 200: jsonResponse("Unsubscribed (idempotent)", messageEnvelope), ...errorResponses(400) },
        },
    },
    "/newsletter/subscription": {
        get: { tags: ["Newsletter"], summary: "Whether the signed-in account gets the newsletter", security: signedIn, responses: { 200: jsonResponse("Setting", subscribedEnvelope), ...errorResponses(401) } },
        put: {
            tags: ["Newsletter"],
            summary: "Turn the newsletter on or off for the signed-in account (Settings, Profile)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["subscribed"], properties: { subscribed: { type: "boolean" } } }),
            responses: { 200: jsonResponse("Saved", subscribedEnvelope), ...errorResponses(400, 401) },
        },
    },
};

const adminNewsletterPaths = {
    "/admin/newsletter/posts": {
        get: { tags: ["Admin"], summary: "Newsletter posts (drafts and published), newest first", security: operatorSession, parameters: postPagingParams, responses: { 200: jsonResponse("Posts", pageEnvelope(ref("AdminNewsletterPost"))), ...errorResponses(400, 401) } },
        post: { tags: ["Admin"], summary: "Create a draft (audited)", security: operatorSession, requestBody: jsonBody(postInput(["title", "body"])), responses: { 201: jsonResponse("Draft", dataEnvelope("post", ref("AdminNewsletterPost"))), ...errorResponses(400, 401) } },
    },
    "/admin/newsletter/posts/{postId}": {
        get: { tags: ["Admin"], summary: "One post", security: operatorSession, parameters: [postIdParam], responses: { 200: jsonResponse("Post", dataEnvelope("post", ref("AdminNewsletterPost"))), ...errorResponses(401, 404) } },
        patch: {
            tags: ["Admin"],
            summary: "Edit a post (a published post is corrected in the feed, never re-emailed; audited)",
            security: operatorSession,
            parameters: [postIdParam],
            requestBody: jsonBody(postInput([])),
            responses: { 200: jsonResponse("Post", dataEnvelope("post", ref("AdminNewsletterPost"))), ...errorResponses(400, 401, 404) },
        },
        delete: { tags: ["Admin"], summary: "Delete a draft (published posts stay on record; audited)", security: operatorSession, parameters: [postIdParam], responses: { 204: jsonResponse("Deleted"), ...errorResponses(401, 404, 409) } },
    },
    "/admin/newsletter/posts/{postId}/publish": {
        post: {
            tags: ["Admin"],
            summary: "Publish a draft to the News feed, optionally emailing confirmed subscribers once (audited)",
            security: operatorSession,
            parameters: [postIdParam],
            requestBody: jsonBody({ type: "object", required: ["emailSubscribers"], properties: { emailSubscribers: { type: "boolean" } } }),
            responses: { 200: jsonResponse("Published", dataEnvelope("post", ref("AdminNewsletterPost"))), ...errorResponses(400, 401, 404, 409) },
        },
    },
    "/admin/newsletter/subscribers/summary": {
        get: {
            tags: ["Admin"],
            summary: "Subscriber counts by status (never the addresses)",
            security: operatorSession,
            responses: { 200: jsonResponse("Counts", dataEnvelope("summary", { type: "object", properties: { subscribed: { type: "integer" }, pending: { type: "integer" }, unsubscribed: { type: "integer" } } })), ...errorResponses(401) },
        },
    },
};

// ─── Performance summary ─────────────────────
const monthSummarySchema = {
    type: "object",
    description: "Counts for one calendar month in the person's timezone. Never task titles or content.",
    properties: {
        month: { type: "string", example: "2026-09" },
        timezone: { type: "string" },
        completed: { type: "integer" },
        completedOnTime: { type: "integer", description: "Completed by the deadline" },
        completedLate: { type: "integer" },
        completedWithoutDeadline: { type: "integer" },
        metWithoutExtending: { type: "integer", description: "On time and the deadline was never pushed later" },
        onTimeAfterExtending: { type: "integer" },
        onTimeRate: { type: ["number", "null"], description: "completedOnTime / (completedOnTime + completedLate)" },
        extensions: { type: "integer", description: "Times a deadline of yours was pushed later this month" },
        planningDays: { type: "integer", description: "Days you created or updated tasks" },
        daysInMonth: { type: "integer" },
        tasksCreated: { type: "integer" },
        plannedAhead: { type: "integer", description: "Tasks you created this month that were given a due or start date" },
        plannedAheadRate: { type: ["number", "null"] },
        completedAfterOriginalDue: { type: "integer", description: "Completed after the task's first deadline (extended or late)" },
        subtasksCompleted: { type: "integer", description: "Of completed, how many were subtasks" },
        projectsCreated: { type: "integer" },
        commentsWritten: { type: "integer" },
    },
};
const trendSchema = {
    type: "array",
    description: "The month and the five before it, oldest first",
    items: { type: "object", properties: { month: { type: "string" }, completedOnTime: { type: "integer" }, completedLate: { type: "integer" }, extensions: { type: "integer" }, planningDays: { type: "integer" } } },
};
const performanceEnvelope = { type: "object", properties: { status: { type: "string" }, data: { type: "object", properties: { summary: monthSummarySchema, trend: trendSchema } } } };
const shareSchema = {
    type: "object",
    properties: {
        id: { type: "string", format: "uuid" },
        month: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        allWorkspaces: { type: "boolean", description: "A link made before links had a list: covers every workspace" },
        showWorkspaceNames: { type: "boolean" },
        workspaces: { type: "array", items: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } } } },
    },
};

const performancePaths = {
    "/performance": {
        get: {
            tags: ["Performance"],
            summary: "Your monthly summary (default: this month) and a six-month trend, for every workspace or only the ones in `workspaces` (comma-separated ids of workspaces you're in)",
            security: signedIn,
            parameters: [
                { name: "month", in: "query", schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" } },
                { name: "workspaces", in: "query", schema: { type: "string", description: "Comma-separated workspace ids; omit for every workspace" } },
            ],
            responses: { 200: jsonResponse("Summary", performanceEnvelope), ...errorResponses(400, 401) },
        },
    },
    "/performance/shares": {
        get: { tags: ["Performance"], summary: "Your active share links (not their tokens)", security: signedIn, responses: { 200: jsonResponse("Links", dataEnvelope("shares", { type: "array", items: shareSchema })), ...errorResponses(401) } },
        post: {
            tags: ["Performance"],
            summary: "Create a share link for a month and a chosen list of workspaces (names hidden unless showWorkspaceNames). The token is returned once only.",
            security: signedIn,
            requestBody: jsonBody({
                type: "object",
                required: ["workspaceIds"],
                properties: {
                    month: { type: "string", example: "2026-09" },
                    workspaceIds: { type: "array", minItems: 1, maxItems: 50, items: { type: "string", format: "uuid" } },
                    showWorkspaceNames: { type: "boolean", default: false },
                },
            }),
            responses: { 201: jsonResponse("Link", dataEnvelope("share", { allOf: [shareSchema, { type: "object", properties: { token: { type: "string" } } }] })), ...errorResponses(400, 401, 409) },
        },
    },
    "/performance/shares/{shareId}": {
        delete: { tags: ["Performance"], summary: "Revoke a share link", security: signedIn, parameters: [pathParam("shareId", "Share link id")], responses: { 204: jsonResponse("Revoked"), ...errorResponses(401, 404) } },
    },
    "/performance/shared/{token}": {
        get: {
            tags: ["Performance"],
            summary: "Public: a shared month for the chosen workspaces. Only the owner's name, the numbers, and the workspace names if the owner chose to show them",
            security: publicRoute,
            parameters: [pathParam("token", "Token from the share link")],
            responses: {
                200: jsonResponse("Shared summary", { type: "object", properties: { status: { type: "string" }, data: { type: "object", properties: { owner: { type: "object", properties: { name: { type: "string" }, photo: { type: ["string", "null"] } } }, summary: monthSummarySchema, trend: trendSchema } } } }),
                ...errorResponses(404),
            },
        },
    },
};

// ─── Support tickets ─────────────────────
const ticketIdParam = pathParam("ticketId", "Support ticket id (UUID)");
const ticketStatusSchema = { type: "string", enum: ["open", "waiting_on_customer", "resolved", "closed"] };
const ticketCategorySchema = { type: "string", enum: ["question", "problem", "account", "billing", "feedback"] };
const customerTicketSchema = {
    type: "object",
    description: "A support ticket as its requester sees it. Support replies have fromSupport: true and no author.",
    properties: {
        id: { type: "string", format: "uuid" },
        number: { type: "integer", example: 1042 },
        subject: { type: "string" },
        category: ticketCategorySchema,
        status: ticketStatusSchema,
        lastMessageAt: { type: "string", format: "date-time" },
        createdAt: { type: "string", format: "date-time" },
        messages: { type: "array", items: { type: "object", properties: { id: { type: "string" }, body: { type: "string" }, fromSupport: { type: "boolean" }, createdAt: { type: "string", format: "date-time" } } } },
    },
};
const adminTicketSchema = {
    type: "object",
    properties: {
        ...customerTicketSchema.properties,
        requester: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" } } },
        workspace: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
    },
};
const messageBody = jsonBody({ type: "object", required: ["body"], properties: { body: { type: "string", maxLength: 5000 } } });

const supportPaths = {
    "/support/tickets": {
        get: { tags: ["Support"], summary: "Your support requests, most recently active first", security: signedIn, responses: { 200: jsonResponse("Tickets", dataEnvelope("tickets", { type: "array", items: customerTicketSchema })), ...errorResponses(401) } },
        post: {
            tags: ["Support"],
            summary: "Write to Afritask support (rate-limited)",
            security: signedIn,
            requestBody: jsonBody({ type: "object", required: ["subject", "message"], properties: { subject: { type: "string", maxLength: 150 }, category: ticketCategorySchema, message: { type: "string", maxLength: 5000 }, workspaceId: { type: "string", format: "uuid" } } }),
            responses: { 201: jsonResponse("Ticket", dataEnvelope("ticket", customerTicketSchema)), ...errorResponses(400, 401, 429) },
        },
    },
    "/support/tickets/{ticketId}": {
        get: { tags: ["Support"], summary: "One of your tickets with its conversation (404 if not yours)", security: signedIn, parameters: [ticketIdParam], responses: { 200: jsonResponse("Ticket", dataEnvelope("ticket", customerTicketSchema)), ...errorResponses(401, 404) } },
    },
    "/support/tickets/{ticketId}/messages": {
        post: { tags: ["Support"], summary: "Reply in your ticket (reopens a resolved one; closed ones need a new ticket)", security: signedIn, parameters: [ticketIdParam], requestBody: messageBody, responses: { 201: jsonResponse("Ticket", dataEnvelope("ticket", customerTicketSchema)), ...errorResponses(400, 401, 404, 409) } },
    },
    "/workspaces/{workspaceId}/performance": {
        get: {
            tags: ["Performance"],
            summary: "Owner/Admin: every member's month in THIS workspace only (an Admin doesn't see the Owner)",
            security: signedIn,
            parameters: [{ name: "workspaceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "month", in: "query", schema: { type: "string", example: "2026-10" } }],
            responses: { 200: jsonResponse("Members and their month", { type: "object" }), ...errorResponses(401, 403, 404) },
        },
    },
    "/workspaces/{workspaceId}/performance/{membershipId}": {
        get: {
            tags: ["Performance"],
            summary: "Owner/Admin: one member's month and six-month trend in THIS workspace (404 for the Owner when an Admin asks)",
            security: signedIn,
            parameters: [
                { name: "workspaceId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
                { name: "membershipId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
                { name: "month", in: "query", schema: { type: "string", example: "2026-10" } },
            ],
            responses: { 200: jsonResponse("Member, month and trend", { type: "object" }), ...errorResponses(401, 403, 404) },
        },
    },
    "/support/tickets/{ticketId}/resolve": {
        post: { tags: ["Support"], summary: "Mark your ticket as solved", security: signedIn, parameters: [ticketIdParam], responses: { 200: jsonResponse("Ticket", dataEnvelope("ticket", customerTicketSchema)), ...errorResponses(401, 404) } },
    },
    "/contact": {
        post: {
            tags: ["Support"],
            summary: "Public Contact page: a visitor's message becomes a support ticket, answered by email (no sign-in, rate-limited). `website` must stay empty.",
            security: publicRoute,
            requestBody: jsonBody({ type: "object", required: ["name", "email", "message"], properties: { name: { type: "string", maxLength: 80 }, email: { type: "string", format: "email" }, topic: ticketCategorySchema, message: { type: "string", minLength: 10, maxLength: 5000 }, website: { type: "string" } } }),
            responses: { 201: jsonResponse("Ticket number", dataEnvelope("ticket", { type: "object", properties: { number: { type: ["integer", "null"] } } })), ...errorResponses(400, 429) },
        },
    },
};

const adminSupportPaths = {
    "/admin/support/summary": {
        get: { tags: ["Admin"], summary: "Support ticket counts by status", security: operatorSession, responses: { 200: jsonResponse("Counts", dataEnvelope("summary", { type: "object" })), ...errorResponses(401) } },
    },
    "/admin/support/tickets": {
        get: {
            tags: ["Admin"],
            summary: "Support tickets (default: open and waiting on the customer). Search by #number, subject, name or email.",
            security: operatorSession,
            parameters: [{ name: "status", in: "query", schema: ticketStatusSchema }, { name: "q", in: "query", schema: { type: "string" } }, ...postPagingParams],
            responses: { 200: jsonResponse("Tickets", { type: "object", properties: { status: { type: "string" }, data: { type: "object", properties: { items: { type: "array", items: adminTicketSchema }, pagination: { type: "object" } } } } }), ...errorResponses(400, 401) },
        },
    },
    "/admin/support/tickets/{ticketId}": {
        get: { tags: ["Admin"], summary: "One ticket with its full conversation", security: operatorSession, parameters: [ticketIdParam], responses: { 200: jsonResponse("Ticket", dataEnvelope("ticket", adminTicketSchema)), ...errorResponses(401, 404) } },
        patch: {
            tags: ["Admin"],
            summary: "Change a ticket's status (audited)",
            security: operatorSession,
            parameters: [ticketIdParam],
            requestBody: jsonBody({ type: "object", required: ["status"], properties: { status: ticketStatusSchema } }),
            responses: { 200: jsonResponse("Ticket", dataEnvelope("ticket", adminTicketSchema)), ...errorResponses(400, 401, 404) },
        },
    },
    "/admin/support/tickets/{ticketId}/messages": {
        post: {
            tags: ["Admin"],
            summary: "Reply as Afritask support; notifies the customer in the app and by email (audited)",
            security: operatorSession,
            parameters: [ticketIdParam],
            requestBody: jsonBody({ type: "object", required: ["body"], properties: { body: { type: "string", maxLength: 5000 }, status: ticketStatusSchema } }),
            responses: { 201: jsonResponse("Ticket", dataEnvelope("ticket", adminTicketSchema)), ...errorResponses(400, 401, 404, 409) },
        },
    },
};

const healthPaths = {
    "/health": {
        // Unversioned: probed by infrastructure, not part of the API contract.
        servers: [{ url: "/api" }],
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
        // Unversioned: probed by infrastructure, not part of the API contract.
        servers: [{ url: "/api" }],
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
            "**Auth:** sign in with `POST /auth/login`. The response sets httpOnly `afritask_access` (15 min) and `afritask_refresh` (7 days by default, auth routes only) cookies that this page then sends automatically. Call `POST /auth/refresh` when the access token expires.",
            "**CSRF:** every POST/PUT/PATCH/DELETE must send `X-Requested-With: XMLHttpRequest`. This page adds it for you.",
            "**Isolation:** anything in a workspace you're not an active member of answers `404`, exactly like something that doesn't exist.",
        ].join("\n"),
    },
    servers: [{ url: "/api/v1" }],
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
        { name: "Support", description: "Writing to Afritask support and following up" },
        { name: "Performance", description: "Your monthly summary (counts only) and share links" },
        { name: "Newsletter", description: "The public News feed, subscribing (double opt-in), opting out, and the account newsletter setting" },
        { name: "Admin", description: "Admin console (Platform Superadmin): its own sign-in with MFA" },
        { name: "Health", description: "Liveness and readiness probes for hosts and load balancers" },
        { name: "Activity", description: "Read-only history: who changed what, with before/after values" },
    ],
    security: signedIn,
    components: {
        securitySchemes: {
            sessionCookie: { type: "apiKey", in: "cookie", name: "afritask_access", description: "Access token set by POST /auth/login and POST /auth/refresh" },
            operatorCookie: { type: "apiKey", in: "cookie", name: "afritask_operator_session", description: "Set by POST /admin/auth/login; sent only to /api/admin" },
        },
        schemas,
    },
    paths: withOperationIds({ ...authPaths, ...userPaths, ...workspacePaths, ...invitationPaths, ...projectPaths, ...labelPaths, ...taskPaths, ...subtaskPaths, ...commentPaths, ...notificationPaths, ...activityPaths, ...dashboardPaths, ...healthPaths, ...adminAuthPaths, ...adminDirectoryPaths, ...adminOperationsPaths, ...newsletterPaths, ...adminNewsletterPaths, ...eventsPaths, ...performancePaths, ...supportPaths, ...adminSupportPaths }),
};

export default openApiDocument;
