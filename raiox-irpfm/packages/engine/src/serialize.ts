import { D, toMoneyString, toRateString } from "./money.ts";
import type { ClientResult, TrailStep } from "./types.ts";

/**
 * JSON-safe representation of a result: every Decimal becomes a canonical
 * string ("1234.56" for money, up to 10 decimals for rates). This is what is
 * stored, exported and sent to the text generator (never floats).
 */
export type Serialized<T> =
  T extends InstanceType<typeof D>
    ? string
    : T extends readonly (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

const RATE_KEYS = new Set([
  "rate",
  "effectiveTaxRate",
  "pjEffectiveRate",
  "irpfmEffectiveRate",
  "limit",
]);

function serializeValue(value: unknown, key: string, unit?: string): unknown {
  if (value instanceof D) {
    const isRate = RATE_KEYS.has(key) || (key === "value" && unit !== undefined && unit !== "BRL");
    return isRate ? toRateString(value) : toMoneyString(value);
  }
  if (Array.isArray(value)) return value.map((item) => serializeValue(item, key));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const stepUnit = typeof record.unit === "string" ? record.unit : undefined;
    return Object.fromEntries(
      Object.entries(record).map(([entryKey, entry]) => [
        entryKey,
        serializeValue(entry, entryKey, stepUnit),
      ]),
    );
  }
  return value;
}

export function serializeResult(result: ClientResult): Serialized<ClientResult> {
  return serializeValue(result, "") as Serialized<ClientResult>;
}

export function serializeTrail(trail: readonly TrailStep[]): Serialized<TrailStep>[] {
  return serializeValue(trail, "") as Serialized<TrailStep>[];
}
