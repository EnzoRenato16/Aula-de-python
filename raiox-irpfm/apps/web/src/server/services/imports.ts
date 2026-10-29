import { createHash } from "node:crypto";
import { type ClientInput, getRuleSet, type PayerInput, type RuleSet } from "@raiox/engine";
import {
  type ImportIssue,
  type ImportResult,
  importWorkbook,
  MAX_ROWS,
  readCsvWorkbook,
  readXlsxWorkbook,
} from "@raiox/io";
import { and, desc, eq } from "drizzle-orm";
import { assertManager, NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { importBatch } from "../db/schema.ts";
import { audit } from "./audit.ts";
import { deleteClientsNotIn, saveClient, upsertCompanies } from "./clients.ts";

/** Upload limit (bytes). The server action body limit is set a bit above. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Issues stored per batch (the CSV report of the CLI has no limit). */
const MAX_STORED_ISSUES = 2000;

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export type ImportMode = "MERGE" | "REPLACE";

export interface BatchPayload {
  clients: ClientInput[];
  companies: PayerInput[];
}

async function parseFile(
  fileName: string,
  bytes: Buffer,
  ruleSet: RuleSet,
): Promise<ImportResult & { companies: PayerInput[] }> {
  const lower = fileName.toLowerCase();
  let workbook: Awaited<ReturnType<typeof readXlsxWorkbook>>;
  if (lower.endsWith(".xlsx")) {
    workbook = await readXlsxWorkbook(bytes);
  } else if (lower.endsWith(".csv")) {
    workbook = readCsvWorkbook([{ name: fileName, content: bytes.toString("utf8") }]);
  } else {
    throw new ImportError("Envie o template preenchido (.xlsx) ou um .csv de rendimentos.");
  }
  const result = importWorkbook(workbook, { ruleSet });
  const companies = new Map<string, PayerInput>();
  for (const client of result.clients)
    for (const payer of client.payers ?? []) companies.set(payer.code, payer);
  return { ...result, companies: [...companies.values()] };
}

/**
 * Step 1: parse and validate the file and keep the result as a PREVIEW batch.
 * Nothing in the client base changes until the batch is confirmed.
 */
export async function previewImport(
  db: Executor,
  ctx: OrgContext,
  file: { name: string; bytes: Buffer },
): Promise<string> {
  assertManager(ctx);
  if (file.bytes.length === 0) throw new ImportError("Arquivo vazio.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) {
    throw new ImportError(`Arquivo maior que ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  let parsed: Awaited<ReturnType<typeof parseFile>>;
  try {
    parsed = await parseFile(file.name, file.bytes, getRuleSet(ctx.calendarYear));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    const detail =
      error instanceof Error && error.message.includes(String(MAX_ROWS)) ? ` ${error.message}` : "";
    throw new ImportError(
      `Não foi possível ler o arquivo. Confira se é o template em .xlsx ou um .csv.${detail}`,
    );
  }
  const payload: BatchPayload = { clients: parsed.clients, companies: parsed.companies };
  const [batch] = await db
    .insert(importBatch)
    .values({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      fileName: file.name.slice(0, 200),
      fileSha256: createHash("sha256").update(file.bytes).digest("hex"),
      calendarYear: ctx.calendarYear,
      stats: parsed.stats,
      issues: parsed.issues.slice(0, MAX_STORED_ISSUES),
      payload,
    })
    .returning({ id: importBatch.id });
  if (!batch) throw new Error("Falha ao registrar a importação");
  await audit(db, ctx, "import.preview", "import_batch", batch.id, {
    clients: parsed.stats.clients,
    errors: parsed.stats.errors,
    warnings: parsed.stats.warnings,
  });
  return batch.id;
}

export async function getBatch(db: Executor, ctx: OrgContext, id: string) {
  assertManager(ctx);
  const [batch] = await db
    .select()
    .from(importBatch)
    .where(and(eq(importBatch.orgId, ctx.orgId), eq(importBatch.id, id)));
  if (!batch) throw new NotFoundError("Importação não encontrada.");
  return {
    ...batch,
    stats: batch.stats as ImportResult["stats"],
    issues: batch.issues as ImportIssue[],
    payload: batch.payload as BatchPayload | null,
  };
}

export async function recentBatches(db: Executor, ctx: OrgContext, limit = 10) {
  assertManager(ctx);
  return db
    .select({
      id: importBatch.id,
      fileName: importBatch.fileName,
      status: importBatch.status,
      mode: importBatch.mode,
      stats: importBatch.stats,
      createdAt: importBatch.createdAt,
    })
    .from(importBatch)
    .where(eq(importBatch.orgId, ctx.orgId))
    .orderBy(desc(importBatch.createdAt))
    .limit(limit);
}

/**
 * Step 2: apply a PREVIEW batch. MERGE replaces only the clients in the file;
 * REPLACE also removes the clients of the year that are not in the file.
 * Batches with errors are only applied when `acceptErrors` is set (then only
 * the valid rows go in, as in the CLI's --ignorar-erros).
 */
export async function confirmImport(
  db: Executor,
  ctx: OrgContext,
  id: string,
  options: { mode: ImportMode; acceptErrors: boolean },
): Promise<{ clients: number; removed: number }> {
  assertManager(ctx);
  const batch = await getBatch(db, ctx, id);
  if (batch.status !== "PREVIEW" || !batch.payload) {
    throw new ImportError("Esta importação já foi confirmada ou descartada.");
  }
  if (batch.calendarYear !== ctx.calendarYear) {
    throw new ImportError("A importação foi preparada para outro ano-calendário.");
  }
  if (batch.stats.errors > 0 && !options.acceptErrors) {
    throw new ImportError(
      "A planilha tem erros. Corrija-os ou confirme que quer importar só as linhas válidas.",
    );
  }
  const { clients, companies } = batch.payload;

  const result = await db.transaction(async (tx) => {
    await upsertCompanies(tx, ctx, companies);
    for (const client of clients) await saveClient(tx, ctx, client, "IMPORT", batch.id);
    const removed =
      options.mode === "REPLACE"
        ? await deleteClientsNotIn(
            tx,
            ctx,
            clients.map((client) => client.clientCode),
          )
        : 0;
    await tx
      .update(importBatch)
      .set({ status: "CONFIRMED", mode: options.mode, payload: null, decidedAt: new Date() })
      .where(and(eq(importBatch.orgId, ctx.orgId), eq(importBatch.id, id)));
    return { clients: clients.length, removed };
  });
  await audit(db, ctx, "import.confirm", "import_batch", id, {
    mode: options.mode,
    clients: result.clients,
    removed: result.removed,
    acceptedErrors: options.acceptErrors,
  });
  return result;
}

export async function discardImport(db: Executor, ctx: OrgContext, id: string): Promise<void> {
  assertManager(ctx);
  const updated = await db
    .update(importBatch)
    .set({ status: "DISCARDED", payload: null, decidedAt: new Date() })
    .where(
      and(
        eq(importBatch.orgId, ctx.orgId),
        eq(importBatch.id, id),
        eq(importBatch.status, "PREVIEW"),
      ),
    )
    .returning({ id: importBatch.id });
  if (updated.length === 0)
    throw new ImportError("Esta importação já foi confirmada ou descartada.");
  await audit(db, ctx, "import.discard", "import_batch", id);
}
