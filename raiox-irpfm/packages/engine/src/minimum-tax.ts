import { type Dec, ZERO } from "./money.ts";
import type { RuleSet } from "./rules/types.ts";

const PERCENT = 100;

/**
 * Alíquota of the minimum tax as a fraction (art. 16-A §2º; R-16A-10..13).
 * Not rounded: the law sets no rounding for the rate.
 */
export function minimumTaxRate(base: Dec, ruleSet: RuleSet): Dec {
  const { threshold, fullRateFrom, maxRate, linearDivisor, linearOffset } = ruleSet.minimumTax;
  if (base.lessThanOrEqualTo(threshold)) return ZERO;
  if (base.greaterThanOrEqualTo(fullRateFrom)) return maxRate;
  return base.dividedBy(linearDivisor).minus(linearOffset).dividedBy(PERCENT);
}

/** Gross minimum tax = alíquota × base (§3º caput), unrounded. */
export function grossMinimumTax(base: Dec, ruleSet: RuleSet): Dec {
  return minimumTaxRate(base, ruleSet).times(base);
}

/**
 * Marginal rate of the gross minimum tax with respect to the base
 * (derivative), used for the transition-band alert: base ÷ 3.000.000 − 0,1
 * inside the band.
 */
export function grossMinimumTaxDerivative(base: Dec, ruleSet: RuleSet): Dec {
  const { threshold, fullRateFrom, maxRate, linearDivisor, linearOffset } = ruleSet.minimumTax;
  if (base.lessThanOrEqualTo(threshold)) return ZERO;
  if (base.greaterThanOrEqualTo(fullRateFrom)) return maxRate;
  return base.times(2).dividedBy(linearDivisor).minus(linearOffset).dividedBy(PERCENT);
}
