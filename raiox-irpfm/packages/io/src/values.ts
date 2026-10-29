import { D } from "@raiox/engine";

/**
 * A raw spreadsheet cell. `numeric` tells whether the value came from a
 * numeric XLSX cell (raw XML text, e.g. "1234.5" or "1.2E5") or from text
 * (where pt-BR separators apply). Numbers never pass through a JS float.
 */
export interface Cell {
  text: string;
  numeric: boolean;
}

export type Parsed<T, Extra = object> =
  | ({ ok: true; value: T } & Extra)
  | { ok: false; error: string };

const PLAIN = /^\d+(\.\d+)?([eE][-+]?\d+)?$/;
const PT_BR_THOUSANDS_ONLY = /^\d{1,3}(\.\d{3})+$/;
const PT_BR_DECIMAL = /^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/;

/** Converts a cell into a canonical non-negative decimal string, or null if unparseable. */
function toCanonicalDecimal(cell: Cell): string | null {
  let text = cell.text.replace(/ /g, " ").trim();
  if (cell.numeric) return PLAIN.test(text) ? new D(text).toString() : null;
  text = text.replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (text === "") return null;
  if (text.includes(",")) {
    if (!PT_BR_DECIMAL.test(text)) return null;
    return new D(text.replace(/\./g, "").replace(",", ".")).toString();
  }
  if (PT_BR_THOUSANDS_ONLY.test(text)) return new D(text.replace(/\./g, "")).toString();
  return PLAIN.test(text) ? new D(text).toString() : null;
}

/** Money: ≥ 0, rounded half up to cents (flagged when rounding changed the value). */
export function parseMoney(cell: Cell): Parsed<string, { rounded: boolean }> {
  const canonical = toCanonicalDecimal(cell);
  if (canonical === null) {
    return { ok: false, error: `valor inválido: "${cell.text}" (use 60.000,00 ou 60000,00)` };
  }
  const value = new D(canonical);
  const cents = value.toDecimalPlaces(2, D.ROUND_HALF_UP);
  return { ok: true, value: cents.toFixed(2), rounded: !cents.equals(value) };
}

const HUNDRED = new D(100);

/**
 * Rate as a fraction. "32%" → 0.32; plain ≤ 1 → fraction; plain in (1, 100]
 * → percentage (flagged); above 100% → error.
 */
export function parseRate(cell: Cell): Parsed<string, { interpretedAsPercent: boolean }> {
  const raw = cell.text.trim();
  const isPercent = !cell.numeric && raw.endsWith("%");
  const canonical = toCanonicalDecimal({
    text: isPercent ? raw.slice(0, -1) : raw,
    numeric: cell.numeric,
  });
  if (canonical === null)
    return { ok: false, error: `taxa inválida: "${cell.text}" (use 32% ou 0,32)` };
  let value = new D(canonical);
  let interpretedAsPercent = false;
  if (isPercent) {
    value = value.dividedBy(HUNDRED);
  } else if (value.greaterThan(1)) {
    value = value.dividedBy(HUNDRED);
    interpretedAsPercent = true;
  }
  if (value.greaterThan(1)) return { ok: false, error: `taxa acima de 100%: "${cell.text}"` };
  return { ok: true, value: value.toString(), interpretedAsPercent };
}

export function parseMonth(cell: Cell): Parsed<number> {
  const raw = cell.text.trim();
  if (!/^\d{1,2}$/.test(raw))
    return { ok: false, error: `mês inválido: "${cell.text}" (use 1 a 12)` };
  const month = Number.parseInt(raw, 10);
  if (month < 1 || month > 12)
    return { ok: false, error: `mês inválido: "${cell.text}" (use 1 a 12)` };
  return { ok: true, value: month };
}

const YES = new Set(["s", "sim", "y", "yes", "true", "verdadeiro", "1", "x"]);
const NO = new Set(["n", "nao", "no", "false", "falso", "0"]);

export function parseYesNo(cell: Cell): Parsed<boolean> {
  const raw = cell.text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (YES.has(raw)) return { ok: true, value: true };
  if (NO.has(raw)) return { ok: true, value: false };
  return { ok: false, error: `use S ou N (recebido: "${cell.text}")` };
}

const CODE = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;

/** Pseudonymous code: uppercased; letters without accents, digits, ".", "_", "-"; ≤ 40 chars. */
export function parseCode(cell: Cell): Parsed<string> {
  const value = cell.text.trim().toUpperCase();
  if (!CODE.test(value)) {
    return {
      ok: false,
      error: `código inválido: "${cell.text}" (até 40 caracteres: letras sem acento, números, ponto, hífen, sublinhado)`,
    };
  }
  return { ok: true, value };
}

/** Returns the kind of personal data a text looks like, or null. LGPD guard. */
export function looksLikePersonalData(text: string): "CPF" | "CNPJ" | "e-mail" | "telefone" | null {
  const value = text.trim();
  if (/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.test(value)) return "CNPJ";
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(value)) return "CPF";
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) return "e-mail";
  if (/\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/.test(value)) return "telefone";
  return null;
}
