import {
  type CalculationOptions,
  type ClientResult,
  calculateClient,
  EngineInputError,
  getRuleSet,
  rankClients,
  type Serialized,
  serializeResult,
} from "@raiox/engine";
import { and, asc, desc, eq, inArray, notInArray, type SQL, sql } from "drizzle-orm";
import { isManager, NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { calculationRun, clientResult } from "../db/schema.ts";
import { audit } from "./audit.ts";
import { loadClientInputs } from "./clients.ts";
import { getSettings, type OrgSettings } from "./settings.ts";

/** How many past runs are kept per organization and year. */
const RUNS_KEPT = 5;
const INSERT_CHUNK = 250;

export function calculationOptions(settings: OrgSettings): CalculationOptions {
  return {
    calendarYear: settings.calendarYear,
    conservative: settings.conservative,
    choices: settings.choices,
  };
}

export type Band = "abaixo" | "transicao" | "cheia";

export function bandOf(result: ClientResult): Band {
  const { threshold, fullRateFrom } = getRuleSet(result.calendarYear).minimumTax;
  if (result.base.lessThanOrEqualTo(threshold)) return "abaixo";
  if (result.base.lessThan(fullRateFrom)) return "transicao";
  return "cheia";
}

export interface RecalculationSummary {
  runId: string;
  clientCount: number;
  skipped: { clientCode: string; message: string }[];
}

/**
 * Recalculates every client of the organization for the year and stores the
 * results as a new run. Runs inside one transaction: the dashboard never sees
 * half a run.
 */
export async function recalculate(db: Executor, ctx: OrgContext): Promise<RecalculationSummary> {
  const settings = await getSettings(db, ctx.orgId);
  const options = calculationOptions(settings);
  const stored = await loadClientInputs(db, ctx, { scope: "organization" });

  const computed: { clientId: string; result: ClientResult }[] = [];
  const skipped: RecalculationSummary["skipped"] = [];
  for (const { id, input } of stored) {
    try {
      computed.push({ clientId: id, result: calculateClient(input, options) });
    } catch (error) {
      if (!(error instanceof EngineInputError)) throw error;
      skipped.push({ clientCode: input.clientCode, message: error.message });
    }
  }
  const ranked = rankClients(computed.map((entry) => entry.result));
  const idByCode = new Map(computed.map((entry) => [entry.result.clientCode, entry.clientId]));
  const ruleSet = getRuleSet(settings.calendarYear);

  const runId = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(calculationRun)
      .values({
        orgId: ctx.orgId,
        calendarYear: settings.calendarYear,
        ruleSetVersion: ruleSet.version,
        conservative: settings.conservative,
        choices: settings.choices,
        clientCount: ranked.length,
        createdBy: ctx.userId,
      })
      .returning({ id: calculationRun.id });
    if (!run) throw new Error("Falha ao registrar a rodada de cálculo");

    const rows = ranked.map(({ position, result, score }) => ({
      runId: run.id,
      orgId: ctx.orgId,
      clientId: idByCode.get(result.clientCode) as string,
      clientCode: result.clientCode,
      nickname: result.nickname,
      advisorCode: result.advisorCode,
      position,
      score: score.score.toFixed(1),
      totalIncome: result.totalIncome.toFixed(2),
      base: result.base.toFixed(2),
      rate: result.rate.toDecimalPlaces(10).toString(),
      grossMinimumTax: result.grossMinimumTax.toFixed(2),
      minimumTaxDue: result.minimumTaxDue.toFixed(2),
      withholding: result.withholding.total.toFixed(2),
      finalBalance: result.finalBalance.toFixed(2),
      amountToPay: result.amountToPay.toFixed(2),
      amountToRefund: result.amountToRefund.toFixed(2),
      effectiveTaxRate: result.effectiveTaxRate.toDecimalPlaces(10).toString(),
      band: bandOf(result),
      alertCodes: result.alerts.map((alert) => alert.code),
      result: serializeResult(result),
    }));
    for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
      await tx.insert(clientResult).values(rows.slice(start, start + INSERT_CHUNK));
    }

    // Keep the last runs only (results cascade).
    const keep = await tx
      .select({ id: calculationRun.id })
      .from(calculationRun)
      .where(
        and(
          eq(calculationRun.orgId, ctx.orgId),
          eq(calculationRun.calendarYear, settings.calendarYear),
        ),
      )
      .orderBy(desc(calculationRun.createdAt))
      .limit(RUNS_KEPT);
    await tx.delete(calculationRun).where(
      and(
        eq(calculationRun.orgId, ctx.orgId),
        eq(calculationRun.calendarYear, settings.calendarYear),
        notInArray(
          calculationRun.id,
          keep.map((row) => row.id),
        ),
      ),
    );
    return run.id;
  });

  await audit(db, ctx, "calculation.run", "calculation_run", runId, {
    clients: ranked.length,
    skipped: skipped.length,
    conservative: settings.conservative,
  });
  return { runId, clientCount: ranked.length, skipped };
}

export async function latestRun(db: Executor, ctx: OrgContext) {
  const [run] = await db
    .select()
    .from(calculationRun)
    .where(
      and(eq(calculationRun.orgId, ctx.orgId), eq(calculationRun.calendarYear, ctx.calendarYear)),
    )
    .orderBy(desc(calculationRun.createdAt))
    .limit(1);
  return run ?? null;
}

/** Results of the latest run visible in this context (advisors see their own clients only). */
function visibleResults(ctx: OrgContext, runId: string): SQL {
  const conditions: SQL[] = [eq(clientResult.orgId, ctx.orgId), eq(clientResult.runId, runId)];
  if (!isManager(ctx)) {
    conditions.push(ctx.advisorCode ? eq(clientResult.advisorCode, ctx.advisorCode) : sql`false`);
  }
  return and(...conditions) as SQL;
}

export interface ResultFilters {
  advisorCode?: string | undefined;
  alert?: string | undefined;
  band?: Band | undefined;
  search?: string | undefined;
}

export async function listResults(db: Executor, ctx: OrgContext, filters: ResultFilters = {}) {
  const run = await latestRun(db, ctx);
  if (!run) return { run: null, rows: [] };
  const conditions: SQL[] = [visibleResults(ctx, run.id)];
  if (filters.advisorCode) conditions.push(eq(clientResult.advisorCode, filters.advisorCode));
  if (filters.alert) conditions.push(sql`${filters.alert} = any(${clientResult.alertCodes})`);
  if (filters.band) conditions.push(eq(clientResult.band, filters.band));
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
    conditions.push(
      sql`(${clientResult.clientCode} ilike ${term} or ${clientResult.nickname} ilike ${term})`,
    );
  }
  const rows = await db
    .select({
      clientCode: clientResult.clientCode,
      nickname: clientResult.nickname,
      advisorCode: clientResult.advisorCode,
      position: clientResult.position,
      score: clientResult.score,
      totalIncome: clientResult.totalIncome,
      base: clientResult.base,
      rate: clientResult.rate,
      minimumTaxDue: clientResult.minimumTaxDue,
      withholding: clientResult.withholding,
      amountToPay: clientResult.amountToPay,
      amountToRefund: clientResult.amountToRefund,
      effectiveTaxRate: clientResult.effectiveTaxRate,
      band: clientResult.band,
      alertCodes: clientResult.alertCodes,
    })
    .from(clientResult)
    .where(and(...conditions))
    .orderBy(asc(clientResult.position));
  return { run, rows };
}

export async function getClientResult(
  db: Executor,
  ctx: OrgContext,
  clientCode: string,
): Promise<Serialized<ClientResult>> {
  const run = await latestRun(db, ctx);
  if (!run) throw new NotFoundError("Ainda não há cálculo para este escritório.");
  const [row] = await db
    .select({ result: clientResult.result })
    .from(clientResult)
    .where(and(visibleResults(ctx, run.id), eq(clientResult.clientCode, clientCode)));
  if (!row) throw new NotFoundError(`Cliente ${clientCode} não encontrado.`);
  return row.result as Serialized<ClientResult>;
}

/** Advisor codes present in the latest run (dashboard filter). */
export async function advisorCodes(db: Executor, ctx: OrgContext): Promise<string[]> {
  const run = await latestRun(db, ctx);
  if (!run) return [];
  const rows = await db
    .selectDistinct({ code: clientResult.advisorCode })
    .from(clientResult)
    .where(visibleResults(ctx, run.id));
  return rows
    .map((row) => row.code)
    .filter((code): code is string => !!code)
    .sort();
}

export async function resultsByCodes(db: Executor, ctx: OrgContext, codes: readonly string[]) {
  const run = await latestRun(db, ctx);
  if (!run || codes.length === 0) return [];
  return db
    .select({ clientCode: clientResult.clientCode, result: clientResult.result })
    .from(clientResult)
    .where(and(visibleResults(ctx, run.id), inArray(clientResult.clientCode, [...codes])));
}
