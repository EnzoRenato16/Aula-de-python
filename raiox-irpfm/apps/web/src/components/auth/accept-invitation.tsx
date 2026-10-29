"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    const { data, error: acceptError } = await authClient.organization.acceptInvitation({
      invitationId,
    });
    if (acceptError) {
      setError(authErrorMessage(acceptError));
      setPending(false);
      return;
    }
    const organizationId = data?.invitation.organizationId;
    if (organizationId) await authClient.organization.setActive({ organizationId });
    router.push("/painel");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="w-full" onClick={accept} disabled={pending}>
        {pending ? "Entrando no escritório…" : "Aceitar convite"}
      </Button>
    </div>
  );
}
