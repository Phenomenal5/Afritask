import { createHmac, timingSafeEqual } from "node:crypto";

// ─── Short-lived access tokens (JWT, HS256) ─────────────────────
// Signed with node:crypto rather than a JWT library: we only ever issue and read our own
// tokens, with one fixed algorithm, so the whole format fits in a few lines.
// NOTE: the algorithm is never read from the token header — accepting the header's `alg`
// is the classic JWT hole ("alg": "none", or HS/RS confusion).

export interface AccessTokenClaims {
    userId: string;
    sessionId: string;
}

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

const signatureOf = (unsignedToken: string, secret: string) =>
    createHmac("sha256", secret).update(unsignedToken).digest();

export const signAccessToken = ({ userId, sessionId }: AccessTokenClaims, secret: string, lifetimeMs: number) => {
    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        sub: userId,
        sid: sessionId,
        typ: "access",
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + Math.floor(lifetimeMs / 1000),
    })).toString("base64url");
    const unsignedToken = `${HEADER}.${payload}`;
    return `${unsignedToken}.${signatureOf(unsignedToken, secret).toString("base64url")}`;
};

// The claims of a genuine, unexpired access token — or null for anything else.
export const verifyAccessToken = (token: string, secret: string): AccessTokenClaims | null => {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== HEADER) return null;
    const [header, payload, signature] = parts as [string, string, string];

    const expected = signatureOf(`${header}.${payload}`, secret);
    const presented = Buffer.from(signature, "base64url");
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;

    try {
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (claims.typ !== "access" || typeof claims.sub !== "string" || typeof claims.sid !== "string") return null;
        if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
        return { userId: claims.sub, sessionId: claims.sid };
    } catch {
        return null;
    }
};
