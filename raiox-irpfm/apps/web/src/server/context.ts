import { DEFAULT_CALENDAR_YEAR } from "@raiox/engine";
import { and, asc, eq } from "drizzle-orm";
import type { OrgRole } from "../lib/roles.ts";
import type { Database } from "./db/index.ts";
import { member, organization, orgSettings, user } from "./db/schema.ts";

export { type OrgRole, ROLE_LABEL } from "../lib/roles.ts";

/**
 * Everything a service needs to know about who is asking. Every query of the
 * product tables is filtered by `orgId`; advisors (role "member") are further
 * restricted to the clients whose codigo_assessor equals `advisorCode`.
 */
export interface OrgContext {
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  role: OrgRole;
  advisorCode: string | null;
  calendarYear: number;
}

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Não encontrado.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function isManager(ctx: OrgContext): boolean {
  return ctx.role === "owner" || ctx.role === "admin";
}

export function assertManager(ctx: OrgContext): void {
  if (!isManager(ctx))
    throw new ForbiddenError("Só o dono ou um admin do escritório pode fazer isso.");
}

export function assertOwner(ctx: OrgContext): void {
  if (ctx.role !== "owner") throw new ForbiddenError("Só o dono do escritório pode fazer isso.");
}

function asRole(role: string): OrgRole {
  return role === "owner" || role === "admin" ? role : "member";
}

/**
 * Builds the context of a user inside an organization. Uses the session's
 * active organization when the user belongs to it, otherwise the oldest
 * membership. Returns null when the user has no organization yet.
 */
export async function loadContext(
  db: Database,
  userId: string,
  preferredOrgId: string | null,
): Promise<OrgContext | null> {
  const memberships = await db
    .select({
      orgId: member.organizationId,
      role: member.role,
      advisorCode: member.advisorCode,
      orgName: organization.name,
      userName: user.name,
      userEmail: user.email,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
  const chosen = memberships.find((m) => m.orgId === preferredOrgId) ?? memberships[0];
  if (!chosen) return null;

  const [settings] = await db
    .select({ calendarYear: orgSettings.calendarYear })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, chosen.orgId));

  return {
    userId,
    userName: chosen.userName,
    userEmail: chosen.userEmail,
    orgId: chosen.orgId,
    orgName: chosen.orgName,
    role: asRole(chosen.role),
    advisorCode: chosen.advisorCode,
    calendarYear: settings?.calendarYear ?? DEFAULT_CALENDAR_YEAR,
  };
}

/** True when the user is a member of the organization (used by route handlers). */
export async function isMemberOf(db: Database, userId: string, orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)));
  return row !== undefined;
}
