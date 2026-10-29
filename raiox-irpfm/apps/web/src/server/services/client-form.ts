import {
  type ClientInput,
  D,
  type DecimalInput,
  formatPercent,
  getRuleSet,
  type PayerInput,
  type ReducerLimitCategory,
} from "@raiox/engine";
import {
  type Cell,
  decimalComma,
  importWorkbook,
  type RawRow,
  type RawWorkbook,
  SHEETS,
  type SheetKey,
} from "@raiox/io";
import { and, eq, inArray } from "drizzle-orm";
import type { ClientForm, ClientFormOutcome, IncomeTypeOption } from "../../lib/client-form.ts";
import { assertManager, NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { client, company } from "../db/schema.ts";
import { audit } from "./audit.ts";
import { recalculate } from "./calculation.ts";
import { loadClientInputs, saveClient, upsertCompanies } from "./clients.ts";

/** Form field of each template column, per sheet. */
const FIELD_OF: Record<SheetKey, Record<string, string>> = {
  clientes: {
    codigo_cliente: "code",
    apelido: "nickname",
    codigo_assessor: "advisorCode",
    irpf_devido_ajuste: "irpfAdjustmentDue",
  },
  rendimentos: {
    tipo_rendimento: "type",
    mes: "month",
    valor: "amount",
    ir_retido_ou_pago: "taxWithheld",
    codigo_empresa: "payerCode",
    regra_transicao: "transition",
  },
  empresas: {
    codigo_empresa: "code",
    aliquota_efetiva_pj: "effectiveRate",
    categoria_limite: "limitCategory",
    simples_nacional: "simplesNacional",
  },
  posicoes: {
    classe: "assetClass",
    saldo: "balance",
    taxa_esperada_aa: "expectedAnnualRate",
    aliquota_ir: "taxRate",
  },
};

/** Form array of each sheet (the clientes sheet is the top of the form). */
const ARRAY_OF: Record<SheetKey, string | null> = {
  clientes: null,
  rendimentos: "incomes",
  empresas: "companies",
  posicoes: "positions",
};

const ITEM_LABEL: Record<SheetKey, string> = {
  clientes: "Cliente",
  rendimentos: "Rendimento",
  empresas: "Empresa",
  posicoes: "Posição",
};

/** The first data row of a sheet is row 2 (row 1 is the header). */
const FIRST_ROW = 2;

const asMoney = (value: DecimalInput | null | undefined) =>
  value === null || value === undefined ? "" : decimalComma(new D(value).toFixed(2));

/** Rates are written as percentages: a plain "1" would read as 1% (see parseRate). */
const asPercent = (value: DecimalInput | null | undefined) =>
  value === null || value === undefined
    ? ""
    : `${decimalComma(new D(value).times(100).toString())}%`;

function sheet(key: SheetKey, rows: Record<string, string | boolean>[]): RawWorkbook {
  const headers = SHEETS[key].columns.map((column) => column.key);
  const rawRows: RawRow[] = rows.map((values, index) => {
    const cells = new Map<string, Cell>();
    for (const [column, value] of Object.entries(values)) {
      const text = typeof value === "boolean" ? (value ? "S" : "N") : value.trim();
      if (text !== "") cells.set(column, { text, numeric: false });
    }
    return { rowNumber: index + FIRST_ROW, cells };
  });
  return new Map([[key, { name: key, headerRow: 1, headers, rows: rawRows }]]);
}

/**
 * Writes the form as a one-client workbook, so it is validated by the same
 * importer as the spreadsheets. Companies cited by the incomes but absent
 * from the form keep the attributes already stored for the office.
 */
export function formToWorkbook(
  form: ClientForm,
  storedCompanies: readonly PayerInput[] = [],
): RawWorkbook {
  const code = form.code;
  const listed = new Set(form.companies.map((entry) => entry.code.trim().toUpperCase()));
  const extra = storedCompanies.filter((payer) => !listed.has(payer.code));
  return new Map([
    ...sheet("clientes", [
      {
        codigo_cliente: code,
        apelido: form.nickname,
        codigo_assessor: form.advisorCode,
        irpf_devido_ajuste: form.irpfAdjustmentDue,
      },
    ]),
    ...sheet(
      "rendimentos",
      form.incomes.map((line) => ({
        codigo_cliente: code,
        tipo_rendimento: line.type,
        mes: line.month,
        valor: line.amount,
        ir_retido_ou_pago: line.taxWithheld,
        codigo_empresa: line.payerCode,
        ...(line.type === "DIVIDENDOS" ? { regra_transicao: line.transition } : {}),
      })),
    ),
    ...sheet("empresas", [
      ...form.companies.map((entry) => ({
        codigo_empresa: entry.code,
        aliquota_efetiva_pj: entry.effectiveRate,
        categoria_limite: entry.limitCategory,
        simples_nacional: entry.simplesNacional,
      })),
      ...extra.map((payer) => ({
        codigo_empresa: payer.code,
        aliquota_efetiva_pj: asPercent(payer.effectiveRate),
        categoria_limite: payer.limitCategory ?? "GERAL",
        simples_nacional: payer.simplesNacional === true,
      })),
    ]),
    ...sheet(
      "posicoes",
      form.positions.map((entry) => ({
        codigo_cliente: code,
        classe: entry.assetClass,
        saldo: entry.balance,
        taxa_esperada_aa: entry.expectedAnnualRate,
        aliquota_ir: entry.taxRate,
      })),
    ),
  ]);
}

export interface ValidatedForm {
  input: ClientInput | null;
  companies: PayerInput[];
  fieldErrors: Record<string, string>;
  formErrors: string[];
  warnings: string[];
}

/** Validates the form with the importer and maps its issues to form fields. */
export function validateClientForm(
  form: ClientForm,
  calendarYear: number,
  storedCompanies: readonly PayerInput[] = [],
): ValidatedForm {
  const formCompanies = form.companies.length;
  const result = importWorkbook(formToWorkbook(form, storedCompanies), {
    ruleSet: getRuleSet(calendarYear),
  });
  const fieldErrors: Record<string, string> = {};
  const formErrors: string[] = [];
  const warnings: string[] = [];
  for (const issue of result.issues) {
    const key = issue.sheet as SheetKey;
    // Every row repeats the client code: its problems belong to the code field.
    const isClientCode = issue.column === "codigo_cliente";
    const field = issue.column ? FIELD_OF[key]?.[issue.column] : undefined;
    const array = isClientCode ? null : ARRAY_OF[key];
    const index = issue.row === null ? null : issue.row - FIRST_ROW;
    // Rows of companies filled from the database are not in the form.
    const inForm = key !== "empresas" || (index !== null && index < formCompanies);
    let path: string | null = null;
    if (isClientCode) path = "code";
    else if (field && inForm) {
      if (array === null) path = field;
      else if (index !== null) path = `${array}.${index}.${field}`;
    }
    const where =
      array !== null && index !== null && inForm ? `${ITEM_LABEL[key]} ${index + 1}: ` : "";
    if (issue.severity === "aviso") {
      if (!warnings.includes(`${where}${issue.message}`)) warnings.push(`${where}${issue.message}`);
    } else if (path) {
      // One message per field is enough; it stands alone under the field.
      fieldErrors[path] ??= issue.message.charAt(0).toUpperCase() + issue.message.slice(1);
    } else {
      formErrors.push(`${where}${issue.message}`);
    }
  }
  const [input] = result.clients;
  const ok = Object.keys(fieldErrors).length === 0 && formErrors.length === 0 && input;
  return {
    input: ok ? input : null,
    companies: ok ? [...(input.payers ?? [])] : [],
    fieldErrors,
    formErrors,
    warnings,
  };
}

async function storedCompaniesOf(db: Executor, ctx: OrgContext, form: ClientForm) {
  const codes = [
    ...new Set(form.incomes.map((line) => line.payerCode.trim().toUpperCase()).filter(Boolean)),
  ];
  if (codes.length === 0) return [];
  const rows = await db
    .select()
    .from(company)
    .where(and(eq(company.orgId, ctx.orgId), inArray(company.code, codes)));
  return rows.map(
    (row): PayerInput => ({
      code: row.code,
      effectiveRate: row.effectiveRate,
      limitCategory: row.limitCategory as ReducerLimitCategory,
      simplesNacional: row.simplesNacional,
    }),
  );
}

/**
 * Creates (`existingCode` null) or replaces one client from the manual form,
 * then recalculates the office. Validation problems are returned, not thrown.
 */
export async function saveClientForm(
  db: Executor,
  ctx: OrgContext,
  form: ClientForm,
  existingCode: string | null,
): Promise<ClientFormOutcome> {
  assertManager(ctx);
  const validated = validateClientForm(
    form,
    ctx.calendarYear,
    await storedCompaniesOf(db, ctx, form),
  );
  const { input } = validated;
  if (!input) {
    return { saved: false, fieldErrors: validated.fieldErrors, formErrors: validated.formErrors };
  }
  if (existingCode !== null && input.clientCode !== existingCode) {
    return {
      saved: false,
      fieldErrors: { code: "O código de um cliente cadastrado não pode ser alterado." },
      formErrors: [],
    };
  }

  const [existing] = await db
    .select({ id: client.id })
    .from(client)
    .where(
      and(
        eq(client.orgId, ctx.orgId),
        eq(client.calendarYear, ctx.calendarYear),
        eq(client.code, input.clientCode),
      ),
    );
  if (existingCode === null && existing) {
    return {
      saved: false,
      fieldErrors: { code: `Já existe um cliente com o código ${input.clientCode}.` },
      formErrors: [],
    };
  }
  if (existingCode !== null && !existing) {
    throw new NotFoundError(`Cliente ${existingCode} não encontrado.`);
  }

  const id = await db.transaction(async (tx) => {
    await upsertCompanies(tx, ctx, validated.companies);
    const saved = await saveClient(tx, ctx, input, "MANUAL");
    return saved.id;
  });
  await audit(db, ctx, existingCode === null ? "client.create" : "client.update", "client", id, {
    clientCode: input.clientCode,
    incomeLines: input.incomes.length,
  });
  await recalculate(db, ctx);
  return { saved: true, code: input.clientCode, warnings: validated.warnings };
}

/** Current data of a client, written the way a person types it. */
export async function clientFormValues(
  db: Executor,
  ctx: OrgContext,
  code: string,
): Promise<ClientForm> {
  assertManager(ctx);
  const [stored] = await loadClientInputs(db, ctx, { scope: "visible", codes: [code] });
  if (!stored) throw new NotFoundError(`Cliente ${code} não encontrado.`);
  const { input } = stored;
  return {
    code: input.clientCode,
    nickname: input.nickname ?? "",
    advisorCode: input.advisorCode ?? "",
    irpfAdjustmentDue: asMoney(input.irpfAdjustmentDue),
    incomes: input.incomes.map((line) => ({
      type: line.type,
      amount: asMoney(line.amount),
      month: line.month ? String(line.month) : "",
      payerCode: line.payerCode ?? "",
      taxWithheld: asMoney(line.taxWithheld),
      transition: line.transition === true,
    })),
    companies: (input.payers ?? []).map((payer) => ({
      code: payer.code,
      effectiveRate: asPercent(payer.effectiveRate),
      limitCategory: payer.limitCategory ?? "GERAL",
      simplesNacional: payer.simplesNacional === true,
    })),
    positions: (input.positions ?? []).map((entry) => ({
      assetClass: entry.assetClass,
      balance: asMoney(entry.balance),
      expectedAnnualRate: asPercent(entry.expectedAnnualRate),
      taxRate: asPercent(entry.taxRate),
    })),
  };
}

const LIMIT_NAME: Record<ReducerLimitCategory, string> = {
  GERAL: "Geral",
  FINANCEIRA: "Seguradora ou financeira",
  BANCO: "Banco",
};

/** Income types and reducer limits of the year, as the form shows them. */
export function clientFormOptions(calendarYear: number): {
  incomeTypes: IncomeTypeOption[];
  limitLabels: Record<ReducerLimitCategory, string>;
} {
  const ruleSet = getRuleSet(calendarYear);
  const limit = (category: ReducerLimitCategory) =>
    `${LIMIT_NAME[category]} (${formatPercent(ruleSet.reducer.limits[category], 0)})`;
  return {
    incomeTypes: ruleSet.incomeTypes.map((type) => ({
      code: type.code,
      label: type.label,
      regime: type.regime,
      requiresMonth: type.requiresMonth,
      requiresPayer: type.requiresPayer,
      investable: type.investable,
    })),
    limitLabels: { GERAL: limit("GERAL"), FINANCEIRA: limit("FINANCEIRA"), BANCO: limit("BANCO") },
  };
}
