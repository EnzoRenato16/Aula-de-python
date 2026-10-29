import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "io",
    include: ["src/**/*.test.ts"],
  },
});
