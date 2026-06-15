import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
