// Jest for a TypeScript ESM project (ts-jest in ESM mode; run with
// NODE_OPTIONS=--experimental-vm-modules — see the "test" scripts in package.json).
/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    [String.raw`^.+\.ts$`]: ["ts-jest", { useESM: true, tsconfig: "tsconfig.test.json" }],
  },
  // Source imports use ".js" (NodeNext); point Jest at the .ts files.
  // NOTE: String.raw keeps the backslashes — an unescaped "." here matched "index.mjs"
  // inside dependencies and broke module resolution.
  moduleNameMapper: { [String.raw`^(\.{1,2}/.*)\.js$`]: "$1" },
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
  globalSetup: "<rootDir>/tests/setup/globalSetup.ts",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  // One shared test database → files run one after another (--runInBand in the scripts).
  testTimeout: 60_000,
  collectCoverageFrom: ["src/**/*.ts", "!src/generated/**", "!src/server.ts", "!src/scripts/**", "!src/types/**"],
};

export default config;
