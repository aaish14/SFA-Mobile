import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist/**", "node_modules/**"],
    hookTimeout: 30000,
    env: {
      USE_MOCK_DATA: "true",
      JWT_SECRET: "automated-test-secret-change-me",
      AUTH_ALLOW_TEST_CODE: "true",
    },
  },
});
