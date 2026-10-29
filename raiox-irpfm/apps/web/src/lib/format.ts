import { D, formatBRL, formatPercent } from "@raiox/engine";

/**
 * Display helpers for values that arrive serialized ("1234.56", "0.05").
 * Formatting only: no arithmetic happens here.
 */
export function brl(value: string | null | undefined): string {
  return value === null || value === undefined ? "—" : formatBRL(new D(value));
}

export function pct(value: string | null | undefined, places = 2): string {
  return value === null || value === undefined ? "—" : formatPercent(new D(value), places);
}

export function isPositive(value: string): boolean {
  return new D(value).greaterThan(0);
}

export function compareDecimal(a: string, b: string): number {
  return new D(a).comparedTo(new D(b));
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const dateOnly = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function formatDateTime(date: Date | string): string {
  return dateTime.format(typeof date === "string" ? new Date(date) : date);
}

export function formatDate(date: Date | string): string {
  return dateOnly.format(typeof date === "string" ? new Date(date) : date);
}

export const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Signed amount for differences: "+R$ 1.000,00", "−R$ 1.000,00", "R$ 0,00". */
export function signedBrl(value: string): string {
  const amount = new D(value);
  if (amount.isZero()) return brl("0.00");
  return `${amount.isNegative() ? "−" : "+"}${formatBRL(amount.abs())}`;
}

/** Signed difference of two rates, in percentage points: "+0,52 p.p.". */
export function signedPoints(value: string, places = 2): string {
  const points = new D(value).times(100);
  const text = points.abs().toFixed(places).replace(".", ",");
  if (points.isZero()) return `0,${"0".repeat(places)} p.p.`;
  return `${points.isNegative() ? "−" : "+"}${text} p.p.`;
}
