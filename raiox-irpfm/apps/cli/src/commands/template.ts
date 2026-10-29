import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { writeTemplate } from "@raiox/io";
import { type Logger, resolvePath } from "../util.ts";

export async function template(
  options: { saida: string; ano?: string },
  log: Logger,
): Promise<number> {
  const path = resolvePath(options.saida);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    await writeTemplate(options.ano ? Number.parseInt(options.ano, 10) : undefined),
  );
  log.ok(`Template gravado em ${path}`);
  return 0;
}
