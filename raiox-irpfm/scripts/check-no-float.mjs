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

/**
 * Blanks out comments and string/template literal contents (keeping line
 * breaks) so legal citations such as "Lei 9.250" are not mistaken for floats.
 * Template expressions `${...}` are kept, since they are code.
 */
function stripNonCode(source) {
  let out = "";
  let i = 0;
  const templateDepth = [];
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i++;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === "\\") i++;
        i++;
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === "`" || (ch === "}" && templateDepth.at(-1) === 0)) {
      if (ch === "}") templateDepth.pop();
      out += "`";
      i++;
      while (i < source.length && source[i] !== "`") {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          templateDepth.push(0);
          out += "${";
          i += 2;
          break;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (source[i] === "`") {
        out += "`";
        i++;
      }
      continue;
    }
    if (templateDepth.length > 0) {
      if (ch === "{") templateDepth[templateDepth.length - 1]++;
      if (ch === "}") templateDepth[templateDepth.length - 1]--;
    }
    out += ch;
    i++;
  }
  return out;
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const raw = readFileSync(file, "utf8").split("\n");
    const lines = stripNonCode(raw.join("\n")).split("\n");
    lines.forEach((code, index) => {
      const line = raw[index] ?? "";
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
