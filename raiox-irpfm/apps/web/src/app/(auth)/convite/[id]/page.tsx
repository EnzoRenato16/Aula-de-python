import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { invitation, organization } from "@/server/db/schema";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Convite" };

/** "fulano@exemplo.com" → "f•••••@exemplo.com" (the page is reachable by link only). */
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••••@${domain}`;
}

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [found] = await db()
    .select({
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      orgName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(eq(invitation.id, id));

  if (found?.status !== "pending" || found.expiresAt < new Date()) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Convite indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Este convite não existe, já foi usado ou expirou. Peça um novo convite a quem administra o
          escritório.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const sameEmail = session?.user.email.toLowerCase() === found.email.toLowerCase();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Convite para {found.orgName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enviado para {maskEmail(found.email)}.</p>
      </div>
      {session && sameEmail ? <AcceptInvitation invitationId={id} /> : null}
      {session && !sameEmail ? (
        <p className="text-sm text-muted-foreground">
          Você entrou como {session.user.email}. Saia e entre com o e-mail que recebeu o convite.
        </p>
      ) : null}
      {session ? null : (
        <div className="grid gap-2">
          <Button asChild>
            <Link href={`/criar-conta?convite=${id}&email=${encodeURIComponent(found.email)}`}>
              Criar minha conta
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/entrar?convite=${id}`}>Já tenho conta</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
