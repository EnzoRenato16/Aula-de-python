import { buildAlerts } from "./alerts.ts";
import { estimateIrpfAdjustment } from "./irpf-estimate.ts";
import { computeMarginalRates } from "./marginal.ts";
import { grossMinimumTax, minimumTaxRate } from "./minimum-tax.ts";
import { type Dec, maxDec, minDec, roundMoney, sum, ZERO } from "./money.ts";
import { type NormalizedLine, normalizeClient, payerOf } from "./normalize.ts";
import { computeMinimumReducer, computeReducer, type ReducerContext } from "./reducer.ts";
import { DEFAULT_CALENDAR_YEAR, getRuleSet } from "./rules/index.ts";
import { type RuleSet, TAXED_REGIMES, type TaxRegime } from "./rules/types.ts";
import { buildTrail } from "./trail.ts";
import type {
  CalculationOptions,
  ClientInput,
  ClientResult,
  IncomeTypeSummary,
  IrpfSource,
  PendingChoices,
} from "./types.ts";
import { computeWithholding } from "./withholding.ts";

/** Defaults of every PENDENTE choice (docs/REGRAS.md). */
export const DEFAULT_CHOICES: Readonly<PendingChoices> = Object.freeze({
  simplesNacionalWithholding: true,
  exemptStockGainsInBase: true,
  reducerStrategy: "INCREMENTAL_NET",
  reducerDenominator: "IN_BASE",
  estimateIrpfWhenMissing: true,
  estimateTaxWhenMissing: true,
});

/** Conservative mode: the choice that never underestimates the tax (D-006). */
export const CONSERVATIVE_CHOICES: Readonly<PendingChoices> = Object.freeze({
  simplesNacionalWithholding: true,
  exemptStockGainsInBase: true,
  reducerStrategy: "MIN_OF_ALL",
  reducerDenominator: "IN_BASE",
  estimateIrpfWhenMissing: false,
  estimateTaxWhenMissing: false,
});

export function resolveChoices(options: CalculationOptions): PendingChoices {
  if (options.conservative === true) return { ...CONSERVATIVE_CHOICES };
  return { ...DEFAULT_CHOICES, ...stripUndefined(options.choices ?? {}) };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

export interface EvaluatedLine extends NormalizedLine {
  inBase: boolean;
  tax: Dec;
  taxEstimated: Dec;
  taxMissing: boolean;
}

function evaluateLine(
  line: NormalizedLine,
  choices: PendingChoices,
  pending: Set<string>,
): EvaluatedLine {
  const { definition } = line;
  let inBase: boolean;
  switch (definition.base.kind) {
    case "INCLUDED":
      inBase = !line.transition;
      break;
    case "EXCLUDED":
    case "SUBTRACTED":
      inBase = false;
      break;
    case "CHOICE":
      inBase = choices[definition.base.choice];
      if (line.amount.greaterThan(0)) pending.add(definition.base.ruleId);
      break;
  }

  let tax = ZERO;
  let taxEstimated = ZERO;
  let taxMissing = false;
  if (TAXED_REGIMES.has(definition.regime)) {
    if (line.taxInformed !== null) {
      tax = line.taxInformed;
    } else if (choices.estimateTaxWhenMissing && definition.estimatedTaxRate !== null) {
      tax = roundMoney(line.amount.times(definition.estimatedTaxRate));
      taxEstimated = tax;
      if (definition.code === "JCP" && tax.greaterThan(0)) pending.add("R-16A-24");
    } else {
      taxMissing = line.amount.greaterThan(0);
    }
  }
  return { ...line, inBase, tax, taxEstimated, taxMissing };
}

function summarizeByType(lines: readonly EvaluatedLine[], ruleSet: RuleSet): IncomeTypeSummary[] {
  return ruleSet.incomeTypes
    .map((definition): IncomeTypeSummary | null => {
      const ofType = lines.filter((line) => line.definition.code === definition.code);
      if (ofType.length === 0) return null;
      const exclusionRuleId =
        definition.base.kind === "EXCLUDED" || definition.base.kind === "SUBTRACTED"
          ? definition.base.ruleId
          : null;
      return {
        type: definition.code,
        label: definition.label,
        amount: sum(ofType.map((line) => line.amount)),
        tax: sum(ofType.map((line) => line.tax)),
        taxEstimated: sum(ofType.map((line) => line.taxEstimated)),
        inBase: ofType.some((line) => line.inBase),
        exclusionRuleId,
      };
    })
    .filter((summary): summary is IncomeTypeSummary => summary !== null);
}

export function calculateClient(
  input: ClientInput,
  options: CalculationOptions = {},
): ClientResult {
  const ruleSet = options.ruleSet ?? getRuleSet(options.calendarYear ?? DEFAULT_CALENDAR_YEAR);
  const conservative = options.conservative === true;
  const choices = resolveChoices(options);
  const pending = new Set<string>();

  const client = normalizeClient(input, ruleSet);
  const lines = client.lines.map((line) => evaluateLine(line, choices, pending));
  if (lines.some((line) => line.transition)) pending.add("R-6A-11");

  // Base (art. 16-A §1º and §7º)
  const isIncome = (line: EvaluatedLine) => line.definition.base.kind !== "SUBTRACTED";
  const totalIncome = sum(lines.filter(isIncome).map((line) => line.amount));
  const includedIncome = sum(lines.filter((line) => line.inBase).map((line) => line.amount));
  const excludedIncome = totalIncome.minus(includedIncome);
  const requestedBaseDeductions = sum(
    lines.filter((line) => !isIncome(line)).map((line) => line.amount),
  );
  const baseDeductions = minDec(requestedBaseDeductions, includedIncome);
  const base = includedIncome.minus(baseDeductions);

  // Subjection and rate (caput, §2º)
  const { threshold } = ruleSet.minimumTax;
  const subjectToMinimumTax = totalIncome.greaterThan(threshold);
  if (subjectToMinimumTax !== base.greaterThan(threshold)) pending.add("R-16A-01");
  const rate = subjectToMinimumTax ? minimumTaxRate(base, ruleSet) : ZERO;
  const grossMinimumTax_ = roundMoney(subjectToMinimumTax ? grossMinimumTax(base, ruleSet) : ZERO);
  const inLinearBand = rate.greaterThan(0) && rate.lessThan(ruleSet.minimumTax.maxRate);
  if (inLinearBand) {
    pending.add("R-16A-13");
    pending.add("R-ARR-01");
  }

  // Deduction I: IRPF devido no ajuste
  const irpfTaxableIncome = sum(
    lines.filter((line) => line.definition.regime === "AJUSTE").map((line) => line.amount),
  );
  let irpfAdjustment = ZERO;
  let irpfSource: IrpfSource = "AUSENTE";
  if (client.irpfAdjustmentDue !== null) {
    irpfAdjustment = roundMoney(client.irpfAdjustmentDue);
    irpfSource = "INFORMADO";
  } else if (choices.estimateIrpfWhenMissing) {
    irpfAdjustment = estimateIrpfAdjustment(irpfTaxableIncome, ruleSet);
    irpfSource = "ESTIMADO";
  }

  // Deductions II, III and IV: only on lines included in the base (R-16A-16)
  const taxOf = (regime: TaxRegime) =>
    roundMoney(
      sum(
        lines
          .filter((line) => line.inBase && line.definition.regime === regime)
          .map((line) => line.tax),
      ),
    );
  const exclusiveWithholding = taxOf("EXCLUSIVA");
  const law14754 = taxOf("LEI_14754");
  const definitive = taxOf("DEFINITIVA");
  const deductionsBeforeReducer = irpfAdjustment
    .plus(exclusiveWithholding)
    .plus(law14754)
    .plus(definitive);

  // Deduction V: reducer of art. 16-B, per paying company
  const dividendLines = lines.filter((line) => line.definition.code === "DIVIDENDOS");
  const dividendsInBaseByPayer = new Map<string, Dec>();
  for (const line of dividendLines) {
    if (!line.inBase || line.payerCode === null) continue;
    dividendsInBaseByPayer.set(
      line.payerCode,
      (dividendsInBaseByPayer.get(line.payerCode) ?? ZERO).plus(line.amount),
    );
  }
  const dividendsByPayer = [...dividendsInBaseByPayer.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, dividends]) => ({ payer: payerOf(client, code), dividends }));
  const dividendsInBase = sum(dividendsByPayer.map((entry) => entry.dividends));
  const reducerContext: ReducerContext = {
    ruleSet,
    base,
    baseWithoutDividends: maxDec(ZERO, includedIncome.minus(dividendsInBase).minus(baseDeductions)),
    dividendsInBase,
    dividendsAllReceived: sum(dividendLines.map((line) => line.amount)),
    deductionsBeforeReducer,
  };
  const reducerApplies = grossMinimumTax_.greaterThan(0);
  const reducer =
    choices.reducerStrategy === "MIN_OF_ALL"
      ? computeMinimumReducer(reducerContext, dividendsByPayer, reducerApplies)
      : computeReducer(
          choices.reducerStrategy,
          choices.reducerDenominator,
          reducerContext,
          dividendsByPayer,
          reducerApplies,
        );
  if (reducer.entries.some((entry) => entry.status === "CALCULADO")) {
    pending.add("R-16B-04");
    pending.add("R-16B-05");
    pending.add("R-16B-07");
  }

  // Due (§§3º and 4º), withholding (§5º) and balance (§6º)
  const minimumTaxDue = roundMoney(
    maxDec(ZERO, grossMinimumTax_.minus(deductionsBeforeReducer).minus(reducer.total)),
  );
  const withholding = computeWithholding(client, ruleSet, choices, pending);
  const finalBalance = minimumTaxDue.minus(withholding.total);

  // Totals: withholding is an advance of the minimum tax, not an extra cost.
  const lineTaxes = sum(lines.map((line) => line.tax));
  const totalTaxes = irpfAdjustment.plus(lineTaxes).plus(minimumTaxDue);
  const netIncome = totalIncome.minus(totalTaxes);
  const effectiveTaxRate = totalIncome.isZero() ? ZERO : totalTaxes.dividedBy(totalIncome);

  const result: ClientResult = {
    clientCode: client.clientCode,
    nickname: client.nickname,
    advisorCode: client.advisorCode,
    calendarYear: ruleSet.calendarYear,
    ruleSetVersion: ruleSet.version,
    choices,
    conservative,
    totalIncome,
    includedIncome,
    excludedIncome,
    baseDeductions,
    base,
    byType: summarizeByType(lines, ruleSet),
    subjectToMinimumTax,
    rate,
    grossMinimumTax: grossMinimumTax_,
    deductions: {
      irpfAdjustment,
      irpfSource,
      exclusiveWithholding,
      law14754,
      definitive,
      reducer: reducer.total,
    },
    reducerByPayer: reducer.entries,
    reducerStrategyUsed: reducer.strategy,
    reducerDenominatorUsed: reducer.denominator,
    minimumTaxDue,
    withholding,
    finalBalance,
    amountToPay: maxDec(ZERO, finalBalance),
    amountToRefund: maxDec(ZERO, finalBalance.negated()),
    totalTaxes,
    netIncome,
    effectiveTaxRate,
    marginalRates: [],
    trail: [],
    alerts: [],
    pendingRulesUsed: [],
  };

  result.pendingRulesUsed = [...pending].sort();
  result.trail = buildTrail(result, lines, ruleSet);
  result.alerts = buildAlerts(result, lines, ruleSet);
  if (options.skipMarginal !== true) {
    result.marginalRates = computeMarginalRates(
      input,
      options,
      result,
      irpfTaxableIncome,
      ruleSet,
      calculateClient,
    );
  }
  return result;
}
