"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmAction, discardAction } from "@/app/(app)/importar/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function ConfirmPanel({
  batchId,
  errors,
  existing,
  incoming,
}: {
  batchId: string;
  errors: number;
  existing: number;
  incoming: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"MERGE" | "REPLACE">("MERGE");
  const [acceptErrors, setAcceptErrors] = useState(false);
  const [pending, startTransition] = useTransition();
  const blocked = errors > 0 && !acceptErrors;

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Como aplicar</legend>
        <RadioGroup value={mode} onValueChange={(value) => setMode(value as "MERGE" | "REPLACE")}>
          <div className="flex items-start gap-2.5">
            <RadioGroupItem value="MERGE" id="merge" className="mt-0.5" />
            <Label htmlFor="merge" className="block font-normal">
              <span className="font-medium">Atualizar os clientes da planilha</span>
              <span className="block text-sm text-muted-foreground">
                Substitui os {incoming} clientes do arquivo e mantém os demais da base.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-2.5">
            <RadioGroupItem value="REPLACE" id="replace" className="mt-0.5" />
            <Label htmlFor="replace" className="block font-normal">
              <span className="font-medium">Substituir a base inteira</span>
              <span className="block text-sm text-muted-foreground">
                Remove os clientes que não estão no arquivo ({Math.max(0, existing - incoming)} ou
                mais, conforme os códigos).
              </span>
            </Label>
          </div>
        </RadioGroup>
      </fieldset>
      {errors > 0 ? (
        <div className="flex items-start gap-2.5 rounded-md border border-pay/30 bg-pay/5 p-3">
          <Checkbox
            id="accept"
            checked={acceptErrors}
            onCheckedChange={(value) => setAcceptErrors(value === true)}
          />
          <Label htmlFor="accept" className="block text-sm font-normal">
            Importar só as linhas válidas. As {errors} linha(s) com erro ficam de fora, o que pode
            subestimar o imposto dos clientes afetados.
          </Label>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || blocked}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmAction(batchId, mode, acceptErrors);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(
                `${result.data.clients} clientes importados${result.data.removed ? `, ${result.data.removed} removidos` : ""}. Base recalculada.`,
              );
              router.push("/painel");
            })
          }
        >
          {pending ? "Importando e recalculando…" : "Confirmar importação"}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await discardAction(batchId);
              if (!result.ok) toast.error(result.error);
              else router.push("/importar");
            })
          }
        >
          Descartar
        </Button>
      </div>
    </div>
  );
}
