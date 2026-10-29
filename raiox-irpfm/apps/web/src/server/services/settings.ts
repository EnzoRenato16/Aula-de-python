import { DEFAULT_CALENDAR_YEAR, type PendingChoices } from "@raiox/engine";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertManager, type OrgContext } from "../context.ts";
import type { Database } from "../db/index.ts";
import { orgSettings } from "../db/schema.ts";
import { audit } from "./audit.ts";

export const choicesSchema = z
  .object({
    simplesNacionalWithholding: z.boolean(),
    exemptStockGainsInBase: z.boolean(),
    reducerStrategy: z.enum(["INCREMENTAL_NET", "INCREMENTAL_GROSS", "NOMINAL_RATE"]),
    estimateIrpfWhenMissing: z.boolean(),
    estimateTaxWhenMissing: z.boolean(),
  })
  .partial()
  .strict();

export const settingsSchema = z.object({
  conservative: z.boolean(),
  choices: choicesSchema,
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor hexadecimal, ex.: #12343B")
    .nullable(),
});

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

export async function updateSettings(
  db: Database,
  ctx: OrgContext,
  input: z.infer<typeof settingsSchema>,
): Promise<void> {
  assertManager(ctx);
  const data = settingsSchema.parse(input);
  await db
    .insert(orgSettings)
    .values({ orgId: ctx.orgId, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: orgSettings.orgId,
      set: { ...data, updatedAt: new Date() },
    });
  await audit(db, ctx, "settings.update", "org_settings", ctx.orgId, {
    conservative: data.conservative,
  });
}
