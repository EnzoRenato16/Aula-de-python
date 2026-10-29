"use client";

import { Button } from "@/components/ui/button";

/** Unexpected errors in the app area: no details are shown (they are logged on the server). */
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Não foi possível carregar esta página. Tente de novo; se continuar, fale com o suporte.
      </p>
      <Button className="mt-6" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </div>
  );
}
