import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertManager, NotFoundError, type OrgContext } from "../context.ts";
import type { Executor } from "../db/index.ts";
import { invitation, member, user } from "../db/schema.ts";
import { audit } from "./audit.ts";

export const advisorCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{0,39}$/,
    "Código inválido (letras sem acento, números, ponto, hífen)",
  )
  .nullable();

export async function listMembers(db: Executor, ctx: OrgContext) {
  assertManager(ctx);
  return db
    .select({
      id: member.id,
      role: member.role,
      advisorCode: member.advisorCode,
      createdAt: member.createdAt,
      userId: user.id,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.orgId))
    .orderBy(asc(member.createdAt));
}

export async function listPendingInvitations(db: Executor, ctx: OrgContext) {
  assertManager(ctx);
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      advisorCode: invitation.advisorCode,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(and(eq(invitation.organizationId, ctx.orgId), eq(invitation.status, "pending")))
    .orderBy(asc(invitation.createdAt));
}

export async function setAdvisorCode(
  db: Executor,
  ctx: OrgContext,
  memberId: string,
  code: string | null,
): Promise<void> {
  assertManager(ctx);
  const advisorCode = advisorCodeSchema.parse(code === "" ? null : code);
  const updated = await db
    .update(member)
    .set({ advisorCode })
    .where(and(eq(member.organizationId, ctx.orgId), eq(member.id, memberId)))
    .returning({ id: member.id });
  if (updated.length === 0) throw new NotFoundError("Membro não encontrado.");
  await audit(db, ctx, "team.advisor_code", "member", memberId, { advisorCode });
}
