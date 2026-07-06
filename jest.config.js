/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  // Each test file is responsible for connecting/disconnecting Mongo
  // via the helper in tests/setup.js. We keep workers serialized
  // (--runInBand) so they don't share the in-memory mongo URI.
  testTimeout: 30000,
};
