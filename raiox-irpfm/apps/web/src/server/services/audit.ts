import { desc, eq } from "drizzle-orm";
import type { OrgContext } from "../context.ts";
import type { Database } from "../db/index.ts";
import { auditLog, user } from "../db/schema.ts";

export type AuditAction =
  | "import.preview"
  | "import.confirm"
  | "import.discard"
  | "client.create"
  | "client.update"
  | "client.delete"
  | "calculation.run"
  | "settings.update"
  | "scenario.save"
  | "scenario.delete"
  | "team.invite"
  | "team.advisor_code"
  | "team.remove"
  | "pdf.download"
  | "export.ranking";

/**
 * Append-only audit trail. `metadata` must hold codes, counts and ids only,
 * never personal data (LGPD): it is written by the services, not by users.
 */
export async function audit(
  db: Database,
  ctx: OrgContext,
  action: AuditAction,
  entity: string,
  entityId: string | null = null,
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  await db.insert(auditLog).values({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action,
    entity,
    entityId,
    metadata,
  });
}

export async function listAudit(db: Database, ctx: OrgContext, limit = 200) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(eq(auditLog.orgId, ctx.orgId))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
}
