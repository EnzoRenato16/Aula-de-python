export {
  CONSERVATIVE_CHOICES,
  calculateClient,
  DEFAULT_CHOICES,
  resolveChoices,
} from "./calculate.ts";
export { formatBRL, formatNumber, formatPercent } from "./format.ts";
export { estimateIrpfAdjustment } from "./irpf-estimate.ts";
export { grossMinimumTax, grossMinimumTaxDerivative, minimumTaxRate } from "./minimum-tax.ts";
export * from "./money.ts";
export { EngineInputError } from "./normalize.ts";
export { irpfmEffectiveRate, reducerForPayer } from "./reducer.ts";
export * from "./rules/index.ts";
export {
  applyScenario,
  compareScenario,
  type DividendSchedule,
  type Scenario,
  type ScenarioComparison,
  ScenarioError,
  type ScenarioOperation,
  type ScenarioSummary,
} from "./scenarios.ts";
export {
  DEFAULT_SCORE_CONFIG,
  type OpportunityScore,
  opportunityScore,
  type RankedClient,
  rankClients,
  type ScoreComponent,
  type ScoreConfig,
} from "./score.ts";
export { type Serialized, serializeResult, serializeTrail } from "./serialize.ts";
export { MONTH_NAMES, monthName } from "./trail.ts";
export * from "./types.ts";
