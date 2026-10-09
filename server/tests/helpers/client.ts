// ─── HTTP clients for driving the app ─────────────────────
import request from "supertest";
import app from "../../src/app.js";
import { SESSION_COOKIE_NAME } from "../../src/services/sessionService.js";

export const CSRF_HEADER = { "X-Requested-With": "XMLHttpRequest" } as const;

export type ApiClient = ReturnType<typeof createClient>;

// A browser-like client that sends the CSRF header on every request, the way the real
// axios instance does. Paths are relative to /api, e.g. client.get("/auth/me").
// - createClient()               → cookies come from responses (log in via /auth/login)
// - createClient({ sessionSecret }) → starts out signed in with a session the factory
//   created directly in the database (fast setup; the login endpoint has its own tests)
export const createClient = ({ sessionSecret }: { sessionSecret?: string } = {}) => {
    const agent = request.agent(app);
    const withHeaders = (pending: request.Test) => {
        pending.set(CSRF_HEADER);
        if (sessionSecret) pending.set("Cookie", `${SESSION_COOKIE_NAME}=${sessionSecret}`);
        return pending;
    };
    return {
        agent,
        sessionSecret,
        get: (path: string) => withHeaders(agent.get(`/api${path}`)),
        post: (path: string, body?: object) => withHeaders(agent.post(`/api${path}`)).send(body ?? {}),
        put: (path: string, body?: object) => withHeaders(agent.put(`/api${path}`)).send(body ?? {}),
        patch: (path: string, body?: object) => withHeaders(agent.patch(`/api${path}`)).send(body ?? {}),
        delete: (path: string) => withHeaders(agent.delete(`/api${path}`)),
        // Raw request with the same headers, for multipart uploads etc.
        raw: (method: "get" | "post" | "put" | "patch" | "delete", path: string) => withHeaders(agent[method](`/api${path}`)),
    };
};

// No cookies, no CSRF header — for testing what an outsider/attacker gets.
export const anonymous = () => request(app);
