import {
  compareScenario,
  type Scenario,
  type ScenarioComparison,
  ScenarioError,
  type ScenarioOperation,
  serializeResult,
  toMoneyString,
  toRateString,
} from "@raiox/engine";
import { NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { calculationOptions } from "./calculation.ts";
import { loadClientInputs } from "./clients.ts";
import { getSettings } from "./settings.ts";

export { ScenarioError };

function summary(values: ScenarioComparison["base"]) {
  return {
    totalIncome: toMoneyString(values.totalIncome),
    totalTaxes: toMoneyString(values.totalTaxes),
    netIncome: toMoneyString(values.netIncome),
    minimumTaxDue: toMoneyString(values.minimumTaxDue),
    withholding: toMoneyString(values.withholding),
    finalBalance: toMoneyString(values.finalBalance),
    effectiveTaxRate: toRateString(values.effectiveTaxRate),
  };
}

export type ScenarioView = ReturnType<typeof toView>;

function toView(comparison: ScenarioComparison) {
  return {
    name: comparison.name,
    base: summary(comparison.base),
    scenario: summary(comparison.scenario),
    delta: summary(comparison.delta),
    deferredDividends: toMoneyString(comparison.deferredDividends),
    notes: comparison.notes,
    warnings: comparison.warnings,
    scenarioTrail: serializeResult(comparison.scenarioResult).trail,
  };
}

/**
 * Simulates a scenario for one visible client with the organization's
 * premises. Read-only: nothing is stored.
 */
export async function runScenario(
  db: Executor,
  ctx: OrgContext,
  clientCode: string,
  operations: readonly ScenarioOperation[],
  name = "Cenário",
): Promise<ScenarioView> {
  const [stored] = await loadClientInputs(db, ctx, { scope: "visible", codes: [clientCode] });
  if (!stored) throw new NotFoundError(`Cliente ${clientCode} não encontrado.`);
  const settings = await getSettings(db, ctx.orgId);
  const scenario: Scenario = { name, operations };
  return toView(compareScenario(stored.input, scenario, calculationOptions(settings)));
}
