import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  // Workspace packages export TypeScript sources directly.
  transpilePackages: ["@raiox/engine", "@raiox/io", "@raiox/report", "@raiox/seed"],
  // Server-only libraries that must not be bundled.
  serverExternalPackages: ["@react-pdf/renderer", "pg", "read-excel-file", "write-excel-file"],
  // Type checking runs separately with TypeScript 7 (`pnpm typecheck`), the
  // same compiler as the rest of the monorepo.
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  // The repository guide is CLAUDE.md; `next dev` must not write an AGENTS.md.
  agentRules: false,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
