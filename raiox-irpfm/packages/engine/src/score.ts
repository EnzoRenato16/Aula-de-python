import { D, type Dec, minDec, ZERO } from "./money.ts";
import { getRuleSet } from "./rules/index.ts";
import type { ClientResult } from "./types.ts";

/**
 * Opportunity score (0–100) used to rank the client base. Product heuristic,
 * NOT a tax rule. Formula documented in docs/SCORE.md; weights and reference
 * values are adjustable per office.
 */
export interface ScoreConfig {
  weights: {
    irpfmToPay: Dec;
    transitionBand: Dec;
    refund: Dec;
    withholding: Dec;
    missingData: Dec;
  };
  /** Amounts that saturate each component at 1. */
  references: {
    irpfmToPay: Dec;
    refund: Dec;
    withholding: Dec;
  };
  /** "Near the threshold" share of the R$ 600 mil threshold (scores half the band weight). */
  nearThresholdShare: Dec;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  weights: {
    irpfmToPay: new D("0.40"),
    transitionBand: new D("0.20"),
    refund: new D("0.15"),
    withholding: new D("0.15"),
    missingData: new D("0.10"),
  },
  references: {
    irpfmToPay: new D("50000"),
    refund: new D("20000"),
    withholding: new D("30000"),
  },
  nearThresholdShare: new D("0.9"),
};

export interface ScoreComponent {
  key: keyof ScoreConfig["weights"];
  label: string;
  weight: Dec;
  /** 0 to 1 */
  value: Dec;
  /** weight × value × 100 */
  points: Dec;
}

export interface OpportunityScore {
  score: Dec;
  components: ScoreComponent[];
}

const ONE = new D(1);
const HALF = new D("0.5");
const HUNDRED = new D(100);

function saturate(amount: Dec, reference: Dec): Dec {
  if (reference.lessThanOrEqualTo(0)) return ZERO;
  return minDec(ONE, amount.dividedBy(reference));
}

export function opportunityScore(
  result: ClientResult,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): OpportunityScore {
  const { threshold, fullRateFrom } = getRuleSet(result.calendarYear).minimumTax;
  const inBand = result.base.greaterThan(threshold) && result.base.lessThan(fullRateFrom);
  const nearThreshold =
    !inBand &&
    result.base.lessThanOrEqualTo(threshold) &&
    result.base.greaterThanOrEqualTo(threshold.times(config.nearThresholdShare));
  const missingData =
    result.grossMinimumTax.greaterThan(0) &&
    (result.deductions.irpfSource !== "INFORMADO" ||
      result.reducerByPayer.some((entry) => entry.status === "SEM_ALIQUOTA_PJ"));

  const raw: Omit<ScoreComponent, "points">[] = [
    {
      key: "irpfmToPay",
      label: "IRPFM a pagar",
      weight: config.weights.irpfmToPay,
      value: saturate(result.amountToPay, config.references.irpfmToPay),
    },
    {
      key: "transitionBand",
      label: "Faixa de transição (ou perto dela)",
      weight: config.weights.transitionBand,
      value: inBand ? ONE : nearThreshold ? HALF : ZERO,
    },
    {
      key: "refund",
      label: "Retenção a restituir",
      weight: config.weights.refund,
      value: saturate(result.amountToRefund, config.references.refund),
    },
    {
      key: "withholding",
      label: "Retenção mensal sobre dividendos (caixa)",
      weight: config.weights.withholding,
      value: saturate(result.withholding.total, config.references.withholding),
    },
    {
      key: "missingData",
      label: "Dado faltando que pode mudar o IRPFM",
      weight: config.weights.missingData,
      value: missingData ? ONE : ZERO,
    },
  ];
  const components = raw.map((component) => ({
    ...component,
    points: component.weight.times(component.value).times(HUNDRED),
  }));
  const score = components
    .reduce((total, component) => total.plus(component.points), ZERO)
    .toDecimalPlaces(1, D.ROUND_HALF_UP);
  return { score, components };
}

export interface RankedClient {
  position: number;
  result: ClientResult;
  score: OpportunityScore;
}

export function rankClients(
  results: readonly ClientResult[],
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): RankedClient[] {
  return results
    .map((result) => ({ result, score: opportunityScore(result, config) }))
    .sort(
      (a, b) =>
        b.score.score.comparedTo(a.score.score) ||
        b.result.amountToPay.comparedTo(a.result.amountToPay) ||
        (a.result.clientCode < b.result.clientCode
          ? -1
          : a.result.clientCode > b.result.clientCode
            ? 1
            : 0),
    )
    .map((entry, index) => ({ position: index + 1, ...entry }));
}
