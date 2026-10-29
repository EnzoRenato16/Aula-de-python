"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { recalculateAction } from "@/app/(app)/painel/actions";
import { Button } from "@/components/ui/button";

export function RecalculateButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await recalculateAction();
          if (result.ok) toast.success(`${result.data.clients} clientes recalculados.`);
          else toast.error(result.error);
        })
      }
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      {pending ? "Recalculando…" : "Recalcular"}
    </Button>
  );
}
