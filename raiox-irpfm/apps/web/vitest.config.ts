import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    name: "web",
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./src/server/test/global-setup.ts"],
    // Tests share one database: run files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
