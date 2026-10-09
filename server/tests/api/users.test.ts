// API: /api/users — profile (incl. avatar upload) and password change.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { DEFAULT_PASSWORD, createSignedInUser, signIn } from "../helpers/factories.js";
import { clearMailbox, lastEmailTo } from "../helpers/mailbox.js";

// A real 1×1 PNG.
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const uploadedFiles: string[] = [];

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(async () => {
    for (const photoPath of uploadedFiles) {
        const absolutePath = path.resolve("public", photoPath.replace(/^\//, ""));
        if (existsSync(absolutePath)) unlinkSync(absolutePath);
    }
    await disconnectDatabase();
});

describe("PUT /users/profile", () => {
    it("updates name (trimmed), age and timezone (canonical)", async () => {
        const { client } = await createSignedInUser();
        const response = await client.put("/users/profile", { name: "  Grace Hopper ", age: "31", timezone: "africa/lagos" });

        expect(response.status).toBe(200);
        expect(response.body.user).toMatchObject({ name: "Grace Hopper", age: 31, timezone: "Africa/Lagos" });
        expect(response.body.user).not.toHaveProperty("password");
    });

    it("clears age with an empty value (multipart forms send strings)", async () => {
        const { client, user } = await createSignedInUser();
        await prisma.user.update({ where: { id: user.id }, data: { age: 40 } });
        const response = await client.put("/users/profile", { age: "" });
        expect(response.body.user.age).toBeNull();
    });

    it.each([
        [{ name: "   " }, "Name is required"],
        [{ age: "-1" }, "Age must be a positive number"],
        [{ timezone: "Nowhere/Land" }, "Please provide a valid timezone"],
    ])("rejects %p", async (body, message) => {
        const { client } = await createSignedInUser();
        const response = await client.put("/users/profile", body);
        expect(response.status).toBe(400);
        expect(response.body.message).toBe(message);
    });

    it("uploads an avatar and stores a web path", async () => {
        const { client } = await createSignedInUser();
        const response = await client.raw("put", "/users/profile").attach("photo", TINY_PNG, { filename: "me.png", contentType: "image/png" });

        expect(response.status).toBe(200);
        expect(response.body.user.photo).toMatch(/^\/uploads\/profile\/user-[0-9a-f-]+\.png$/);
        uploadedFiles.push(response.body.user.photo);
        expect(existsSync(path.resolve("public", response.body.user.photo.replace(/^\//, "")))).toBe(true);
    });

    it("rejects a non-image upload with 400 (not a 500)", async () => {
        const { client } = await createSignedInUser();
        const response = await client
            .raw("put", "/users/profile")
            .attach("photo", Buffer.from("#!/bin/sh\necho pwned"), { filename: "evil.sh", contentType: "text/x-sh" });
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Only image files (png, jpg, jpeg, gif) are allowed");
    });

    it("rejects an image over 5 MB with 400", async () => {
        const { client } = await createSignedInUser();
        const oversized = Buffer.concat([TINY_PNG, Buffer.alloc(5 * 1024 * 1024 + 10)]);
        const response = await client.raw("put", "/users/profile").attach("photo", oversized, { filename: "big.png", contentType: "image/png" });
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Image must be 5 MB or smaller");
    });

    it("requires a session", async () => {
        const { createClient } = await import("../helpers/client.js");
        await expect(createClient().put("/users/profile", { name: "x" })).resolves.toMatchObject({ status: 401 });
    });
});

describe("PUT /users/password", () => {
    it("changes the password, keeps this session, signs out the others, and emails a notice", async () => {
        const { user, client } = await createSignedInUser();
        const otherDevice = await signIn(user.email);

        const response = await client.put("/users/password", { currentPassword: DEFAULT_PASSWORD, newPassword: "new-and-long" });
        expect(response.status).toBe(200);
        await expect(client.get("/auth/me")).resolves.toMatchObject({ status: 200 });
        await expect(otherDevice.get("/auth/me")).resolves.toMatchObject({ status: 401 });
        expect(lastEmailTo(user.email).subject).toBe("Password Changed Successfully");
        await expect(signIn(user.email, "new-and-long")).resolves.toBeDefined();
    });

    it.each([
        [{ currentPassword: "wrong-one", newPassword: "new-and-long" }, 401, "Current password is incorrect"],
        [{ currentPassword: DEFAULT_PASSWORD, newPassword: "123" }, 400, "Password must be at least 6 characters"],
        [{ currentPassword: DEFAULT_PASSWORD }, 400, "Please provide current password and new password"],
    ])("rejects %p", async (body, status, message) => {
        const { client } = await createSignedInUser();
        const response = await client.put("/users/password", body);
        expect(response.status).toBe(status);
        expect(response.body.message).toBe(message);
    });
});
