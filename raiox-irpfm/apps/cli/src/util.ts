import { isAbsolute, resolve } from "node:path";

/**
 * Resolves a user path against the directory where the command was typed.
 * `pnpm raiox` runs from the repository root, so pnpm's INIT_CWD is used.
 */
export function resolvePath(path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, text: string) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

export interface Logger {
  step(message: string): void;
  info(message: string): void;
  detail(message: string): void;
  ok(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  progress(message: string): void;
  blank(): void;
}

export const consoleLogger: Logger = {
  step: (message) => console.log(paint("1", `▸ ${message}`)),
  info: (message) => console.log(message),
  detail: (message) => console.log(paint("2", `   ${message}`)),
  ok: (message) => console.log(paint("32", `✓ ${message}`)),
  warn: (message) => console.warn(paint("33", `! ${message}`)),
  error: (message) => console.error(paint("31", `✗ ${message}`)),
  progress: (message) => console.log(paint("2", `  ${message}`)),
  blank: () => console.log(""),
};
