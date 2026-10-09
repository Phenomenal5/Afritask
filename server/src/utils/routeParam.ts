import type { Request } from "express";

// Express 5 types every route param as string | string[] (to cover wildcards).
// Our routes only use plain `:name` params, so anything else is treated as missing.
const routeParam = (req: Request, paramName: string): string | undefined => {
    const paramValue = req.params[paramName];
    return typeof paramValue === "string" ? paramValue : undefined;
};

export default routeParam;
