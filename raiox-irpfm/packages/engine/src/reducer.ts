import { grossMinimumTax, minimumTaxRate } from "./minimum-tax.ts";
import { type Dec, maxDec, roundMoney, sum, ZERO } from "./money.ts";
import type { NormalizedPayer } from "./normalize.ts";
import type { RuleSet } from "./rules/types.ts";
import type { ReducerDenominator, ReducerEntry, ReducerStrategy } from "./types.ts";

/** Art. 16-B §2º: dividends × max(0, PJ rate + IRPFM rate − limit). R-16B-01. */
export function reducerForPayer(params: {
  dividends: Dec;
  pjEffectiveRate: Dec;
  irpfmEffectiveRate: Dec;
  limit: Dec;
}): Dec {
  const excess = params.pjEffectiveRate.plus(params.irpfmEffectiveRate).minus(params.limit);
  return roundMoney(params.dividends.times(maxDec(ZERO, excess)));
}

export interface ReducerContext {
  ruleSet: RuleSet;
  base: Dec;
  /** Base without the dividends included in it (§3º II "a"). */
  baseWithoutDividends: Dec;
  dividendsInBase: Dec;
  dividendsAllReceived: Dec;
  /** Deductions I to IV, already rounded. */
  deductionsBeforeReducer: Dec;
}

/** Minimum tax due before the reducer, for a given base (§§3º and 4º without item V). */
function dueBeforeReducer(base: Dec, context: ReducerContext): Dec {
  const gross = roundMoney(grossMinimumTax(base, context.ruleSet));
  return maxDec(ZERO, gross.minus(context.deductionsBeforeReducer));
}

/**
 * "Alíquota efetiva da tributação mínima" of art. 16-B §3º II (R-16B-04/05).
 * The law is ambiguous; strategies are pluggable and marked PENDENTE.
 */
export function irpfmEffectiveRate(
  strategy: ReducerStrategy,
  denominator: ReducerDenominator,
  context: ReducerContext,
): Dec {
  const divisor =
    denominator === "IN_BASE" ? context.dividendsInBase : context.dividendsAllReceived;
  if (divisor.isZero()) return ZERO;
  switch (strategy) {
    case "NOMINAL_RATE":
      return minimumTaxRate(context.base, context.ruleSet);
    case "INCREMENTAL_GROSS": {
      const withDividends = roundMoney(grossMinimumTax(context.base, context.ruleSet));
      const without = roundMoney(grossMinimumTax(context.baseWithoutDividends, context.ruleSet));
      return withDividends.minus(without).dividedBy(divisor);
    }
    case "INCREMENTAL_NET": {
      const withDividends = dueBeforeReducer(context.base, context);
      const without = dueBeforeReducer(context.baseWithoutDividends, context);
      return withDividends.minus(without).dividedBy(divisor);
    }
  }
}

export interface ReducerComputation {
  strategy: ReducerStrategy;
  denominator: ReducerDenominator;
  entries: ReducerEntry[];
  total: Dec;
}

export function computeReducer(
  strategy: ReducerStrategy,
  denominator: ReducerDenominator,
  context: ReducerContext,
  dividendsByPayer: readonly { payer: NormalizedPayer; dividends: Dec }[],
  applies: boolean,
): ReducerComputation {
  const irpfmRate = applies ? irpfmEffectiveRate(strategy, denominator, context) : ZERO;
  const entries = dividendsByPayer.map(({ payer, dividends }): ReducerEntry => {
    const limit = context.ruleSet.reducer.limits[payer.limitCategory];
    const common = {
      payerCode: payer.code,
      dividends,
      pjEffectiveRate: payer.effectiveRate,
      irpfmEffectiveRate: irpfmRate,
      limit,
      limitCategory: payer.limitCategory,
    };
    if (!applies) return { ...common, value: ZERO, status: "NAO_SE_APLICA" };
    if (payer.effectiveRate === null) return { ...common, value: ZERO, status: "SEM_ALIQUOTA_PJ" };
    const value = reducerForPayer({
      dividends,
      pjEffectiveRate: payer.effectiveRate,
      irpfmEffectiveRate: irpfmRate,
      limit,
    });
    return { ...common, value, status: "CALCULADO" };
  });
  return { strategy, denominator, entries, total: sum(entries.map((entry) => entry.value)) };
}

const ALL_STRATEGIES: readonly ReducerStrategy[] = [
  "INCREMENTAL_NET",
  "INCREMENTAL_GROSS",
  "NOMINAL_RATE",
];

/** Conservative choice: the smallest reducer among the strategies (IN_BASE, see R-16B-05). */
export function computeMinimumReducer(
  context: ReducerContext,
  dividendsByPayer: readonly { payer: NormalizedPayer; dividends: Dec }[],
  applies: boolean,
): ReducerComputation {
  const candidates = ALL_STRATEGIES.map((strategy) =>
    computeReducer(strategy, "IN_BASE", context, dividendsByPayer, applies),
  );
  return candidates.reduce((best, candidate) =>
    candidate.total.lessThan(best.total) ? candidate : best,
  );
}
