import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { TeamManager } from "@/components/team/team-manager";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { listMembers, listPendingInvitations } from "@/server/services/team";
import { requireManagerContext } from "@/server/session";

export const metadata: Metadata = { title: "Equipe" };

const asRole = (role: string) => (role === "owner" || role === "admin" ? role : "member");

export default async function TeamPage() {
  const ctx = await requireManagerContext();
  const [members, invitations] = await Promise.all([
    listMembers(db(), ctx),
    listPendingInvitations(db(), ctx),
  ]);
  const base = env().BETTER_AUTH_URL.replace(/\/+$/, "");
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem acessa o escritório e o que cada um vê. Toda mudança fica na auditoria."
      />
      <TeamManager
        canChangeRoles={ctx.role === "owner"}
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: asRole(member.role),
          advisorCode: member.advisorCode,
          isSelf: member.userId === ctx.userId,
        }))}
        invitations={invitations
          .filter((invitation) => invitation.expiresAt > now)
          .map((invitation) => ({
            id: invitation.id,
            email: invitation.email,
            role: asRole(invitation.role ?? "member"),
            advisorCode: invitation.advisorCode,
            expiresAt: invitation.expiresAt.toISOString(),
            link: `${base}/convite/${invitation.id}`,
          }))}
      />
    </>
  );
}
