import {
  type ClientInput,
  D,
  DEFAULT_CALENDAR_YEAR,
  getRuleSet,
  type IncomeTypeDefinition,
  type PayerInput,
  type RuleSet,
} from "@raiox/engine";
import writeXlsxFile, { type Row, type SheetData } from "write-excel-file/node";
import { type ColumnKind, SHEET_ORDER, SHEETS, type SheetKey } from "./schema.ts";

const HEADER_STYLE = {
  fontWeight: "bold",
  backgroundColor: "#12343B",
  textColor: "#FFFFFF",
} as const;
const EXAMPLE_PREFIX = "EXEMPLO";

/**
 * Converts a canonical decimal string to the number Excel stores. The
 * conversion is checked: if the double cannot represent the value exactly as
 * written, we refuse instead of silently changing a cent.
 */
export function excelNumber(canonical: string): number {
  const value = Number.parseFloat(canonical);
  if (!new D(String(value)).equals(new D(canonical))) {
    throw new Error(`Valor ${canonical} não pode ser gravado sem perda de precisão`);
  }
  return value;
}

type CellValue = string | number | boolean | null;

function formatFor(kind: ColumnKind): string | undefined {
  if (kind === "money") return "#,##0.00";
  if (kind === "rate") return "0.00%";
  return undefined;
}

function headerRow(sheet: SheetKey): Row {
  return SHEETS[sheet].columns.map((column) => ({ value: column.key, ...HEADER_STYLE }));
}

function dataRow(sheet: SheetKey, values: Record<string, CellValue | undefined>): Row {
  return SHEETS[sheet].columns.map((column) => {
    const value = values[column.key];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number") {
      const format = formatFor(column.kind);
      return format ? { value, type: Number, format } : { value, type: Number };
    }
    return { value: String(value), type: String };
  });
}

function sheetOf(sheet: SheetKey, rows: Record<string, CellValue | undefined>[]) {
  const data: SheetData = [headerRow(sheet), ...rows.map((values) => dataRow(sheet, values))];
  return {
    sheet: SHEETS[sheet].title,
    data,
    columns: SHEETS[sheet].columns.map((column) => ({ width: column.width })),
    stickyRowsCount: 1,
  };
}

const yesNo = (value: boolean | undefined) => (value === undefined ? undefined : value ? "S" : "N");
const money = (value: unknown) =>
  value === undefined || value === null ? undefined : excelNumber(new D(String(value)).toFixed(2));
const rate = (value: unknown) =>
  value === undefined || value === null ? undefined : excelNumber(new D(String(value)).toString());

function baseTreatment(definition: IncomeTypeDefinition): string {
  switch (definition.base.kind) {
    case "INCLUDED":
      return definition.code === "DIVIDENDOS" ? "Sim (exceto regra de transição)" : "Sim";
    case "EXCLUDED":
      return "Não";
    case "CHOICE":
      return "Sim por padrão (regra PENDENTE)";
    case "SUBTRACTED":
      return "Subtrai da base";
  }
}

const REGIME_LABEL: Record<IncomeTypeDefinition["regime"], string> = {
  AJUSTE: "Tributável no ajuste",
  EXCLUSIVA: "Exclusiva na fonte",
  DEFINITIVA: "Definitiva",
  LEI_14754: "Lei 14.754/2023",
  DIVIDENDO: "Retenção mensal (art. 6º-A)",
  ISENTO: "Isento / alíquota zero",
  BASE_DEDUCTION: "Dedução da base",
};

function readmeSheet(ruleSet: RuleSet) {
  const lines: string[] = [
    `Raio-X IRPFM: template de importação (ano-calendário ${ruleSet.calendarYear}, declaração ${ruleSet.calendarYear + 1})`,
    "",
    "Como preencher",
    "1. Abas: clientes (opcional), empresas (opcional), rendimentos (obrigatória), posicoes (opcional, para cenários).",
    "2. A primeira linha de cada aba é o cabeçalho: não renomeie as colunas.",
    "3. Rendimentos em formato longo: uma linha por cliente × tipo de rendimento × mês.",
    "   Dividendos precisam de mês e codigo_empresa (a retenção de 10% é mensal, por empresa).",
    "4. Regime de caixa: informe o que foi RECEBIDO ou REALIZADO no ano (CDB conta no resgate ou no vencimento).",
    "5. Valores: 60.000,00 ou 60000,00. Taxas: 32% ou 0,32.",
    "6. Apague as linhas de EXEMPLO antes de importar.",
    "",
    "Privacidade (LGPD)",
    "• NÃO informe CPF, CNPJ, nome completo, e-mail ou telefone. Use códigos pseudônimos (ex.: CLI-0001, EMP-HOLDING-A).",
    "• O sistema recusa células que parecem CPF, CNPJ, e-mail ou telefone.",
    "",
    "Importante",
    "• Este é um instrumento de SIMULAÇÃO para profissionais. Não é recomendação de investimento nem consultoria tributária.",
    "• Valide os resultados com o contador do cliente.",
    "• A aba dicionario explica cada coluna e cada tipo de rendimento, com a regra legal correspondente.",
  ];
  return {
    sheet: "LEIA-ME",
    data: lines.map((line, index) => [
      index === 0
        ? { value: line, fontWeight: "bold" as const, fontSize: 14 }
        : ["Como preencher", "Privacidade (LGPD)", "Importante"].includes(line)
          ? { value: line, fontWeight: "bold" as const }
          : line === ""
            ? null
            : { value: line },
    ]),
    columns: [{ width: 120 }],
  };
}

function dictionarySheet(ruleSet: RuleSet) {
  const header = (titles: string[]) => titles.map((value) => ({ value, ...HEADER_STYLE }));
  const data: SheetData = [
    header(["aba", "coluna", "obrigatória", "descrição", "exemplo"]),
    ...SHEET_ORDER.flatMap((sheet) =>
      SHEETS[sheet].columns.map((column) => [
        sheet,
        column.key,
        column.required ? "sim" : "não",
        column.description,
        column.example || null,
      ]),
    ),
    [],
    header([
      "tipo_rendimento",
      "descrição",
      "entra na base do IRPFM?",
      "regra",
      "regime do IR",
      "estimativa de IR sem valor informado",
    ]),
    ...ruleSet.incomeTypes.map((definition) => [
      definition.code,
      definition.help,
      baseTreatment(definition),
      "ruleId" in definition.base ? definition.base.ruleId : "R-16A-04",
      REGIME_LABEL[definition.regime],
      definition.estimatedTaxRate === null
        ? definition.regime === "EXCLUSIVA" || definition.regime === "DEFINITIVA"
          ? "informar"
          : "—"
        : `${definition.estimatedTaxRate.times(100).toString().replace(".", ",")}%`,
    ]),
  ];
  return {
    sheet: "dicionario",
    data,
    columns: [
      { width: 24 },
      { width: 22 },
      { width: 22 },
      { width: 90 },
      { width: 22 },
      { width: 22 },
    ],
    stickyRowsCount: 1,
  };
}

/** Rows for one set of clients, in the template layout. */
function clientRows(clients: readonly ClientInput[]) {
  const companies = new Map<string, PayerInput>();
  for (const client of clients) {
    for (const payer of client.payers ?? []) companies.set(payer.code, payer);
  }
  return {
    clientes: clients.map((client) => ({
      codigo_cliente: client.clientCode,
      apelido: client.nickname ?? undefined,
      codigo_assessor: client.advisorCode ?? undefined,
      irpf_devido_ajuste: money(client.irpfAdjustmentDue),
    })),
    empresas: [...companies.values()]
      .sort((a, b) => (a.code < b.code ? -1 : 1))
      .map((payer) => ({
        codigo_empresa: payer.code,
        aliquota_efetiva_pj: rate(payer.effectiveRate),
        categoria_limite: payer.limitCategory,
        simples_nacional: yesNo(payer.simplesNacional),
      })),
    rendimentos: clients.flatMap((client) =>
      client.incomes.map((line) => ({
        codigo_cliente: client.clientCode,
        tipo_rendimento: line.type,
        mes: line.month ?? undefined,
        valor: money(line.amount),
        ir_retido_ou_pago: money(line.taxWithheld),
        codigo_empresa: line.payerCode ?? undefined,
        regra_transicao: line.type === "DIVIDENDOS" ? yesNo(line.transition === true) : undefined,
      })),
    ),
    posicoes: clients.flatMap((client) =>
      (client.positions ?? []).map((position) => ({
        codigo_cliente: client.clientCode,
        classe: position.assetClass,
        saldo: money(position.balance),
        taxa_esperada_aa: rate(position.expectedAnnualRate),
        aliquota_ir: rate(position.taxRate),
      })),
    ),
  };
}

/** Writes clients in the import format (used by the seed and by exports). */
export async function writeClientsWorkbook(
  clients: readonly ClientInput[],
  options: { calendarYear?: number; includeGuide?: boolean } = {},
): Promise<Buffer> {
  const ruleSet = getRuleSet(options.calendarYear ?? DEFAULT_CALENDAR_YEAR);
  const rows = clientRows(clients);
  const sheets = [
    ...(options.includeGuide === false ? [] : [readmeSheet(ruleSet)]),
    ...SHEET_ORDER.map((sheet) => sheetOf(sheet, rows[sheet])),
    ...(options.includeGuide === false ? [] : [dictionarySheet(ruleSet)]),
  ];
  return writeXlsxFile(sheets).toBuffer();
}

/** Example client shipped inside the template (rows start with EXEMPLO). */
export const TEMPLATE_EXAMPLE: ClientInput = {
  clientCode: `${EXAMPLE_PREFIX}-01`,
  nickname: "Cliente exemplo",
  advisorCode: "ASS-01",
  irpfAdjustmentDue: "98000.00",
  payers: [
    {
      code: `${EXAMPLE_PREFIX}-HOLDING`,
      effectiveRate: "0.34",
      limitCategory: "GERAL",
      simplesNacional: false,
    },
    { code: `${EXAMPLE_PREFIX}-CLINICA`, simplesNacional: true },
  ],
  incomes: [
    { type: "SALARIO", amount: "360000.00" },
    {
      type: "DIVIDENDOS",
      amount: "120000.00",
      month: 3,
      payerCode: `${EXAMPLE_PREFIX}-HOLDING`,
      transition: false,
    },
    {
      type: "DIVIDENDOS",
      amount: "45000.00",
      month: 6,
      payerCode: `${EXAMPLE_PREFIX}-CLINICA`,
      transition: false,
    },
    {
      type: "DIVIDENDOS",
      amount: "200000.00",
      month: 2,
      payerCode: `${EXAMPLE_PREFIX}-HOLDING`,
      transition: true,
    },
    { type: "RENDA_FIXA", amount: "85000.00", taxWithheld: "12750.00" },
    { type: "LCA", amount: "40000.00" },
  ],
  positions: [
    { assetClass: "RENDA_FIXA", balance: "800000.00", expectedAnnualRate: "0.12", taxRate: "0.15" },
    { assetClass: "LCA", balance: "400000.00", expectedAnnualRate: "0.10" },
  ],
};

/** The empty template, with one example client, guide and dictionary. */
export function writeTemplate(calendarYear = DEFAULT_CALENDAR_YEAR): Promise<Buffer> {
  return writeClientsWorkbook([TEMPLATE_EXAMPLE], { calendarYear });
}

export function isExampleCode(code: string): boolean {
  return code.startsWith(EXAMPLE_PREFIX);
}
