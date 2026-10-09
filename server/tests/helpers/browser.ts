// ─── A tiny "browser" for E2E journeys ─────────────────────
// Talks to a REAL listening server over HTTP with fetch, keeps cookies like a browser
// (only what Set-Cookie gives it), and sends the CSRF header like the client's axios does.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import app from "../../src/app.js";

export const startServer = async () => {
    const server: Server = await new Promise((resolve) => {
        const listening = app.listen(0, () => resolve(listening));
    });
    const { port } = server.address() as AddressInfo;
    return {
        baseUrl: `http://127.0.0.1:${port}/api`,
        stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
};

export interface BrowserResponse {
    status: number;
    body: any;
}

export const createBrowser = (baseUrl: string) => {
    const cookies = new Map<string, string>();

    const remember = (response: Response) => {
        for (const setCookie of response.headers.getSetCookie()) {
            const [pair = ""] = setCookie.split(";");
            const [name = "", ...valueParts] = pair.split("=");
            const value = valueParts.join("=");
            // An emptied/expired cookie is how logout tells the browser to forget it.
            if (!value || /expires=Thu, 01 Jan 1970/i.test(setCookie)) cookies.delete(name.trim());
            else cookies.set(name.trim(), value);
        }
    };

    const send = async (method: string, path: string, body?: unknown): Promise<BrowserResponse> => {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            redirect: "manual",
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                ...(body !== undefined && { "Content-Type": "application/json" }),
                ...(cookies.size > 0 && { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        remember(response);
        const text = await response.text();
        let parsed: unknown = text;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            // non-JSON (e.g. a redirect) — keep the raw text
        }
        return { status: response.status, body: parsed };
    };

    return {
        cookies,
        get: (path: string) => send("GET", path),
        post: (path: string, body: unknown = {}) => send("POST", path, body),
        put: (path: string, body: unknown = {}) => send("PUT", path, body),
        patch: (path: string, body: unknown = {}) => send("PATCH", path, body),
        delete: (path: string) => send("DELETE", path),
    };
};

export type Browser = ReturnType<typeof createBrowser>;
