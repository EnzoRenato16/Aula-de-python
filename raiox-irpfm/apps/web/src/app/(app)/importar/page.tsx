import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { UploadForm } from "@/components/import/upload-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { db } from "@/server/db";
import { recentBatches } from "@/server/services/imports";
import { requireManagerContext } from "@/server/session";

export const metadata: Metadata = { title: "Importar planilha" };

const STATUS: Record<string, string> = {
  PREVIEW: "Aguardando confirmação",
  CONFIRMED: "Importada",
  DISCARDED: "Descartada",
};

export default async function ImportPage() {
  const ctx = await requireManagerContext();
  const batches = await recentBatches(db(), ctx);
  return (
    <>
      <PageHeader
        title="Importar planilha"
        description="Baixe o template, preencha uma linha por cliente × tipo de rendimento × mês e envie. Você vê os erros por linha e confirma antes de qualquer mudança."
        actions={
          <Button asChild variant="outline">
            <a href="/api/template">
              <Download className="size-4" /> Baixar template
            </a>
          </Button>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="enviar">
          <h2 id="enviar" className="mb-3 text-sm font-semibold">
            Enviar planilha
          </h2>
          <UploadForm />
        </section>
        <section aria-labelledby="recentes">
          <h2 id="recentes" className="mb-3 text-sm font-semibold">
            Importações recentes
          </h2>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {batches.map((batch) => {
                const stats = batch.stats as { clients: number; errors: number };
                return (
                  <li
                    key={batch.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/importar/${batch.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {batch.fileName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(batch.createdAt)} · {stats.clients} clientes
                        {stats.errors > 0 ? ` · ${stats.errors} erro(s)` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={batch.status === "PREVIEW" ? "default" : "secondary"}
                      className="shrink-0 font-normal"
                    >
                      {STATUS[batch.status] ?? batch.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
