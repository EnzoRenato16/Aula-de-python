import { type Dec, maxDec, minDec, roundMoney, ZERO } from "./money.ts";
import type { RuleSet } from "./rules/types.ts";

/**
 * ESTIMATE of the IRPF devido in the annual adjustment (R-16A-22), used only
 * when the accountant's figure is missing. Simplified discount (Lei 9.250,
 * art. 10, X), 2026 annual table (IN 1.500, Anexo VII, X) and the annual
 * reduction of art. 11-A. Never presented as an exact figure.
 */
export function estimateIrpfAdjustment(taxableIncome: Dec, ruleSet: RuleSet): Dec {
  const { annualTable, simplifiedDiscountRate, simplifiedDiscountCap, reduction } =
    ruleSet.irpfEstimate;
  if (taxableIncome.lessThanOrEqualTo(0)) return ZERO;

  const discount = minDec(taxableIncome.times(simplifiedDiscountRate), simplifiedDiscountCap);
  const base = maxDec(ZERO, taxableIncome.minus(discount));
  const bracket = annualTable.find((row) => row.upTo === null || base.lessThanOrEqualTo(row.upTo));
  if (!bracket) throw new Error("Tabela progressiva anual sem faixa final");
  const tax = maxDec(ZERO, base.times(bracket.rate).minus(bracket.deduction));

  let annualReduction = ZERO;
  if (taxableIncome.lessThanOrEqualTo(reduction.fullUpTo)) {
    annualReduction = minDec(tax, reduction.fullMax);
  } else if (taxableIncome.lessThanOrEqualTo(reduction.phaseOutUpTo)) {
    const linear = reduction.phaseOutConstant.minus(reduction.phaseOutFactor.times(taxableIncome));
    annualReduction = minDec(tax, maxDec(ZERO, linear));
  }
  return roundMoney(tax.minus(annualReduction));
}
