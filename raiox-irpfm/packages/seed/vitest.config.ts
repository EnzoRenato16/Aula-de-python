import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "seed",
    include: ["src/**/*.test.ts"],
  },
});
