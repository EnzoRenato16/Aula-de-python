import {
  type ClientInput,
  type ClientResult,
  calculateClient,
  EngineInputError,
} from "@raiox/engine";
import { and, eq } from "drizzle-orm";
import { NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { clientResult } from "../db/schema.ts";
import { calculationOptions, latestRun } from "./calculation.ts";
import { loadClientInputs } from "./clients.ts";
import { getSettings, type OrgSettings } from "./settings.ts";

export interface ClientDetail {
  id: string;
  input: ClientInput;
  settings: OrgSettings;
  /** Null when the stored data cannot be calculated (message in `calculationError`). */
  result: ClientResult | null;
  calculationError: string | null;
  /** Place in the latest ranking of the office, when the client is in it. */
  ranking: { position: number; of: number; score: string } | null;
}

/**
 * One visible client, calculated now with the office's current premises.
 * Every change to clients or premises triggers a recalculation, so this is
 * the same result the dashboard stored; calculating here also gives the full
 * engine result (with Decimals) to the deterministic summary and the PDF.
 */
export async function getClientDetail(
  db: Executor,
  ctx: OrgContext,
  code: string,
): Promise<ClientDetail> {
  const [stored] = await loadClientInputs(db, ctx, { scope: "visible", codes: [code] });
  if (!stored) throw new NotFoundError(`Cliente ${code} não encontrado.`);
  const settings = await getSettings(db, ctx.orgId);

  let result: ClientResult | null = null;
  let calculationError: string | null = null;
  try {
    result = calculateClient(stored.input, calculationOptions(settings));
  } catch (error) {
    if (!(error instanceof EngineInputError)) throw error;
    calculationError = error.message;
  }

  const run = await latestRun(db, ctx);
  let ranking: ClientDetail["ranking"] = null;
  if (run) {
    const [row] = await db
      .select({ position: clientResult.position, score: clientResult.score })
      .from(clientResult)
      .where(
        and(
          eq(clientResult.orgId, ctx.orgId),
          eq(clientResult.runId, run.id),
          eq(clientResult.clientId, stored.id),
        ),
      );
    if (row) ranking = { position: row.position, of: run.clientCount, score: row.score };
  }
  return { id: stored.id, input: stored.input, settings, result, calculationError, ranking };
}
