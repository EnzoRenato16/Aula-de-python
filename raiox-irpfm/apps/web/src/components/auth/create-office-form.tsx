"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, officeSlug } from "@/lib/auth-errors";

export function CreateOfficeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Informe o nome do escritório.");
      return;
    }
    setPending(true);
    setError(null);
    const { data, error: orgError } = await authClient.organization.create({
      name: name.trim(),
      slug: officeSlug(name),
    });
    if (orgError || !data) {
      setError(authErrorMessage(orgError));
      setPending(false);
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    router.push("/importar");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="office">Nome do escritório</Label>
        <Input
          id="office"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="organization"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Criando…" : "Criar escritório"}
      </Button>
    </form>
  );
}
