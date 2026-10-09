import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { anonymous } from "../helpers/client.js";
import { disconnectDatabase, resetDatabase } from "../helpers/database.js";
import { createSignedInUser } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("smoke", () => {
    it("answers 401 to an anonymous /auth/me", async () => {
        const response = await anonymous().get("/api/auth/me");
        expect(response.status).toBe(401);
    });

    it("signs a user in and reads /auth/me", async () => {
        const { user, client } = await createSignedInUser();
        const response = await client.get("/auth/me");
        expect(response.status).toBe(200);
        expect(response.body.user.email).toBe(user.email);
    });
});
