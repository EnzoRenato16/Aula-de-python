import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string }>;
}) {
  const { convite } = await searchParams;
  if ((await getSession()) && !convite) redirect("/painel");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesse o painel do seu escritório.</p>
      </div>
      <SignInForm invitationId={convite ?? null} />
      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4"
          href={convite ? `/criar-conta?convite=${convite}` : "/criar-conta"}
        >
          Criar conta do escritório
        </Link>
      </p>
    </div>
  );
}
