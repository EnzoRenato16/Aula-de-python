import { DEFAULT_CALENDAR_YEAR, type PendingChoices } from "@raiox/engine";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { brandingSchema, choicesSchema, premisesSchema } from "../../lib/premises.ts";
import { assertManager, type OrgContext } from "../context.ts";
import type { Database } from "../db/index.ts";
import { orgSettings } from "../db/schema.ts";
import { audit } from "./audit.ts";

export { brandingSchema, choicesSchema, premisesSchema };

export interface OrgSettings {
  calendarYear: number;
  conservative: boolean;
  choices: Partial<PendingChoices>;
  primaryColor: string | null;
}

export async function getSettings(db: Database, orgId: string): Promise<OrgSettings> {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId));
  if (!row) {
    return {
      calendarYear: DEFAULT_CALENDAR_YEAR,
      conservative: false,
      choices: {},
      primaryColor: null,
    };
  }
  const choices = choicesSchema.safeParse(row.choices);
  return {
    calendarYear: row.calendarYear,
    conservative: row.conservative,
    choices: choices.success ? (choices.data as Partial<PendingChoices>) : {},
    primaryColor: row.primaryColor,
  };
}

export async function ensureSettings(db: Database, orgId: string): Promise<void> {
  await db.insert(orgSettings).values({ orgId }).onConflictDoNothing();
}

async function upsertSettings(
  db: Database,
  ctx: OrgContext,
  values: Partial<typeof orgSettings.$inferInsert>,
): Promise<void> {
  await db
    .insert(orgSettings)
    .values({ orgId: ctx.orgId, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({ target: orgSettings.orgId, set: { ...values, updatedAt: new Date() } });
}

/** Conservative mode and PENDENTE choices. The caller recalculates the office. */
export async function updatePremises(
  db: Database,
  ctx: OrgContext,
  input: z.infer<typeof premisesSchema>,
): Promise<void> {
  assertManager(ctx);
  const data = premisesSchema.parse(input);
  await upsertSettings(db, ctx, data);
  await audit(db, ctx, "settings.update", "org_settings", ctx.orgId, {
    conservative: data.conservative,
    choices: Object.keys(data.choices).sort().join(",") || null,
  });
}

/** Color of the office's PDFs. */
export async function updateBranding(
  db: Database,
  ctx: OrgContext,
  input: z.infer<typeof brandingSchema>,
): Promise<void> {
  assertManager(ctx);
  const data = brandingSchema.parse(input);
  await upsertSettings(db, ctx, data);
  await audit(db, ctx, "settings.update", "org_settings", ctx.orgId, {
    primaryColor: data.primaryColor,
  });
}
