// ─── A signed-in Platform Superadmin for admin-console tests ─────────────────────
// Creates the grant and a fully verified (password + MFA) operator session directly in the
// database — the same rows the real sign-in produces. The sign-in flow itself is covered by
// tests/api/operatorAccess.test.ts.
import request from "supertest";
import app from "../../src/app.js";
import prisma from "../../src/config/prisma.js";
import { OPERATOR_COOKIE_NAME } from "../../src/services/operatorSessionService.js";
import { generateSecureToken, hashSecureToken } from "../../src/utils/secureToken.js";
import { CSRF_HEADER } from "./client.js";
import { createUser } from "./factories.js";

export const createOperatorClient = async (name = "Ola Operator") => {
    const user = await createUser({ name });
    await prisma.platformGrant.create({ data: { userId: user.id, note: "test", mfaEnabledAt: new Date() } });
    const sessionSecret = generateSecureToken();
    await prisma.session.create({
        data: {
            userId: user.id,
            kind: "operator",
            secretHash: hashSecureToken(sessionSecret),
            expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
            mfaVerifiedAt: new Date(),
        },
    });

    const agent = request.agent(app);
    const withHeaders = (pending: request.Test) => pending.set(CSRF_HEADER).set("Cookie", `${OPERATOR_COOKIE_NAME}=${sessionSecret}`);
    const client = {
        get: (path: string) => withHeaders(agent.get(`/api/v1/admin${path}`)),
        post: (path: string, body?: object) => withHeaders(agent.post(`/api/v1/admin${path}`)).send(body ?? {}),
    };
    return { user, client };
};
