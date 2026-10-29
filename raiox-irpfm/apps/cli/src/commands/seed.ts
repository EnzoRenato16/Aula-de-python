import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { writeClientsWorkbook } from "@raiox/io";
import { generateClients } from "@raiox/seed";
import { type Logger, resolvePath } from "../util.ts";

export async function seed(
  options: { saida: string; clientes: string; semente: string },
  log: Logger,
): Promise<number> {
  const count = Number.parseInt(options.clientes, 10);
  const seedValue = Number.parseInt(options.semente, 10);
  if (!/^\d+$/.test(options.clientes) || count < 1 || count > 10_000) {
    log.error("--clientes deve ser um inteiro entre 1 e 10000");
    return 1;
  }
  if (!/^\d+$/.test(options.semente)) {
    log.error("--semente deve ser um inteiro não negativo");
    return 1;
  }
  const clients = generateClients({ clients: count, seed: seedValue });
  const path = resolvePath(options.saida);
  await mkdir(dirname(path), { recursive: true });
  // The generator profile is internal; it does not go to the spreadsheet.
  await writeFile(
    path,
    await writeClientsWorkbook(clients.map(({ profile: _profile, ...client }) => client)),
  );
  log.ok(`${count} clientes SINTÉTICOS (semente ${seedValue}) gravados em ${path}`);
  return 0;
}
