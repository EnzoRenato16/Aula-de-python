import {
  type ClientInput,
  DEFAULT_CALENDAR_YEAR,
  getRuleSet,
  INCOME_TYPE_CODES,
  type IncomeLineInput,
  type IncomeTypeCode,
  type PayerInput,
  type PositionInput,
  type ReducerLimitCategory,
  type RuleSet,
} from "@raiox/engine";
import { z } from "zod";
import { type ColumnDefinition, type ColumnKind, SHEETS, type SheetKey } from "./schema.ts";
import { isExampleCode } from "./template.ts";
import {
  type Cell,
  looksLikePersonalData,
  parseCode,
  parseMoney,
  parseMonth,
  parseRate,
  parseYesNo,
} from "./values.ts";
import type { RawRow, RawWorkbook } from "./workbook.ts";

export type IssueSeverity = "erro" | "aviso";

export interface ImportIssue {
  severity: IssueSeverity;
  sheet: string;
  /** Spreadsheet row (header = 1); null for sheet-level issues. */
  row: number | null;
  column: string | null;
  value: string | null;
  message: string;
}

export interface ImportResult {
  ok: boolean;
  clients: ClientInput[];
  issues: ImportIssue[];
  stats: {
    clients: number;
    incomeLines: number;
    companies: number;
    positions: number;
    errors: number;
    warnings: number;
  };
}

/** Value produced by a cell schema, with an optional non-blocking warning. */
interface CellOutput<T> {
  value: T;
  warning?: string;
}

const LIMIT_CATEGORIES: readonly ReducerLimitCategory[] = ["GERAL", "FINANCEIRA", "BANCO"];
const FULL_NAME = /^[A-ZÀ-Ý][a-zà-ÿ]+(\s+(d[aeo]s?|e|[A-ZÀ-Ý][a-zà-ÿ]+))+$/;

function normalizeToken(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function parseByKind(
  kind: ColumnKind,
  cell: Cell,
  ruleSet: RuleSet,
): { ok: true; output: CellOutput<unknown> } | { ok: false; error: string } {
  if (kind === "code" || kind === "nickname") {
    const personal = looksLikePersonalData(cell.text);
    if (personal) {
      return {
        ok: false,
        error: `parece ${personal}. O sistema não aceita dados pessoais (LGPD): use um código pseudônimo ou apelido.`,
      };
    }
  }
  switch (kind) {
    case "code": {
      const parsed = parseCode(cell);
      return parsed.ok ? { ok: true, output: { value: parsed.value } } : parsed;
    }
    case "nickname": {
      const value = cell.text.trim();
      if (value.length > 40) return { ok: false, error: "apelido com mais de 40 caracteres" };
      return {
        ok: true,
        output: FULL_NAME.test(value)
          ? {
              value,
              warning:
                "apelido parece um nome completo; prefira um apelido que não identifique a pessoa",
            }
          : { value },
      };
    }
    case "money": {
      const parsed = parseMoney(cell);
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        output: parsed.rounded
          ? { value: parsed.value, warning: `valor arredondado para ${parsed.value}` }
          : { value: parsed.value },
      };
    }
    case "rate": {
      const parsed = parseRate(cell);
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        output: parsed.interpretedAsPercent
          ? {
              value: parsed.value,
              warning: `"${cell.text}" interpretado como ${cell.text.trim()}%`,
            }
          : { value: parsed.value },
      };
    }
    case "month": {
      const parsed = parseMonth(cell);
      return parsed.ok ? { ok: true, output: { value: parsed.value } } : parsed;
    }
    case "yesno": {
      const parsed = parseYesNo(cell);
      return parsed.ok ? { ok: true, output: { value: parsed.value } } : parsed;
    }
    case "incomeType":
    case "assetClass": {
      const code = normalizeToken(cell.text);
      if (!(INCOME_TYPE_CODES as readonly string[]).includes(code)) {
        return { ok: false, error: `tipo desconhecido: "${cell.text}" (veja a aba dicionario)` };
      }
      if (kind === "assetClass") {
        const definition = ruleSet.incomeTypes.find((type) => type.code === code);
        if (!definition?.investable) {
          return { ok: false, error: `${code} não é uma classe de investimento para cenários` };
        }
      }
      return { ok: true, output: { value: code } };
    }
    case "limitCategory": {
      const code = normalizeToken(cell.text);
      if (!(LIMIT_CATEGORIES as readonly string[]).includes(code)) {
        return { ok: false, error: `use GERAL, FINANCEIRA ou BANCO (recebido: "${cell.text}")` };
      }
      return { ok: true, output: { value: code } };
    }
  }
}

/** Zod schema of one cell: parses the raw cell and reports pt-BR messages. */
function cellSchema(column: ColumnDefinition, ruleSet: RuleSet) {
  return z.custom<Cell | undefined>().transform((cell, ctx): CellOutput<unknown> | undefined => {
    if (cell === undefined) {
      if (column.required) {
        ctx.issues.push({ code: "custom", message: "campo obrigatório", input: cell });
        return z.NEVER;
      }
      return undefined;
    }
    const parsed = parseByKind(column.kind, cell, ruleSet);
    if (!parsed.ok) {
      ctx.issues.push({ code: "custom", message: parsed.error, input: cell });
      return z.NEVER;
    }
    return parsed.output;
  });
}

function rowSchema(sheet: SheetKey, ruleSet: RuleSet) {
  const shape: Record<string, ReturnType<typeof cellSchema>> = {};
  for (const column of SHEETS[sheet].columns) shape[column.key] = cellSchema(column, ruleSet);
  return z.object(shape);
}

type ParsedRow = Record<string, CellOutput<unknown> | undefined>;

class IssueCollector {
  readonly issues: ImportIssue[] = [];

  add(issue: ImportIssue): void {
    this.issues.push(issue);
  }

  error(
    sheet: string,
    row: number | null,
    column: string | null,
    value: string | null,
    message: string,
  ): void {
    this.add({ severity: "erro", sheet, row, column, value, message });
  }

  warning(
    sheet: string,
    row: number | null,
    column: string | null,
    value: string | null,
    message: string,
  ): void {
    this.add({ severity: "aviso", sheet, row, column, value, message });
  }
}

function parseSheetRows(
  workbook: RawWorkbook,
  sheet: SheetKey,
  ruleSet: RuleSet,
  issues: IssueCollector,
): { row: RawRow; values: ParsedRow }[] {
  const definition = SHEETS[sheet];
  const raw = workbook.get(sheet);
  if (!raw) {
    if (definition.required) issues.error(sheet, null, null, null, `aba "${sheet}" não encontrada`);
    return [];
  }
  const known = new Set(definition.columns.map((column) => column.key));
  for (const column of definition.columns) {
    if (column.required && !raw.headers.includes(column.key)) {
      issues.error(sheet, 1, column.key, null, `coluna obrigatória "${column.key}" não encontrada`);
    }
  }
  for (const header of raw.headers) {
    if (!known.has(header)) issues.warning(sheet, 1, header, null, `coluna "${header}" ignorada`);
  }
  if (
    issues.issues.some(
      (issue) => issue.sheet === sheet && issue.row === 1 && issue.severity === "erro",
    )
  ) {
    return [];
  }

  const schema = rowSchema(sheet, ruleSet);
  const parsed: { row: RawRow; values: ParsedRow }[] = [];
  for (const row of raw.rows) {
    const input = Object.fromEntries(
      definition.columns.map((column) => [column.key, row.cells.get(column.key)]),
    );
    const result = schema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const column = String(issue.path[0] ?? "");
        issues.error(
          sheet,
          row.rowNumber,
          column || null,
          row.cells.get(column)?.text ?? null,
          issue.message,
        );
      }
      continue;
    }
    const values = result.data as ParsedRow;
    for (const [column, output] of Object.entries(values)) {
      if (output?.warning) {
        issues.warning(
          sheet,
          row.rowNumber,
          column,
          row.cells.get(column)?.text ?? null,
          output.warning,
        );
      }
    }
    parsed.push({ row, values });
  }
  return parsed;
}

const str = (values: ParsedRow, key: string): string | undefined =>
  values[key]?.value as string | undefined;
const num = (values: ParsedRow, key: string): number | undefined =>
  values[key]?.value as number | undefined;
const bool = (values: ParsedRow, key: string): boolean | undefined =>
  values[key]?.value as boolean | undefined;

/**
 * Validates a workbook and builds engine inputs. Never throws on bad data:
 * every problem becomes an issue with sheet, row and column.
 */
export function importWorkbook(
  workbook: RawWorkbook,
  options: { ruleSet?: RuleSet } = {},
): ImportResult {
  const ruleSet = options.ruleSet ?? getRuleSet(DEFAULT_CALENDAR_YEAR);
  const issues = new IssueCollector();

  // clientes
  const clients = new Map<
    string,
    ClientInput & { incomes: IncomeLineInput[]; positions: PositionInput[] }
  >();
  for (const { row, values } of parseSheetRows(workbook, "clientes", ruleSet, issues)) {
    const code = str(values, "codigo_cliente") as string;
    if (clients.has(code)) {
      issues.error("clientes", row.rowNumber, "codigo_cliente", code, `cliente duplicado: ${code}`);
      continue;
    }
    const client: ClientInput & { incomes: IncomeLineInput[]; positions: PositionInput[] } = {
      clientCode: code,
      incomes: [],
      positions: [],
    };
    const nickname = str(values, "apelido");
    const advisor = str(values, "codigo_assessor");
    const irpf = str(values, "irpf_devido_ajuste");
    if (nickname !== undefined) client.nickname = nickname;
    if (advisor !== undefined) client.advisorCode = advisor;
    if (irpf !== undefined) client.irpfAdjustmentDue = irpf;
    clients.set(code, client);
  }

  // empresas
  const companies = new Map<string, PayerInput>();
  for (const { row, values } of parseSheetRows(workbook, "empresas", ruleSet, issues)) {
    const code = str(values, "codigo_empresa") as string;
    if (companies.has(code)) {
      issues.error("empresas", row.rowNumber, "codigo_empresa", code, `empresa duplicada: ${code}`);
      continue;
    }
    const payer: PayerInput = { code };
    const rate = str(values, "aliquota_efetiva_pj");
    const category = str(values, "categoria_limite");
    const simples = bool(values, "simples_nacional");
    if (rate !== undefined) payer.effectiveRate = rate;
    if (category !== undefined) payer.limitCategory = category as ReducerLimitCategory;
    if (simples !== undefined) payer.simplesNacional = simples;
    companies.set(code, payer);
  }

  const clientFor = (code: string, sheet: SheetKey, rowNumber: number) => {
    let client = clients.get(code);
    if (!client) {
      client = { clientCode: code, incomes: [], positions: [] };
      clients.set(code, client);
      if (workbook.has("clientes")) {
        issues.warning(
          sheet,
          rowNumber,
          "codigo_cliente",
          code,
          `cliente ${code} não está na aba clientes; criado sem apelido nem IRPF informado`,
        );
      }
    }
    return client;
  };

  // rendimentos
  let incomeLines = 0;
  const missingCompanies = new Set<string>();
  for (const { row, values } of parseSheetRows(workbook, "rendimentos", ruleSet, issues)) {
    const type = str(values, "tipo_rendimento") as IncomeTypeCode;
    const amount = str(values, "valor") as string;
    const month = num(values, "mes");
    const payerCode = str(values, "codigo_empresa");
    const transition = bool(values, "regra_transicao");
    const tax = str(values, "ir_retido_ou_pago");
    const definition = ruleSet.incomeTypes.find((candidate) => candidate.code === type);
    const sheet = "rendimentos";

    let rowOk = true;
    if (definition?.requiresMonth && month === undefined) {
      issues.error(
        sheet,
        row.rowNumber,
        "mes",
        null,
        `mês é obrigatório para ${type} (retenção mensal)`,
      );
      rowOk = false;
    }
    if (definition?.requiresPayer && payerCode === undefined) {
      issues.error(
        sheet,
        row.rowNumber,
        "codigo_empresa",
        null,
        `codigo_empresa é obrigatório para ${type}`,
      );
      rowOk = false;
    }
    if (!rowOk) continue;
    if (amount === "0.00") {
      issues.warning(sheet, row.rowNumber, "valor", "0", "linha com valor zero ignorada");
      continue;
    }
    if (transition !== undefined && type !== "DIVIDENDOS") {
      issues.warning(
        sheet,
        row.rowNumber,
        "regra_transicao",
        null,
        "regra_transicao só vale para DIVIDENDOS; ignorada",
      );
    }
    if (tax !== undefined && type === "DIVIDENDOS") {
      issues.warning(
        sheet,
        row.rowNumber,
        "ir_retido_ou_pago",
        tax,
        "a retenção sobre dividendos é calculada pelo motor; valor informado ignorado",
      );
    }
    if (payerCode !== undefined && type === "DIVIDENDOS" && !companies.has(payerCode)) {
      if (!missingCompanies.has(payerCode)) {
        issues.warning(
          sheet,
          row.rowNumber,
          "codigo_empresa",
          payerCode,
          `empresa ${payerCode} não está na aba empresas: sem alíquota efetiva, o redutor será zero`,
        );
        missingCompanies.add(payerCode);
      }
    }

    const line: IncomeLineInput = { type, amount };
    if (month !== undefined) line.month = month;
    if (payerCode !== undefined) line.payerCode = payerCode;
    if (type === "DIVIDENDOS") line.transition = transition === true;
    if (tax !== undefined && type !== "DIVIDENDOS") line.taxWithheld = tax;
    clientFor(str(values, "codigo_cliente") as string, sheet, row.rowNumber).incomes.push(line);
    incomeLines++;
  }

  // posicoes
  let positions = 0;
  for (const { row, values } of parseSheetRows(workbook, "posicoes", ruleSet, issues)) {
    const client = clientFor(str(values, "codigo_cliente") as string, "posicoes", row.rowNumber);
    const assetClass = str(values, "classe") as IncomeTypeCode;
    if (client.positions.some((position) => position.assetClass === assetClass)) {
      issues.error(
        "posicoes",
        row.rowNumber,
        "classe",
        assetClass,
        `classe ${assetClass} repetida para o cliente ${client.clientCode}`,
      );
      continue;
    }
    const position: PositionInput = {
      assetClass,
      balance: str(values, "saldo") as string,
      expectedAnnualRate: str(values, "taxa_esperada_aa") as string,
    };
    const taxRate = str(values, "aliquota_ir");
    if (taxRate !== undefined) position.taxRate = taxRate;
    client.positions.push(position);
    positions++;
  }

  // Attach the companies each client receives dividends from.
  const result: ClientInput[] = [...clients.values()]
    .sort((a, b) => (a.clientCode < b.clientCode ? -1 : a.clientCode > b.clientCode ? 1 : 0))
    .map((client) => {
      const payerCodes = new Set(
        client.incomes.map((line) => line.payerCode).filter((code): code is string => !!code),
      );
      const payers = [...payerCodes].sort().flatMap((code) => {
        const payer = companies.get(code);
        return payer ? [payer] : [];
      });
      const built: ClientInput = { ...client, payers };
      if (client.positions.length === 0) delete (built as { positions?: unknown }).positions;
      return built;
    });

  for (const client of result) {
    if (isExampleCode(client.clientCode)) {
      issues.warning(
        "rendimentos",
        null,
        "codigo_cliente",
        client.clientCode,
        `${client.clientCode} é uma linha de exemplo do template; apague antes de usar com dados reais`,
      );
    }
    if (client.incomes.length === 0) {
      issues.warning(
        "clientes",
        null,
        "codigo_cliente",
        client.clientCode,
        `cliente ${client.clientCode} sem nenhum rendimento`,
      );
    }
  }

  const errors = issues.issues.filter((issue) => issue.severity === "erro").length;
  return {
    ok: errors === 0,
    clients: result,
    issues: issues.issues,
    stats: {
      clients: result.length,
      incomeLines,
      companies: companies.size,
      positions,
      errors,
      warnings: issues.issues.length - errors,
    },
  };
}
