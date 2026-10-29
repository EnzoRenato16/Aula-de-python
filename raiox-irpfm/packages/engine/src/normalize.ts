import { type Dec, money } from "./money.ts";
import { findIncomeType } from "./rules/index.ts";
import type { IncomeTypeDefinition, ReducerLimitCategory, RuleSet } from "./rules/types.ts";
import type { ClientInput } from "./types.ts";

export class EngineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineInputError";
  }
}

export interface NormalizedLine {
  definition: IncomeTypeDefinition;
  amount: Dec;
  month: number | null;
  payerCode: string | null;
  transition: boolean;
  taxInformed: Dec | null;
}

export interface NormalizedPayer {
  code: string;
  effectiveRate: Dec | null;
  limitCategory: ReducerLimitCategory;
  simplesNacional: boolean;
}

export interface NormalizedClient {
  clientCode: string;
  nickname: string | null;
  advisorCode: string | null;
  lines: NormalizedLine[];
  payers: Map<string, NormalizedPayer>;
  irpfAdjustmentDue: Dec | null;
}

function nonNegative(value: Dec, what: string): Dec {
  if (value.isNegative()) throw new EngineInputError(`${what} não pode ser negativo`);
  return value;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareLines(a: NormalizedLine, b: NormalizedLine): number {
  const keyA = [a.definition.code, a.payerCode ?? "", String(a.month ?? 0).padStart(2, "0")];
  const keyB = [b.definition.code, b.payerCode ?? "", String(b.month ?? 0).padStart(2, "0")];
  for (let i = 0; i < keyA.length; i++) {
    const cmp = compareText(keyA[i] ?? "", keyB[i] ?? "");
    if (cmp !== 0) return cmp;
  }
  if (a.transition !== b.transition) return a.transition ? 1 : -1;
  const amount = a.amount.comparedTo(b.amount);
  if (amount !== 0) return amount;
  const taxA = a.taxInformed?.toString() ?? "";
  const taxB = b.taxInformed?.toString() ?? "";
  return compareText(taxA, taxB);
}

/**
 * Validates and canonicalizes the input. Lines are sorted by a total order so
 * every downstream computation is independent of the input order.
 */
export function normalizeClient(input: ClientInput, ruleSet: RuleSet): NormalizedClient {
  if (!input.clientCode.trim()) throw new EngineInputError("codigo_cliente é obrigatório");

  const lines = input.incomes.map((line, index): NormalizedLine => {
    const where = `linha ${index + 1} (${line.type})`;
    const definition = findIncomeType(ruleSet, line.type);
    const month = line.month ?? null;
    if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new EngineInputError(`${where}: mês deve ser de 1 a 12`);
    }
    if (definition.requiresMonth && month === null) {
      throw new EngineInputError(`${where}: mês é obrigatório para ${definition.code}`);
    }
    const payerCode = line.payerCode?.trim() || null;
    if (definition.requiresPayer && payerCode === null) {
      throw new EngineInputError(`${where}: codigo_empresa é obrigatório para ${definition.code}`);
    }
    const taxInformed =
      line.taxWithheld === undefined || line.taxWithheld === null
        ? null
        : nonNegative(money(line.taxWithheld), `${where}: IR`);
    return {
      definition,
      amount: nonNegative(money(line.amount), `${where}: valor`),
      month,
      payerCode,
      transition: definition.code === "DIVIDENDOS" && line.transition === true,
      taxInformed,
    };
  });
  lines.sort(compareLines);

  const payers = new Map<string, NormalizedPayer>();
  for (const payer of input.payers ?? []) {
    const code = payer.code.trim();
    if (payers.has(code)) throw new EngineInputError(`empresa duplicada: ${code}`);
    const effectiveRate =
      payer.effectiveRate === undefined || payer.effectiveRate === null
        ? null
        : nonNegative(money(payer.effectiveRate), `empresa ${code}: alíquota efetiva`);
    if (effectiveRate?.greaterThan(1)) {
      throw new EngineInputError(`empresa ${code}: alíquota efetiva deve ser uma fração (0 a 1)`);
    }
    payers.set(code, {
      code,
      effectiveRate,
      limitCategory: payer.limitCategory ?? "GERAL",
      simplesNacional: payer.simplesNacional === true,
    });
  }

  const irpf =
    input.irpfAdjustmentDue === undefined || input.irpfAdjustmentDue === null
      ? null
      : nonNegative(money(input.irpfAdjustmentDue), "IRPF devido no ajuste");

  return {
    clientCode: input.clientCode.trim(),
    nickname: input.nickname?.trim() || null,
    advisorCode: input.advisorCode?.trim() || null,
    lines,
    payers,
    irpfAdjustmentDue: irpf,
  };
}

/** Payer attributes, with defaults for companies that are not in the payers list. */
export function payerOf(client: NormalizedClient, code: string): NormalizedPayer {
  return (
    client.payers.get(code) ?? {
      code,
      effectiveRate: null,
      limitCategory: "GERAL",
      simplesNacional: false,
    }
  );
}
