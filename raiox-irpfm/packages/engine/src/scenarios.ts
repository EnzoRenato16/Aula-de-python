import { calculateClient } from "./calculate.ts";
import { formatBRL, formatPercent } from "./format.ts";
import { D, type Dec, type DecimalInput, money, roundMoney, sum, ZERO } from "./money.ts";
import { DEFAULT_CALENDAR_YEAR, findIncomeType, getRuleSet } from "./rules/index.ts";
import { type IncomeTypeCode, type RuleSet, TAXED_REGIMES } from "./rules/types.ts";
import type { CalculationOptions, ClientInput, ClientResult, IncomeLineInput } from "./types.ts";

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioError";
  }
}

export type DividendSchedule =
  | "EVEN"
  | "CAP_AT_THRESHOLD"
  | readonly { month: number; amount: DecimalInput }[];

export type ScenarioOperation =
  | {
      kind: "MOVE_ALLOCATION";
      fromClass: IncomeTypeCode;
      toClass: IncomeTypeCode;
      amount: DecimalInput;
      /** Expected yield of the destination, per year (fraction). */
      toAnnualRate: DecimalInput;
      /** Yield of the origin; defaults to the client's position of that class. */
      fromAnnualRate?: DecimalInput;
      /** Tax rate on the destination yield; defaults to position or class estimate. */
      toTaxRate?: DecimalInput;
    }
  | { kind: "RESCHEDULE_DIVIDENDS"; payerCode: string; schedule: DividendSchedule }
  | {
      kind: "ADJUST_DIVIDENDS";
      payerCode: string;
      /** Negative = keep in the company / postpone; positive = distribute more (December). */
      delta: DecimalInput;
    };

export interface Scenario {
  name: string;
  operations: readonly ScenarioOperation[];
}

export interface ScenarioSummary {
  totalIncome: Dec;
  totalTaxes: Dec;
  netIncome: Dec;
  minimumTaxDue: Dec;
  withholding: Dec;
  finalBalance: Dec;
  effectiveTaxRate: Dec;
}

export interface ScenarioComparison {
  name: string;
  base: ScenarioSummary;
  scenario: ScenarioSummary;
  /** scenario − base */
  delta: ScenarioSummary;
  baseResult: ClientResult;
  scenarioResult: ClientResult;
  scenarioInput: ClientInput;
  /** Dividends that stop being received in the year (kept in the company or postponed). */
  deferredDividends: Dec;
  notes: string[];
  warnings: string[];
}

const TWELVE = new D(12);

function summarize(result: ClientResult): ScenarioSummary {
  return {
    totalIncome: result.totalIncome,
    totalTaxes: result.totalTaxes,
    netIncome: result.netIncome,
    minimumTaxDue: result.minimumTaxDue,
    withholding: result.withholding.total,
    finalBalance: result.finalBalance,
    effectiveTaxRate: result.effectiveTaxRate,
  };
}

function difference(a: ScenarioSummary, b: ScenarioSummary): ScenarioSummary {
  return {
    totalIncome: b.totalIncome.minus(a.totalIncome),
    totalTaxes: b.totalTaxes.minus(a.totalTaxes),
    netIncome: b.netIncome.minus(a.netIncome),
    minimumTaxDue: b.minimumTaxDue.minus(a.minimumTaxDue),
    withholding: b.withholding.minus(a.withholding),
    finalBalance: b.finalBalance.minus(a.finalBalance),
    effectiveTaxRate: b.effectiveTaxRate.minus(a.effectiveTaxRate),
  };
}

function positiveMoney(value: DecimalInput, what: string): Dec {
  const parsed = money(value);
  if (parsed.lessThanOrEqualTo(0)) throw new ScenarioError(`${what} deve ser maior que zero`);
  return parsed;
}

function nonNegativeRate(value: DecimalInput, what: string): Dec {
  const parsed = money(value);
  if (parsed.isNegative() || parsed.greaterThan(1)) {
    throw new ScenarioError(`${what} deve ser uma fração entre 0 e 1`);
  }
  return parsed;
}

interface WorkingState {
  incomes: IncomeLineInput[];
  /** Position balances, updated by each MOVE_ALLOCATION of the scenario. */
  balances: Map<IncomeTypeCode, Dec>;
  notes: string[];
  warnings: string[];
  deferred: Dec;
}

function moveAllocation(
  state: WorkingState,
  input: ClientInput,
  op: Extract<ScenarioOperation, { kind: "MOVE_ALLOCATION" }>,
  ruleSet: RuleSet,
): void {
  const from = findIncomeType(ruleSet, op.fromClass);
  const to = findIncomeType(ruleSet, op.toClass);
  if (!to.investable) throw new ScenarioError(`${to.label} não é uma classe de investimento`);
  if (op.fromClass === op.toClass) throw new ScenarioError("origem e destino são iguais");
  const amount = positiveMoney(op.amount, "Valor movido");
  const position = input.positions?.find((candidate) => candidate.assetClass === op.fromClass);
  const fromRateInput = op.fromAnnualRate ?? position?.expectedAnnualRate;
  if (fromRateInput === undefined) {
    throw new ScenarioError(
      `Informe a taxa esperada de ${from.label} (aba posições ou no próprio cenário)`,
    );
  }
  const fromRate = nonNegativeRate(fromRateInput, "Taxa da origem");
  const toRate = nonNegativeRate(op.toAnnualRate, "Taxa do destino");
  const balance = state.balances.get(op.fromClass);
  if (balance !== undefined && amount.greaterThan(balance)) {
    throw new ScenarioError(
      `Valor movido (${formatBRL(amount)}) maior que o saldo de ${from.label} (${formatBRL(balance)})`,
    );
  }
  if (balance !== undefined) state.balances.set(op.fromClass, balance.minus(amount));
  state.balances.set(op.toClass, (state.balances.get(op.toClass) ?? ZERO).plus(amount));

  // Origin: reduce the yield realized in the year proportionally.
  const originLines = state.incomes.filter((line) => line.type === op.fromClass);
  const originIncome = sum(originLines.map((line) => money(line.amount)));
  let lost = roundMoney(amount.times(fromRate));
  if (lost.greaterThan(originIncome)) {
    state.warnings.push(
      `O rendimento anual de ${formatBRL(amount)} em ${from.label} (${formatBRL(lost)}) é maior que o informado no ano (${formatBRL(originIncome)}); a redução foi limitada ao informado.`,
    );
    lost = originIncome;
  }
  if (originIncome.greaterThan(0)) {
    const target = originIncome.minus(lost);
    const factor = target.dividedBy(originIncome);
    const scaledLines = originLines.map((line) => {
      const scaled: IncomeLineInput = {
        ...line,
        amount: roundMoney(money(line.amount).times(factor)),
      };
      if (line.taxWithheld !== undefined && line.taxWithheld !== null) {
        scaled.taxWithheld = roundMoney(money(line.taxWithheld).times(factor));
      }
      return scaled;
    });
    // Rounding remainder goes to the last line, so the class total is exact.
    const last = scaledLines.at(-1);
    if (last) {
      const drift = target.minus(sum(scaledLines.map((line) => money(line.amount))));
      last.amount = money(last.amount).plus(drift);
    }
    state.incomes = [
      ...state.incomes.filter((line) => line.type !== op.fromClass),
      ...scaledLines.filter((line) => money(line.amount).greaterThan(0)),
    ];
  }

  // Destination: annual yield with its own tax regime.
  const gained = roundMoney(amount.times(toRate));
  const destination: IncomeLineInput = { type: op.toClass, amount: gained };
  if (TAXED_REGIMES.has(to.regime)) {
    const destinationPosition = input.positions?.find(
      (candidate) => candidate.assetClass === op.toClass,
    );
    const taxRateInput = op.toTaxRate ?? destinationPosition?.taxRate ?? to.estimatedTaxRate;
    const taxRate =
      taxRateInput === null || taxRateInput === undefined
        ? ZERO
        : nonNegativeRate(taxRateInput, "Alíquota do destino");
    destination.taxWithheld = roundMoney(gained.times(taxRate));
  }
  state.incomes.push(destination);
  state.notes.push(
    `Mover ${formatBRL(amount)} de ${from.label} (${formatPercent(fromRate, 2)} a.a.) para ${to.label} (${formatPercent(toRate, 2)} a.a.): rendimento do ano −${formatBRL(lost)} / +${formatBRL(gained)}. Premissa: rendimento de 12 meses realizado no ano.`,
  );
}

function regularDividendLines(state: WorkingState, payerCode: string) {
  const regular: IncomeLineInput[] = [];
  const rest: IncomeLineInput[] = [];
  for (const line of state.incomes) {
    const isRegular =
      line.type === "DIVIDENDOS" && line.payerCode === payerCode && line.transition !== true;
    (isRegular ? regular : rest).push(line);
  }
  return { regular, rest, total: sum(regular.map((line) => money(line.amount))) };
}

function rescheduleDividends(
  state: WorkingState,
  op: Extract<ScenarioOperation, { kind: "RESCHEDULE_DIVIDENDS" }>,
  ruleSet: RuleSet,
): void {
  const { rest, total } = regularDividendLines(state, op.payerCode);
  if (total.isZero()) {
    throw new ScenarioError(`Empresa ${op.payerCode} sem dividendos (fora da transição) no ano`);
  }
  const threshold = ruleSet.monthlyWithholding.threshold;
  let schedule: { month: number; amount: Dec }[];
  if (op.schedule === "EVEN") {
    const monthly = roundMoney(total.dividedBy(TWELVE));
    schedule = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, amount: monthly }));
    const last = schedule[11];
    if (last) last.amount = total.minus(monthly.times(11));
  } else if (op.schedule === "CAP_AT_THRESHOLD") {
    schedule = [];
    let remaining = total;
    for (let month = 1; month <= 12 && remaining.greaterThan(0); month++) {
      const amount =
        month === 12 ? remaining : remaining.lessThan(threshold) ? remaining : threshold;
      schedule.push({ month, amount });
      remaining = remaining.minus(amount);
    }
  } else {
    schedule = op.schedule.map((entry) => {
      if (!Number.isInteger(entry.month) || entry.month < 1 || entry.month > 12) {
        throw new ScenarioError("mês do calendário deve ser de 1 a 12");
      }
      const amount = money(entry.amount);
      if (amount.isNegative())
        throw new ScenarioError("valores do calendário não podem ser negativos");
      return { month: entry.month, amount };
    });
    const scheduled = sum(schedule.map((entry) => entry.amount));
    if (!scheduled.equals(total)) {
      throw new ScenarioError(
        `O calendário deve somar ${formatBRL(total)} (soma informada: ${formatBRL(scheduled)})`,
      );
    }
  }
  state.incomes = [
    ...rest,
    ...schedule
      .filter((entry) => entry.amount.greaterThan(0))
      .map(
        (entry): IncomeLineInput => ({
          type: "DIVIDENDOS",
          amount: entry.amount,
          month: entry.month,
          payerCode: op.payerCode,
          transition: false,
        }),
      ),
  ];
  state.notes.push(
    `Redistribuir ${formatBRL(total)} de dividendos de ${op.payerCode} ao longo do ano. Isso muda a retenção (caixa), não o imposto do ano: a retenção é antecipação do IRPFM.`,
  );
}

function adjustDividends(
  state: WorkingState,
  op: Extract<ScenarioOperation, { kind: "ADJUST_DIVIDENDS" }>,
): void {
  const delta = money(op.delta);
  if (delta.isZero()) return;
  const { regular, rest, total } = regularDividendLines(state, op.payerCode);
  if (delta.greaterThan(0)) {
    state.incomes.push({
      type: "DIVIDENDOS",
      amount: delta,
      month: 12,
      payerCode: op.payerCode,
      transition: false,
    });
    state.notes.push(`Distribuir mais ${formatBRL(delta)} de ${op.payerCode} em dezembro.`);
    return;
  }
  const reduction = delta.negated();
  if (reduction.greaterThan(total)) {
    throw new ScenarioError(
      `Redução de ${formatBRL(reduction)} maior que os dividendos de ${op.payerCode} no ano (${formatBRL(total)})`,
    );
  }
  // Reduce from the latest months backwards.
  let remaining = reduction;
  const adjusted = [...regular]
    .sort((a, b) => (b.month ?? 0) - (a.month ?? 0))
    .map((line) => {
      const amount = money(line.amount);
      const cut = remaining.lessThan(amount) ? remaining : amount;
      remaining = remaining.minus(cut);
      return { ...line, amount: amount.minus(cut) };
    })
    .filter((line) => money(line.amount).greaterThan(0));
  state.incomes = [...rest, ...adjusted];
  state.deferred = state.deferred.plus(reduction);
  state.notes.push(
    `${formatBRL(reduction)} de dividendos de ${op.payerCode} deixam de ser recebidos no ano (retidos na empresa ou postergados). O líquido do ano cai; esse valor não some, só é tributado quando for distribuído.`,
  );
}

/** Applies the operations to a copy of the input. Pure: the input is not mutated. */
export function applyScenario(
  input: ClientInput,
  scenario: Scenario,
  ruleSet: RuleSet,
): { input: ClientInput; notes: string[]; warnings: string[]; deferred: Dec } {
  const state: WorkingState = {
    incomes: input.incomes.map((line) => ({ ...line })),
    balances: new Map(
      (input.positions ?? []).map((position) => [position.assetClass, money(position.balance)]),
    ),
    notes: [],
    warnings: [],
    deferred: ZERO,
  };
  for (const op of scenario.operations) {
    switch (op.kind) {
      case "MOVE_ALLOCATION":
        moveAllocation(state, input, op, ruleSet);
        break;
      case "RESCHEDULE_DIVIDENDS":
        rescheduleDividends(state, op, ruleSet);
        break;
      case "ADJUST_DIVIDENDS":
        adjustDividends(state, op);
        break;
    }
  }
  return {
    input: { ...input, incomes: state.incomes },
    notes: state.notes,
    warnings: state.warnings,
    deferred: state.deferred,
  };
}

/**
 * Simulates a scenario and compares it with the base case. The comparison is
 * always by net income after ALL taxes, never only by tax saved.
 */
export function compareScenario(
  input: ClientInput,
  scenario: Scenario,
  options: CalculationOptions = {},
): ScenarioComparison {
  const ruleSet = options.ruleSet ?? getRuleSet(options.calendarYear ?? DEFAULT_CALENDAR_YEAR);
  const calcOptions: CalculationOptions = { ...options, ruleSet, skipMarginal: true };
  const baseResult = calculateClient(input, calcOptions);
  const applied = applyScenario(input, scenario, ruleSet);
  const scenarioResult = calculateClient(applied.input, calcOptions);
  const base = summarize(baseResult);
  const simulated = summarize(scenarioResult);
  const delta = difference(base, simulated);

  const verdict = delta.netIncome.greaterThan(0)
    ? `aumenta o rendimento líquido em ${formatBRL(delta.netIncome)}`
    : delta.netIncome.isNegative()
      ? `reduz o rendimento líquido em ${formatBRL(delta.netIncome.negated())}`
      : "não altera o rendimento líquido";
  const notes = [
    ...applied.notes,
    `Neste cenário, o resultado ${verdict} (impostos: ${delta.totalTaxes.isNegative() ? "−" : "+"}${formatBRL(delta.totalTaxes.abs())}). Simulação, não recomendação.`,
  ];

  return {
    name: scenario.name,
    base,
    scenario: simulated,
    delta,
    baseResult,
    scenarioResult,
    scenarioInput: applied.input,
    deferredDividends: applied.deferred,
    notes,
    warnings: applied.warnings,
  };
}
