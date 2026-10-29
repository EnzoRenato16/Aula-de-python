import { randomUUID } from "node:crypto";
import { afterAll } from "vitest";
import type { OrgContext, OrgRole } from "../context.ts";
import { createDatabase } from "../db/index.ts";
import { member, organization, user } from "../db/schema.ts";
import { ensureSettings } from "../services/settings.ts";
import { TEST_DATABASE_URL } from "./global-setup.ts";

export const { db, pool } = createDatabase(process.env.DATABASE_URL_TEST ?? TEST_DATABASE_URL);

afterAll(async () => {
  await pool.end();
});

async function createUser(name: string): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `${id}@teste.invalid`;
  await db.insert(user).values({ id, name, email });
  return { id, email };
}

/** Creates an organization with its owner and returns the owner's context. */
export async function createOrganization(name = "Escritório Teste"): Promise<OrgContext> {
  const owner = await createUser("Dono Teste");
  const orgId = randomUUID();
  await db.insert(organization).values({ id: orgId, name, slug: `org-${orgId}` });
  await db
    .insert(member)
    .values({ id: randomUUID(), organizationId: orgId, userId: owner.id, role: "owner" });
  await ensureSettings(db, orgId);
  return {
    userId: owner.id,
    userName: "Dono Teste",
    userEmail: owner.email,
    orgId,
    orgName: name,
    role: "owner",
    advisorCode: null,
    calendarYear: 2026,
  };
}

/** Adds a member with the given role to an organization and returns its context. */
export async function addMember(
  owner: OrgContext,
  role: OrgRole,
  advisorCode: string | null = null,
): Promise<OrgContext> {
  const created = await createUser(`Membro ${role}`);
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: owner.orgId,
    userId: created.id,
    role,
    advisorCode,
  });
  return { ...owner, userId: created.id, userEmail: created.email, role, advisorCode };
}

export function csvFile(lines: string[], name = "rendimentos.csv") {
  return { name, bytes: Buffer.from(lines.join("\n"), "utf8") };
}
