// ─── HTTP clients for driving the app ─────────────────────
import request from "supertest";
import app from "../../src/app.js";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "../../src/services/sessionService.js";

export const CSRF_HEADER = { "X-Requested-With": "XMLHttpRequest" } as const;

export type ApiClient = ReturnType<typeof createClient>;

// A browser-like client that sends the CSRF header on every request, the way the real
// axios instance does. Paths are relative to /api, e.g. client.get("/auth/me").
// - createClient()               → cookies come from responses (log in via /auth/login)
// - createClient({ accessToken, refreshToken }) → starts out signed in with a session the
//   factory created directly in the database (fast setup; login has its own tests)
export const createClient = ({ accessToken, refreshToken }: { accessToken?: string; refreshToken?: string } = {}) => {
    const agent = request.agent(app);
    const presetCookies = [
        accessToken && `${ACCESS_TOKEN_COOKIE}=${accessToken}`,
        refreshToken && `${REFRESH_TOKEN_COOKIE}=${refreshToken}`,
    ].filter(Boolean).join("; ");
    const withHeaders = (pending: request.Test) => {
        pending.set(CSRF_HEADER);
        if (presetCookies) pending.set("Cookie", presetCookies);
        return pending;
    };
    return {
        agent,
        accessToken,
        refreshToken,
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
