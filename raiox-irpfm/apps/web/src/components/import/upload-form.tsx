"use client";

import { Upload } from "lucide-react";
import { useActionState, useState } from "react";
import { uploadAction } from "@/app/(app)/importar/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadAction, null);
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <label
        htmlFor="arquivo"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted"
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <span className="font-medium">{fileName ?? "Escolher planilha"}</span>
        <span className="text-sm text-muted-foreground">
          Template .xlsx preenchido ou .csv de rendimentos · até 8 MB
        </span>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </label>
      <Button type="submit" disabled={pending || !fileName}>
        {pending ? "Validando…" : "Validar e pré-visualizar"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Nada muda na base antes da sua confirmação na próxima tela. Não envie CPF, CNPJ, nome
        completo, e-mail ou telefone: o sistema recusa.
      </p>
    </form>
  );
}
