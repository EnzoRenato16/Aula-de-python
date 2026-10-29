import { Decimal } from "decimal.js";

/**
 * Decimal constructor used by the whole engine. A private clone keeps the
 * configuration local (no global mutation of decimal.js) and gives 40
 * significant digits to intermediate results.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

/** Accepted external representation of money and rates: never a JS number. */
export type DecimalInput = string | Dec;

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

/** Parses a canonical decimal string ("1234.56") or passes a Decimal through. */
export function money(value: DecimalInput): Dec {
  if (value instanceof D) return value;
  if (typeof value !== "string") {
    throw new TypeError(`Expected a decimal string, got ${typeof value}`);
  }
  const trimmed = value.trim();
  if (!PLAIN_DECIMAL.test(trimmed)) {
    throw new TypeError(`Invalid decimal string: "${value}"`);
  }
  return new D(trimmed);
}

export const ZERO: Dec = new D(0);

/**
 * THE rounding rule (R-ARR-01): cents, half up. Every monetary value that
 * appears in a result goes through this function and nowhere else.
 */
export function roundMoney(value: Dec): Dec {
  return value.toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Canonical serialization of a monetary value: "1234.56". */
export function toMoneyString(value: Dec): string {
  return roundMoney(value).toFixed(2); // float-guard: allow (Decimal#toFixed)
}

/** Canonical serialization of a rate (fraction): up to 10 decimal places. */
export function toRateString(value: Dec): string {
  return value.toDecimalPlaces(10, D.ROUND_HALF_UP).toString();
}

export function sum(values: Iterable<Dec>): Dec {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}

/** Larger of two values; on a tie returns `a` (so maxDec(ZERO, −0) is +0). */
export function maxDec(a: Dec, b: Dec): Dec {
  return a.greaterThanOrEqualTo(b) ? a : b;
}

/** Smaller of two values; on a tie returns `a`. */
export function minDec(a: Dec, b: Dec): Dec {
  return a.lessThanOrEqualTo(b) ? a : b;
}
