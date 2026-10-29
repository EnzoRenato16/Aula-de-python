import type {
  ClientInput,
  IncomeLineInput,
  IncomeTypeCode,
  PayerInput,
  PositionInput,
  ReducerLimitCategory,
} from "@raiox/engine";
import { and, eq, inArray, notInArray, type SQL, sql } from "drizzle-orm";
import { assertManager, isManager, NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { client, company, incomeLine, position } from "../db/schema.ts";
import { audit } from "./audit.ts";

/**
 * Rows of `client` visible in this context: same organization and year and,
 * for advisors, only their own clients. An advisor without a code sees none.
 */
export function visibleClients(ctx: OrgContext): SQL {
  const conditions: SQL[] = [
    eq(client.orgId, ctx.orgId),
    eq(client.calendarYear, ctx.calendarYear),
  ];
  if (!isManager(ctx)) {
    conditions.push(ctx.advisorCode ? eq(client.advisorCode, ctx.advisorCode) : sql`false`);
  }
  return and(...conditions) as SQL;
}

function organizationClients(ctx: OrgContext): SQL {
  return and(eq(client.orgId, ctx.orgId), eq(client.calendarYear, ctx.calendarYear)) as SQL;
}

export interface StoredClient {
  id: string;
  input: ClientInput;
}

/**
 * Loads engine inputs from the database. `scope: "organization"` ignores the
 * advisor filter and is only used by the org-wide recalculation.
 */
export async function loadClientInputs(
  db: Executor,
  ctx: OrgContext,
  options: { scope: "visible" | "organization"; codes?: readonly string[] },
): Promise<StoredClient[]> {
  const scope = options.scope === "visible" ? visibleClients(ctx) : organizationClients(ctx);
  const where = options.codes ? and(scope, inArray(client.code, [...options.codes])) : scope;
  const clients = await db.select().from(client).where(where).orderBy(client.code);
  if (clients.length === 0) return [];

  const ids = clients.map((row) => row.id);
  const [lines, positions, companies] = await Promise.all([
    db
      .select()
      .from(incomeLine)
      .where(and(eq(incomeLine.orgId, ctx.orgId), inArray(incomeLine.clientId, ids))),
    db
      .select()
      .from(position)
      .where(and(eq(position.orgId, ctx.orgId), inArray(position.clientId, ids))),
    db.select().from(company).where(eq(company.orgId, ctx.orgId)),
  ]);
  const companyByCode = new Map(companies.map((row) => [row.code, row]));
  const linesByClient = Map.groupBy(lines, (row) => row.clientId);
  const positionsByClient = Map.groupBy(positions, (row) => row.clientId);

  return clients.map((row) => {
    const incomes = (linesByClient.get(row.id) ?? []).map((line): IncomeLineInput => {
      const built: IncomeLineInput = { type: line.type as IncomeTypeCode, amount: line.amount };
      if (line.month !== null) built.month = line.month;
      if (line.taxWithheld !== null) built.taxWithheld = line.taxWithheld;
      if (line.companyCode !== null) built.payerCode = line.companyCode;
      if (line.type === "DIVIDENDOS") built.transition = line.transition;
      return built;
    });
    const payerCodes = [
      ...new Set(incomes.map((line) => line.payerCode).filter((c): c is string => !!c)),
    ].sort();
    const payers = payerCodes.flatMap((code): PayerInput[] => {
      const stored = companyByCode.get(code);
      if (!stored) return [];
      const payer: PayerInput = {
        code,
        limitCategory: stored.limitCategory as ReducerLimitCategory,
        simplesNacional: stored.simplesNacional,
      };
      if (stored.effectiveRate !== null) payer.effectiveRate = stored.effectiveRate;
      return [payer];
    });
    const input: ClientInput = { clientCode: row.code, incomes, payers };
    if (row.nickname !== null) input.nickname = row.nickname;
    if (row.advisorCode !== null) input.advisorCode = row.advisorCode;
    if (row.irpfAdjustmentDue !== null) input.irpfAdjustmentDue = row.irpfAdjustmentDue;
    const stored = (positionsByClient.get(row.id) ?? []).map((p): PositionInput => {
      const built: PositionInput = {
        assetClass: p.assetClass as IncomeTypeCode,
        balance: p.balance,
        expectedAnnualRate: p.expectedAnnualRate,
      };
      if (p.taxRate !== null) built.taxRate = p.taxRate;
      return built;
    });
    if (stored.length > 0) input.positions = stored;
    return { id: row.id, input };
  });
}

/** Inserts or updates companies (attributes used by the reducer). */
export async function upsertCompanies(
  db: Executor,
  ctx: OrgContext,
  payers: readonly PayerInput[],
): Promise<void> {
  assertManager(ctx);
  for (const payer of payers) {
    const values = {
      effectiveRate:
        payer.effectiveRate === undefined || payer.effectiveRate === null
          ? null
          : String(payer.effectiveRate),
      limitCategory: payer.limitCategory ?? "GERAL",
      simplesNacional: payer.simplesNacional === true,
    };
    await db
      .insert(company)
      .values({ orgId: ctx.orgId, code: payer.code, ...values })
      .onConflictDoUpdate({ target: [company.orgId, company.code], set: values });
  }
}

/**
 * Creates or replaces one client (its lines and positions are replaced as a
 * whole). Run inside a transaction by the callers.
 */
export async function saveClient(
  db: Executor,
  ctx: OrgContext,
  input: ClientInput,
  source: "IMPORT" | "MANUAL",
  importBatchId: string | null = null,
): Promise<{ id: string; created: boolean }> {
  assertManager(ctx);
  const values = {
    nickname: input.nickname ?? null,
    advisorCode: input.advisorCode ?? null,
    irpfAdjustmentDue:
      input.irpfAdjustmentDue === undefined || input.irpfAdjustmentDue === null
        ? null
        : String(input.irpfAdjustmentDue),
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(organizationClients(ctx), eq(client.code, input.clientCode)));
  let id: string;
  if (existing) {
    id = existing.id;
    await db.update(client).set(values).where(eq(client.id, id));
    await db.delete(incomeLine).where(eq(incomeLine.clientId, id));
    await db.delete(position).where(eq(position.clientId, id));
  } else {
    const [created] = await db
      .insert(client)
      .values({
        orgId: ctx.orgId,
        calendarYear: ctx.calendarYear,
        code: input.clientCode,
        ...values,
      })
      .returning({ id: client.id });
    if (!created) throw new Error("Falha ao criar cliente");
    id = created.id;
  }

  if (input.incomes.length > 0) {
    await db.insert(incomeLine).values(
      input.incomes.map((line) => ({
        orgId: ctx.orgId,
        clientId: id,
        type: line.type,
        month: line.month ?? null,
        amount: String(line.amount),
        taxWithheld:
          line.taxWithheld === undefined || line.taxWithheld === null
            ? null
            : String(line.taxWithheld),
        companyCode: line.payerCode ?? null,
        transition: line.type === "DIVIDENDOS" && line.transition === true,
        source,
        importBatchId,
      })),
    );
  }
  const positions = input.positions ?? [];
  if (positions.length > 0) {
    await db.insert(position).values(
      positions.map((p) => ({
        orgId: ctx.orgId,
        clientId: id,
        assetClass: p.assetClass,
        balance: String(p.balance),
        expectedAnnualRate: String(p.expectedAnnualRate),
        taxRate: p.taxRate === undefined || p.taxRate === null ? null : String(p.taxRate),
      })),
    );
  }
  return { id, created: !existing };
}

export async function deleteClient(db: Executor, ctx: OrgContext, code: string): Promise<void> {
  assertManager(ctx);
  const deleted = await db
    .delete(client)
    .where(and(organizationClients(ctx), eq(client.code, code)))
    .returning({ id: client.id });
  const [row] = deleted;
  if (!row) throw new NotFoundError(`Cliente ${code} não encontrado.`);
  await audit(db, ctx, "client.delete", "client", row.id, { clientCode: code });
}

/** Removes the clients of the year that are not in `keepCodes` (import in REPLACE mode). */
export async function deleteClientsNotIn(
  db: Executor,
  ctx: OrgContext,
  keepCodes: readonly string[],
): Promise<number> {
  assertManager(ctx);
  const condition =
    keepCodes.length > 0
      ? and(organizationClients(ctx), notInArray(client.code, [...keepCodes]))
      : organizationClients(ctx);
  const deleted = await db.delete(client).where(condition).returning({ id: client.id });
  return deleted.length;
}
