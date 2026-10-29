import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateOfficeForm } from "@/components/auth/create-office-form";
import { getCurrentContext, getSession } from "@/server/session";

export const metadata: Metadata = { title: "Criar escritório" };

export default async function CreateOfficePage() {
  if (!(await getSession())) redirect("/entrar");
  if (await getCurrentContext()) redirect("/painel");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Criar escritório</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua conta ainda não está em nenhum escritório. Crie um ou peça um convite ao dono do seu
          escritório.
        </p>
      </div>
      <CreateOfficeForm />
    </div>
  );
}
