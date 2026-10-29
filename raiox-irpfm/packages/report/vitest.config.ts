import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "report",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
