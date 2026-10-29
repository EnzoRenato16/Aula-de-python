import { estimateIrpfAdjustment } from "./irpf-estimate.ts";
import { type Dec, roundMoney, ZERO } from "./money.ts";
import type { IncomeTypeCode, RuleSet } from "./rules/types.ts";
import type {
  CalculationOptions,
  ClientInput,
  ClientResult,
  IncomeLineInput,
  MarginalRate,
} from "./types.ts";

type Calculate = (input: ClientInput, options: CalculationOptions) => ClientResult;

/** Classes always shown in the marginal-rate panel, besides the client's own. */
const STANDARD_TYPES: readonly IncomeTypeCode[] = [
  "SALARIO",
  "DIVIDENDOS",
  "JCP",
  "RENDA_FIXA",
  "GANHO_BOLSA",
  "LCI",
  "FII_ISENTO",
];

const MARGINAL_PAYER = "__MARGINAL__";

/**
 * Effective marginal rate per income type, by finite difference: add
 * `ruleSet.marginalStep` (R$ 1.000) of the type and measure the change in
 * total taxes (IRPF + line taxes + IRPFM due). Withholding is ignored because
 * it is an advance, not a cost.
 */
export function computeMarginalRates(
  input: ClientInput,
  options: CalculationOptions,
  base: ClientResult,
  irpfTaxableIncome: Dec,
  ruleSet: RuleSet,
  calculate: Calculate,
): MarginalRate[] {
  const step = ruleSet.marginalStep;
  const present = new Set(base.byType.map((summary) => summary.type));
  const types = ruleSet.incomeTypes.filter(
    (definition) =>
      definition.base.kind !== "SUBTRACTED" &&
      (present.has(definition.code) || STANDARD_TYPES.includes(definition.code)),
  );

  const largestPayer =
    [...base.reducerByPayer].sort((a, b) => b.dividends.comparedTo(a.dividends))[0]?.payerCode ??
    MARGINAL_PAYER;

  return types.map((definition): MarginalRate => {
    let extraLine: IncomeLineInput;
    let irpfDelta = ZERO;
    if (definition.code === "DIVIDENDOS") {
      extraLine = {
        type: "DIVIDENDOS",
        amount: step,
        month: 12,
        payerCode: largestPayer,
        transition: false,
      };
    } else if (definition.regime === "AJUSTE") {
      extraLine = { type: definition.code, amount: step };
      irpfDelta = estimateIrpfAdjustment(irpfTaxableIncome.plus(step), ruleSet).minus(
        estimateIrpfAdjustment(irpfTaxableIncome, ruleSet),
      );
    } else {
      const ownTax =
        definition.estimatedTaxRate === null
          ? ZERO
          : roundMoney(step.times(definition.estimatedTaxRate));
      extraLine = { type: definition.code, amount: step, taxWithheld: ownTax };
    }

    const modified: ClientInput = {
      ...input,
      incomes: [...input.incomes, extraLine],
      irpfAdjustmentDue: base.deductions.irpfAdjustment.plus(irpfDelta),
    };
    // The base IRPF is pinned to the value used in the base case so the only
    // change is the marginal one.
    const after = calculate(modified, { ...options, skipMarginal: true });
    const beforeLineTaxes = base.totalTaxes
      .minus(base.deductions.irpfAdjustment)
      .minus(base.minimumTaxDue);
    const afterLineTaxes = after.totalTaxes
      .minus(after.deductions.irpfAdjustment)
      .minus(after.minimumTaxDue);
    const minimumTax = after.minimumTaxDue.minus(base.minimumTaxDue);
    const ownTax = afterLineTaxes.minus(beforeLineTaxes);
    const total = ownTax.plus(irpfDelta).plus(minimumTax);
    return {
      type: definition.code,
      label: definition.label,
      rate: total.dividedBy(step),
      components: { ownTax, irpfAdjustment: irpfDelta, minimumTax },
    };
  });
}
