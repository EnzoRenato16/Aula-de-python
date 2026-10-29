// Fails on invisible or ambiguous Unicode characters in source code
// (no-break space, combining marks, BOM, bidi controls, zero-width chars).
// They behave correctly but cannot be seen in review: use \u escapes instead.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["packages", "apps", "scripts", "tools"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".py"];
const FORBIDDEN =
  /\u00A0|[\u0300-\u036F]|[\u200B-\u200F]|[\u202A-\u202E]|[\u2060-\u2064]|[\u2066-\u2069]|\uFEFF/u;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    // Dependencies and build output are not our source.
    if (name === "node_modules" || name === "dist" || name === ".next") return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return EXTENSIONS.some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const match = line.match(FORBIDDEN);
        if (match) {
          const code = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
          violations.push(`${relative(process.cwd(), file)}:${index + 1}  U+${code}`);
        }
      });
  }
}

if (violations.length > 0) {
  console.error("Invisible characters found (use \\u escapes):\n");
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Source guard: OK (no invisible characters).");
