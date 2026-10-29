import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "../context.ts";
import { invitation, member } from "../db/schema.ts";
import { addMember, createOrganization, db } from "../test/fixtures.ts";
import { listAudit } from "./audit.ts";
import { renameOffice } from "./office.ts";
import {
  cancelInvitation,
  changeRole,
  inviteMember,
  listMembers,
  removeMember,
  setAdvisorCode,
  TeamError,
} from "./team.ts";

// These checks run before any Better Auth call, so no session is needed.
const noSession = new Headers();

async function memberIdOf(orgId: string, userId: string) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  return row?.id as string;
}

describe("equipe", () => {
  it("assessor não lista, não convida, não remove e não vê a auditoria", async () => {
    const owner = await createOrganization();
    const advisor = await addMember(owner, "member", "ASS-1");
    await expect(listMembers(db, advisor)).rejects.toThrow(ForbiddenError);
    await expect(
      inviteMember(db, advisor, noSession, { email: "x@y.com", role: "member", advisorCode: "" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      removeMember(db, advisor, noSession, await memberIdOf(owner.orgId, owner.userId)),
    ).rejects.toThrow(ForbiddenError);
    await expect(listAudit(db, advisor)).rejects.toThrow(ForbiddenError);
    await expect(renameOffice(db, advisor, noSession, "Outro nome")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("ninguém muda o próprio acesso; admin não remove o dono nem muda papéis", async () => {
    const owner = await createOrganization();
    const admin = await addMember(owner, "admin");
    const ownerMemberId = await memberIdOf(owner.orgId, owner.userId);
    await expect(removeMember(db, owner, noSession, ownerMemberId)).rejects.toThrow(TeamError);
    await expect(changeRole(db, owner, noSession, ownerMemberId, "member")).rejects.toThrow(
      TeamError,
    );
    await expect(removeMember(db, admin, noSession, ownerMemberId)).rejects.toThrow(ForbiddenError);
    const advisor = await addMember(owner, "member", "ASS-1");
    await expect(
      changeRole(db, admin, noSession, await memberIdOf(owner.orgId, advisor.userId), "admin"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("um escritório não altera membros nem convites de outro", async () => {
    const a = await createOrganization("A");
    const b = await createOrganization("B");
    const advisorOfA = await addMember(a, "member", "ASS-1");
    const memberIdInA = await memberIdOf(a.orgId, advisorOfA.userId);
    const invitationId = randomUUID();
    await db.insert(invitation).values({
      id: invitationId,
      organizationId: a.orgId,
      email: "convidado@exemplo.com.br",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: a.userId,
    });

    await expect(setAdvisorCode(db, b, memberIdInA, "ASS-9")).rejects.toThrow(NotFoundError);
    await expect(removeMember(db, b, noSession, memberIdInA)).rejects.toThrow(NotFoundError);
    await expect(changeRole(db, b, noSession, memberIdInA, "admin")).rejects.toThrow(NotFoundError);
    await expect(cancelInvitation(db, b, noSession, invitationId)).rejects.toThrow(NotFoundError);
    expect((await listMembers(db, b)).map((row) => row.userId)).toEqual([b.userId]);
  });

  it("valida o convite antes de chamar a autenticação", async () => {
    const owner = await createOrganization();
    await expect(
      inviteMember(db, owner, noSession, {
        email: "não é e-mail",
        role: "member",
        advisorCode: "",
      }),
    ).rejects.toThrow(/E-mail inválido/);
    await expect(
      inviteMember(db, owner, noSession, { email: "a@b.com", role: "owner", advisorCode: "" }),
    ).rejects.toThrow();
  });

  it("guarda o código de assessor em maiúsculas e o registra na auditoria", async () => {
    const owner = await createOrganization();
    const advisor = await addMember(owner, "member", null);
    const id = await memberIdOf(owner.orgId, advisor.userId);
    await setAdvisorCode(db, owner, id, " ass-7 ");
    const [row] = await db.select().from(member).where(eq(member.id, id));
    expect(row?.advisorCode).toBe("ASS-7");
    expect((await listAudit(db, owner)).map((entry) => entry.action)).toContain(
      "team.advisor_code",
    );
  });
});
