// ─── Which database the tests may touch ─────────────────────
// Plain JS on purpose: Jest loads globalSetup with Node's own ESM loader (no ts-jest
// .js→.ts mapping), and both globalSetup.ts and env.ts import this file.
// NOTE: every test file TRUNCATES all tables. Pointing the suite at the dev or production
// database would wipe real data, so this refuses unless TEST_DATABASE_URL is set, isn't the
// same database as DATABASE_URL/DIRECT_DATABASE_URL, and its name contains "test".

/** @param {string} url */
const databaseNameOf = (url) => {
    try {
        return new URL(url).pathname.replace(/^\//, "");
    } catch {
        return "";
    }
};

// Neon's pooled and direct hosts differ only by "-pooler" — treat them as the same server.
/** @param {string} url */
const serverOf = (url) => {
    try {
        return new URL(url).host.replace("-pooler", "");
    } catch {
        return "";
    }
};

/** @returns {string} */
export const assertSafeTestDatabase = () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) {
        throw new Error("TEST_DATABASE_URL is not set — tests need their own database (see server/.env.example).");
    }

    const testDatabaseName = databaseNameOf(testDatabaseUrl);
    if (!/test/i.test(testDatabaseName)) {
        throw new Error(`TEST_DATABASE_URL database "${testDatabaseName}" doesn't look like a test database (its name must contain "test").`);
    }

    const otherUrls = /** @type {string[]} */ ([process.env.DATABASE_URL, process.env.DIRECT_DATABASE_URL].filter(
        (url) => Boolean(url) && url !== testDatabaseUrl
    ));
    const sharesADatabase = otherUrls.some(
        (url) => serverOf(url) === serverOf(testDatabaseUrl) && databaseNameOf(url) === testDatabaseName
    );
    if (sharesADatabase) {
        throw new Error("TEST_DATABASE_URL points at the same database as DATABASE_URL — refusing to wipe it.");
    }
    return testDatabaseUrl;
};
