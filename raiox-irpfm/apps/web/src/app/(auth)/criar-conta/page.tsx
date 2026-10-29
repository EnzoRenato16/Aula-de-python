import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string; email?: string }>;
}) {
  const { convite, email } = await searchParams;
  if ((await getSession()) && !convite) redirect("/painel");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {convite ? "Aceitar convite" : "Criar conta do escritório"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {convite
            ? "Crie sua conta para entrar no escritório que convidou você."
            : "Você será o dono da conta e poderá convidar sua equipe depois."}
        </p>
      </div>
      <SignUpForm invitationId={convite ?? null} email={email ?? null} />
      <p className="text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4"
          href={convite ? `/entrar?convite=${convite}` : "/entrar"}
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
