import type { NextFunction, Request, Response } from "express";

// ─── CSRF guard for cookie-authenticated writes ─────────────────────
// A cross-site <form> or fetch can make the browser send our cookie, but it cannot add
// a custom header without a CORS preflight — which our CORS policy refuses. So every
// state-changing request must carry `X-Requested-With: XMLHttpRequest` (set once in the
// client's axios instance). Works together with the SameSite=Lax session cookie.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const requireAjaxHeader = (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get("x-requested-with") === "XMLHttpRequest") return next();
    return res.status(403).json({ status: "fail", message: "Missing X-Requested-With header" });
};

export default requireAjaxHeader;
