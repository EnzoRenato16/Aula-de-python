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
import { looksLikePersonalData, parseMoney, parseRate } from "@raiox/io";
import { and, desc, eq } from "drizzle-orm";
import type { OperationForm, ScenarioForm } from "../../lib/scenario-form.ts";
import { ForbiddenError, isManager, NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { scenario as scenarioTable } from "../db/schema.ts";
import { audit } from "./audit.ts";
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

function typedMoney(text: string, what: string, position: number): string {
  const parsed = parseMoney({ text, numeric: false });
  if (!parsed.ok) throw new ScenarioError(`Operação ${position}: ${what}: ${parsed.error}`);
  return parsed.value;
}

function typedRate(text: string, what: string, position: number): string {
  const parsed = parseRate({ text, numeric: false });
  if (!parsed.ok) throw new ScenarioError(`Operação ${position}: ${what}: ${parsed.error}`);
  return parsed.value;
}

/** Converts the simulator form (pt-BR text) into engine operations. */
export function toOperations(operations: readonly OperationForm[]): ScenarioOperation[] {
  return operations.map((op, index): ScenarioOperation => {
    const position = index + 1;
    if (op.kind === "RESCHEDULE_DIVIDENDS") {
      return { kind: "RESCHEDULE_DIVIDENDS", payerCode: op.payerCode, schedule: op.schedule };
    }
    if (op.kind === "ADJUST_DIVIDENDS") {
      const amount = typedMoney(op.amount, "valor", position);
      return {
        kind: "ADJUST_DIVIDENDS",
        payerCode: op.payerCode,
        delta: op.direction === "RETAIN" ? `-${amount}` : amount,
      };
    }
    const move: ScenarioOperation = {
      kind: "MOVE_ALLOCATION",
      fromClass: op.fromClass,
      toClass: op.toClass,
      amount: typedMoney(op.amount, "valor movido", position),
      toAnnualRate: typedRate(op.toAnnualRate, "taxa do destino", position),
    };
    if (op.fromAnnualRate !== "") {
      move.fromAnnualRate = typedRate(op.fromAnnualRate, "taxa da origem", position);
    }
    if (op.toTaxRate !== "") {
      move.toTaxRate = typedRate(op.toTaxRate, "alíquota do destino", position);
    }
    return move;
  });
}

function scenarioName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "Cenário";
  const personal = looksLikePersonalData(trimmed);
  if (personal) {
    throw new ScenarioError(`O nome do cenário parece ${personal}. Não use dados pessoais (LGPD).`);
  }
  return trimmed;
}

/** Simulates the form for a visible client. Read-only. */
export function simulateForm(
  db: Executor,
  ctx: OrgContext,
  clientCode: string,
  form: ScenarioForm,
): Promise<ScenarioView> {
  return runScenario(db, ctx, clientCode, toOperations(form.operations), scenarioName(form.name));
}

/**
 * Saves a scenario of a visible client. Advisors may save scenarios of their
 * own clients: a scenario changes no client data.
 */
export async function saveScenario(
  db: Executor,
  ctx: OrgContext,
  clientCode: string,
  form: ScenarioForm,
): Promise<string> {
  const [stored] = await loadClientInputs(db, ctx, { scope: "visible", codes: [clientCode] });
  if (!stored) throw new NotFoundError(`Cliente ${clientCode} não encontrado.`);
  const view = await simulateForm(db, ctx, clientCode, form);
  const { scenarioTrail: _trail, ...comparison } = view;
  const [row] = await db
    .insert(scenarioTable)
    .values({
      orgId: ctx.orgId,
      clientId: stored.id,
      name: view.name,
      operations: form.operations,
      comparison,
      createdBy: ctx.userId,
    })
    .returning({ id: scenarioTable.id });
  if (!row) throw new Error("Falha ao salvar o cenário");
  await audit(db, ctx, "scenario.save", "scenario", row.id, {
    clientCode,
    operations: form.operations.length,
  });
  return row.id;
}

export interface SavedScenario {
  id: string;
  name: string;
  operations: OperationForm[];
  netIncomeDelta: string;
  createdAt: Date;
  mine: boolean;
}

export async function listScenarios(
  db: Executor,
  ctx: OrgContext,
  clientId: string,
): Promise<SavedScenario[]> {
  const rows = await db
    .select()
    .from(scenarioTable)
    .where(and(eq(scenarioTable.orgId, ctx.orgId), eq(scenarioTable.clientId, clientId)))
    .orderBy(desc(scenarioTable.createdAt))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    operations: row.operations as OperationForm[],
    netIncomeDelta: (row.comparison as Pick<ScenarioView, "delta">).delta.netIncome,
    createdAt: row.createdAt,
    mine: row.createdBy === ctx.userId,
  }));
}

/** Deletes a saved scenario: its author or a manager. */
export async function deleteScenario(db: Executor, ctx: OrgContext, id: string): Promise<void> {
  const [row] = await db
    .select({
      id: scenarioTable.id,
      createdBy: scenarioTable.createdBy,
      clientId: scenarioTable.clientId,
    })
    .from(scenarioTable)
    .where(and(eq(scenarioTable.orgId, ctx.orgId), eq(scenarioTable.id, id)));
  if (!row) throw new NotFoundError("Cenário não encontrado.");
  if (!isManager(ctx) && row.createdBy !== ctx.userId) {
    throw new ForbiddenError("Só quem salvou o cenário, o dono ou um admin pode excluí-lo.");
  }
  await db
    .delete(scenarioTable)
    .where(and(eq(scenarioTable.orgId, ctx.orgId), eq(scenarioTable.id, id)));
  await audit(db, ctx, "scenario.delete", "scenario", id, {});
}
