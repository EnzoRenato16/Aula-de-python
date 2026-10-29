"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, officeSlug } from "@/lib/auth-errors";

const base = z.object({
  name: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(10, "A senha precisa de pelo menos 10 caracteres."),
  office: z.string().trim(),
});

export function SignUpForm({
  invitationId,
  email,
}: {
  invitationId: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const schema = invitationId
    ? base
    : base.extend({ office: z.string().trim().min(2, "Informe o nome do escritório.") });
  type Values = z.infer<typeof base>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: email ?? "", password: "", office: "" },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const { error: signUpError } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    if (signUpError) {
      setError(authErrorMessage(signUpError));
      return;
    }
    if (invitationId) {
      const { error: acceptError } = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (acceptError) {
        setError(authErrorMessage(acceptError));
        return;
      }
      router.push("/painel");
    } else {
      const { data, error: orgError } = await authClient.organization.create({
        name: values.office,
        slug: officeSlug(values.office),
      });
      if (orgError || !data) {
        setError(authErrorMessage(orgError));
        return;
      }
      await authClient.organization.setActive({ organizationId: data.id });
      router.push("/importar");
    }
    router.refresh();
  }

  const { errors, isSubmitting } = form.formState;
  const field = (id: keyof Values, label: string, props: React.ComponentProps<typeof Input>) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={!!errors[id]} {...props} {...form.register(id)} />
      {errors[id] ? <p className="text-sm text-destructive">{errors[id]?.message}</p> : null}
    </div>
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {field("name", "Seu nome", { autoComplete: "name" })}
      {field("email", "E-mail profissional", {
        type: "email",
        autoComplete: "email",
        readOnly: !!email,
      })}
      {field("password", "Senha (mínimo 10 caracteres)", {
        type: "password",
        autoComplete: "new-password",
      })}
      {invitationId
        ? null
        : field("office", "Nome do escritório", { autoComplete: "organization" })}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting
          ? "Criando…"
          : invitationId
            ? "Criar conta e aceitar o convite"
            : "Criar conta"}
      </Button>
    </form>
  );
}
