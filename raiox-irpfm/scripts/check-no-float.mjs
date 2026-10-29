// Fails if the engine source uses JavaScript floating point for money.
// Rule 3 of the briefing: money is never a float. Tests are exempt so they can
// assert on plain values; production code must go through money.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["packages/engine/src"];
const FORBIDDEN = [
  { pattern: /\bparseFloat\s*\(/, why: "parseFloat" },
  { pattern: /\bNumber\s*\(/, why: "Number(...) conversion" },
  { pattern: /\.toFixed\s*\(/, why: "Number#toFixed" },
  { pattern: /\bMath\.(round|floor|ceil|trunc)\s*\(/, why: "Math rounding" },
  { pattern: /(?<![\w.'"])\d+\.\d+(?![\w'"])/, why: "decimal number literal" },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, "");
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(code) && !line.includes("float-guard: allow")) {
          violations.push(`${relative(process.cwd(), file)}:${index + 1}  ${why}: ${line.trim()}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Money guard failed. Use Decimal (money.ts) instead:\n");
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Money guard: OK (no float usage in engine source).");
