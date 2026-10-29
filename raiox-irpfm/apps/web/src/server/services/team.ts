import { isAPIError } from "better-auth/api";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../auth.ts";
import {
  assertManager,
  assertOwner,
  ForbiddenError,
  NotFoundError,
  type OrgContext,
} from "../context.ts";
import type { Executor } from "../db/index.ts";
import { invitation, member, user } from "../db/schema.ts";
import { audit } from "./audit.ts";

/** A team operation refused for a reason the user can act on. */
export class TeamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamError";
  }
}

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

const AUTH_MESSAGES: Record<string, string> = {
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "Esta pessoa já faz parte do escritório.",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "Já existe um convite pendente para este e-mail.",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
    "Seu papel não permite convidar com este papel.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    "O escritório precisa de pelo menos um dono.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: "O escritório precisa de pelo menos um dono.",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "O escritório atingiu o limite de membros.",
  INVITATION_LIMIT_REACHED: "O escritório atingiu o limite de convites pendentes.",
};

/** Runs a Better Auth call and turns its errors into the app's errors. */
async function authCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const code = (error.body as { code?: string } | undefined)?.code ?? "";
    if (AUTH_MESSAGES[code]) throw new TeamError(AUTH_MESSAGES[code]);
    if (code.endsWith("_NOT_FOUND")) throw new NotFoundError();
    if (code.startsWith("YOU_ARE_NOT_ALLOWED") || error.status === "FORBIDDEN") {
      throw new ForbiddenError();
    }
    throw error;
  }
}

const optionalAdvisorCode = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(advisorCodeSchema);

export const inviteSchema = z.object({
  email: z.email("E-mail inválido").trim().toLowerCase().max(200, "E-mail longo demais"),
  role: z.enum(["member", "admin"]),
  advisorCode: optionalAdvisorCode,
});

/**
 * Creates an invitation and returns its id; the link is shared by the office
 * (no e-mail is sent). The advisor code is applied when it is accepted.
 */
export async function inviteMember(
  db: Executor,
  ctx: OrgContext,
  requestHeaders: Headers,
  /** Validated here: comes straight from the form. */
  input: unknown,
): Promise<string> {
  assertManager(ctx);
  const data = inviteSchema.parse(input);
  const created = await authCall(() =>
    auth().api.createInvitation({
      headers: requestHeaders,
      body: {
        email: data.email,
        role: data.role,
        organizationId: ctx.orgId,
        ...(data.advisorCode ? { advisorCode: data.advisorCode } : {}),
      },
    }),
  );
  await audit(db, ctx, "team.invite", "invitation", created.id, { role: data.role });
  return created.id;
}

export async function cancelInvitation(
  db: Executor,
  ctx: OrgContext,
  requestHeaders: Headers,
  invitationId: string,
): Promise<void> {
  assertManager(ctx);
  const [found] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.organizationId, ctx.orgId), eq(invitation.id, invitationId)));
  if (!found) throw new NotFoundError("Convite não encontrado.");
  await authCall(() =>
    auth().api.cancelInvitation({ headers: requestHeaders, body: { invitationId } }),
  );
  await audit(db, ctx, "team.cancel_invite", "invitation", invitationId, {});
}

async function memberOfOrg(db: Executor, ctx: OrgContext, memberId: string) {
  const [found] = await db
    .select({ id: member.id, userId: member.userId, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, ctx.orgId), eq(member.id, memberId)));
  if (!found) throw new NotFoundError("Membro não encontrado.");
  if (found.userId === ctx.userId) {
    throw new TeamError("Você não pode mudar o seu próprio acesso por aqui.");
  }
  return found;
}

export async function removeMember(
  db: Executor,
  ctx: OrgContext,
  requestHeaders: Headers,
  memberId: string,
): Promise<void> {
  assertManager(ctx);
  const found = await memberOfOrg(db, ctx, memberId);
  if (found.role === "owner") assertOwner(ctx);
  await authCall(() =>
    auth().api.removeMember({
      headers: requestHeaders,
      body: { memberIdOrEmail: memberId, organizationId: ctx.orgId },
    }),
  );
  await audit(db, ctx, "team.remove", "member", memberId, { role: found.role });
}

export const roleSchema = z.enum(["owner", "admin", "member"]);

/** Only the owner changes roles (including handing over ownership). */
export async function changeRole(
  db: Executor,
  ctx: OrgContext,
  requestHeaders: Headers,
  memberId: string,
  role: z.infer<typeof roleSchema>,
): Promise<void> {
  assertOwner(ctx);
  const parsed = roleSchema.parse(role);
  await memberOfOrg(db, ctx, memberId);
  await authCall(() =>
    auth().api.updateMemberRole({
      headers: requestHeaders,
      body: { memberId, role: parsed, organizationId: ctx.orgId },
    }),
  );
  await audit(db, ctx, "team.role", "member", memberId, { role: parsed });
}
