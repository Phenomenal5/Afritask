// Unit (contract): the Swagger spec documents exactly the routes the server has.
// Reads the route files and app.ts mounts, so adding a route without documenting it — or
// documenting one that doesn't exist — fails the build.
import { describe, expect, it } from "@jest/globals";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import openApiDocument from "../../src/docs/openapi.js";

const sourceDirectory = path.resolve("src");

const routesInCode = () => {
    const appSource = readFileSync(path.join(sourceDirectory, "app.ts"), "utf8");
    // import <identifier> from "./routes/<file>.js"
    const fileByImport = new Map(
        [...appSource.matchAll(/import (\w+) from "\.\/routes\/(\w+)\.js"/g)].map((match) => [match[1]!, match[2]!])
    );
    // app.use("/api/<prefix>", <identifier>)
    const prefixByFile = new Map(
        [...appSource.matchAll(/app\.use\("\/api(\/[\w-]+)", (\w+)\)/g)].map((match) => [fileByImport.get(match[2]!)!, match[1]!])
    );

    const routes = new Set<string>();
    for (const fileName of readdirSync(path.join(sourceDirectory, "routes"))) {
        const routeFile = fileName.replace(/\.ts$/, "");
        const prefix = prefixByFile.get(routeFile);
        if (!prefix) throw new Error(`routes/${fileName} isn't mounted in app.ts`);
        const source = readFileSync(path.join(sourceDirectory, "routes", fileName), "utf8");
        for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)) {
            const routePath = `${prefix}${match[2] === "/" ? "" : match[2]}`.replace(/:(\w+)/g, "{$1}");
            routes.add(`${match[1]!.toUpperCase()} ${routePath}`);
        }
    }
    return routes;
};

const routesInSpec = () => {
    const routes = new Set<string>();
    for (const [routePath, pathItem] of Object.entries(openApiDocument.paths)) {
        for (const method of Object.keys(pathItem)) {
            if (["get", "post", "put", "patch", "delete"].includes(method)) routes.add(`${method.toUpperCase()} ${routePath}`);
        }
    }
    return routes;
};

describe("OpenAPI spec ⇄ routes", () => {
    const codeRoutes = routesInCode();
    const specRoutes = routesInSpec();

    it("finds the routes (sanity)", () => expect(codeRoutes.size).toBeGreaterThanOrEqual(40));

    it("documents every route", () => {
        expect([...codeRoutes].filter((route) => !specRoutes.has(route))).toEqual([]);
    });

    it("documents nothing that doesn't exist", () => {
        expect([...specRoutes].filter((route) => !codeRoutes.has(route))).toEqual([]);
    });

    it("gives every operation a unique operationId", () => {
        const operationIds = Object.values(openApiDocument.paths).flatMap((pathItem) =>
            Object.values(pathItem).map((operation) => (operation as { operationId?: string }).operationId).filter(Boolean)
        );
        expect(operationIds).toHaveLength(specRoutes.size);
        expect(new Set(operationIds).size).toBe(operationIds.length);
    });
});
