import { looksLikePersonalData } from "@raiox/io";
import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../auth.ts";
import { assertManager, ForbiddenError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { organization } from "../db/schema.ts";
import { audit } from "./audit.ts";
import { TeamError } from "./team.ts";

export const officeNameSchema = z
  .string()
  .trim()
  .min(2, "Nome curto demais")
  .max(80, "Até 80 caracteres")
  .refine(
    (name) => !looksLikePersonalData(name),
    "O nome do escritório não pode ter CPF, CNPJ, e-mail ou telefone.",
  );

export async function getOffice(db: Executor, ctx: OrgContext) {
  const [row] = await db
    .select({ name: organization.name, createdAt: organization.createdAt })
    .from(organization)
    .where(eq(organization.id, ctx.orgId));
  return row ?? { name: ctx.orgName, createdAt: null };
}

/** Renames the office (shown on screens and PDFs). Owner or admin. */
export async function renameOffice(
  db: Executor,
  ctx: OrgContext,
  requestHeaders: Headers,
  name: unknown,
): Promise<void> {
  assertManager(ctx);
  const parsed = officeNameSchema.parse(name);
  try {
    await auth().api.updateOrganization({
      headers: requestHeaders,
      body: { organizationId: ctx.orgId, data: { name: parsed } },
    });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    if (error.status === "FORBIDDEN") throw new ForbiddenError();
    throw new TeamError("Não foi possível renomear o escritório.");
  }
  await audit(db, ctx, "office.update", "organization", ctx.orgId, { name: true });
}
