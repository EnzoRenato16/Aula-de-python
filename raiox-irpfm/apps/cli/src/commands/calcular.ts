import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import {
  type CalculationOptions,
  type ClientInput,
  type ClientResult,
  calculateClient,
  EngineInputError,
  formatBRL,
  type PendingChoices,
  type RankedClient,
  type ReducerStrategy,
  rankClients,
  serializeResult,
  sum,
} from "@raiox/engine";
import {
  importWorkbook,
  issuesToCsv,
  type RawWorkbook,
  readCsvWorkbook,
  readXlsxWorkbook,
} from "@raiox/io";
import { type Brand, renderClientReport } from "@raiox/report";
import { rankingCsv, rankingTable } from "../ranking.ts";
import { type Logger, resolvePath } from "../util.ts";

export interface CalcularOptions {
  entrada: string;
  saida: string;
  conservador?: boolean;
  pdf?: boolean;
  ignorarErros?: boolean;
  escritorio?: string;
  cor?: string;
  logo?: string;
  estrategiaRedutor?: ReducerStrategy;
  simplesSemRetencao?: boolean;
  ganhoIsentoFora?: boolean;
  semEstimativas?: boolean;
}

const STRATEGIES: readonly ReducerStrategy[] = [
  "INCREMENTAL_NET",
  "INCREMENTAL_GROSS",
  "NOMINAL_RATE",
];

export async function readInput(path: string): Promise<RawWorkbook> {
  const info = await stat(path).catch(() => null);
  if (!info) throw new Error(`Arquivo ou pasta não encontrado: ${path}`);
  if (info.isDirectory()) {
    const names = await readdir(path);
    const csvFiles = names.filter((name) => extname(name).toLowerCase() === ".csv").sort();
    if (csvFiles.length === 0) throw new Error(`Nenhum arquivo .csv em ${path}`);
    return readCsvWorkbook(
      await Promise.all(
        csvFiles.map(async (name) => ({ name, content: await readFile(join(path, name), "utf8") })),
      ),
    );
  }
  const extension = extname(path).toLowerCase();
  if (extension === ".xlsx") return readXlsxWorkbook(await readFile(path));
  if (extension === ".csv")
    return readCsvWorkbook([{ name: basename(path), content: await readFile(path, "utf8") }]);
  throw new Error(`Formato não suportado: ${path} (use .xlsx, .csv ou uma pasta com .csv)`);
}

export function buildCalculationOptions(options: CalcularOptions): CalculationOptions {
  const choices: Partial<PendingChoices> = {};
  if (options.estrategiaRedutor) {
    if (!STRATEGIES.includes(options.estrategiaRedutor)) {
      throw new Error(`--estrategia-redutor deve ser ${STRATEGIES.join(", ")}`);
    }
    choices.reducerStrategy = options.estrategiaRedutor;
  }
  if (options.simplesSemRetencao) choices.simplesNacionalWithholding = false;
  if (options.ganhoIsentoFora) choices.exemptStockGainsInBase = false;
  if (options.semEstimativas) {
    choices.estimateIrpfWhenMissing = false;
    choices.estimateTaxWhenMissing = false;
  }
  return { conservative: options.conservador === true, choices };
}

async function buildBrand(options: CalcularOptions): Promise<Brand> {
  const brand: Brand = { officeName: options.escritorio ?? "Raio-X IRPFM" };
  if (options.cor) {
    if (!/^#[0-9a-f]{6}$/i.test(options.cor)) {
      throw new Error("--cor deve ser hexadecimal, ex.: #12343B");
    }
    brand.primaryColor = options.cor;
  }
  if (options.logo) {
    if (!/\.(png|jpe?g)$/i.test(options.logo)) throw new Error("--logo deve ser PNG ou JPG");
    brand.logo = await readFile(resolvePath(options.logo));
  }
  return brand;
}

export async function calcular(options: CalcularOptions, log: Logger): Promise<number> {
  const input = resolvePath(options.entrada);
  const output = resolvePath(options.saida);
  await mkdir(output, { recursive: true });

  // Validate every option before the heavy work.
  const calcOptions = buildCalculationOptions(options);
  const brand = options.pdf === false ? null : await buildBrand(options);

  log.step(`Lendo ${input}`);
  const imported = importWorkbook(await readInput(input));
  const { stats } = imported;
  log.info(
    `${stats.clients} clientes, ${stats.incomeLines} linhas de rendimento, ${stats.companies} empresas, ${stats.positions} posições`,
  );
  const reportPath = join(output, "relatorio-importacao.csv");
  await rm(reportPath, { force: true });
  if (imported.issues.length > 0) {
    await writeFile(reportPath, issuesToCsv(imported.issues));
    log.warn(`${stats.errors} erro(s) e ${stats.warnings} aviso(s): veja relatorio-importacao.csv`);
    for (const issue of imported.issues.filter((i) => i.severity === "erro").slice(0, 10)) {
      log.detail(
        `${issue.sheet} linha ${issue.row ?? "-"}, ${issue.column ?? "-"}: ${issue.message}`,
      );
    }
  }
  if (!imported.ok && !options.ignorarErros) {
    log.error(
      "Importação com erros. Corrija a planilha ou use --ignorar-erros para calcular só as linhas válidas.",
    );
    return 1;
  }

  log.step(`Calculando${calcOptions.conservative ? " (modo conservador)" : ""}`);
  const results: ClientResult[] = [];
  const inputs: ClientInput[] = [];
  for (const client of imported.clients) {
    try {
      results.push(calculateClient(client, calcOptions));
      inputs.push(client);
    } catch (error) {
      if (error instanceof EngineInputError) {
        log.warn(`${client.clientCode}: ${error.message} (cliente ignorado)`);
        continue;
      }
      throw error;
    }
  }
  const ranked = rankClients(results);

  await writeFile(join(output, "ranking.csv"), rankingCsv(ranked));
  await writeFile(
    join(output, "resultados.json"),
    `${JSON.stringify(
      ranked.map(({ position, result, score }) => ({
        position,
        score: {
          score: score.score.toFixed(1),
          components: score.components.map((c) => ({ key: c.key, points: c.points.toFixed(2) })),
        },
        result: serializeResult(result),
      })),
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(output, "entradas.json"),
    `${JSON.stringify({ options: calcOptions, clients: inputs }, null, 2)}\n`,
  );
  log.ok("ranking.csv, resultados.json e entradas.json gravados");

  if (brand) {
    const pdfDir = join(output, "pdf");
    await mkdir(pdfDir, { recursive: true });
    // PDFs of a previous run (e.g. clients no longer in the base) would mislead.
    for (const name of await readdir(pdfDir)) {
      if (name.toLowerCase().endsWith(".pdf")) await rm(join(pdfDir, name));
    }
    const generatedAt = new Date();
    let done = 0;
    for (const { result } of ranked) {
      await writeFile(
        join(pdfDir, `${result.clientCode}.pdf`),
        await renderClientReport(result, { brand, generatedAt }),
      );
      done++;
      if (done % 25 === 0 || done === ranked.length) log.progress(`PDFs: ${done}/${ranked.length}`);
    }
    log.ok(`${ranked.length} PDFs em ${pdfDir}`);
  }

  printSummary(ranked, log);
  return 0;
}

function printSummary(ranked: readonly RankedClient[], log: Logger): void {
  const results = ranked.map((entry) => entry.result);
  const paying = results.filter((r) => r.amountToPay.greaterThan(0));
  const refunding = results.filter((r) => r.amountToRefund.greaterThan(0));
  const toPay = sum(paying.map((r) => r.amountToPay));
  const toRefund = sum(refunding.map((r) => r.amountToRefund));
  const inBand = results.filter((r) => r.alerts.some((a) => a.code === "FAIXA_TRANSICAO")).length;
  log.blank();
  log.info(`Clientes com IRPFM a pagar: ${paying.length} (total ${formatBRL(toPay)})`);
  log.info(`Clientes com retenção a restituir: ${refunding.length} (total ${formatBRL(toRefund)})`);
  log.info(`Clientes na faixa de transição: ${inBand}`);
  log.blank();
  log.info(rankingTable(ranked));
}
