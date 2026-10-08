import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      USE_MOCK_DATA: "true",
      JWT_SECRET: "automated-test-secret-change-me",
      DISTRIBUTOR_USERS_JSON: "",
    },
  },
});
