import { type Dec, roundMoney } from "./money.ts";

/**
 * pt-BR formatting for the calculation trail. Implemented by hand (no Intl)
 * so the output is identical on every runtime and ICU version.
 */
function groupThousands(integerPart: string): string {
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatFixed(value: Dec, places: number): string {
  const fixed = value.abs().toFixed(places); // float-guard: allow (Decimal#toFixed)
  const [integerPart = "0", fraction] = fixed.split(".");
  const sign = value.isNegative() && !value.isZero() ? "−" : "";
  return `${sign}${groupThousands(integerPart)}${fraction === undefined ? "" : `,${fraction}`}`;
}

/** "R$ 1.234,56" */
export function formatBRL(value: Dec): string {
  return `R$ ${formatFixed(roundMoney(value), 2)}`;
}

/** Fraction → "5,0000%" */
export function formatPercent(fraction: Dec, places = 4): string {
  return `${formatFixed(fraction.times(100), places)}%`;
}

/** Plain number with pt-BR separators: "60.000" */
export function formatNumber(value: Dec, places = 0): string {
  return formatFixed(value, places);
}
