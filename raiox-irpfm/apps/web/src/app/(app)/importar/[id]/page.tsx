import { and, count, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { KpiStrip } from "@/components/dashboard/kpis";
import { ConfirmPanel } from "@/components/import/confirm-panel";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotFoundError } from "@/server/context";
import { db } from "@/server/db";
import { client } from "@/server/db/schema";
import { getBatch } from "@/server/services/imports";
import { requireManagerContext } from "@/server/session";

export const metadata: Metadata = { title: "Pré-visualizar importação" };

const MAX_ISSUES_SHOWN = 300;

export default async function ImportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManagerContext();
  const { id } = await params;
  let batch: Awaited<ReturnType<typeof getBatch>>;
  try {
    batch = await getBatch(db(), ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  // The stored list never changes, so its position is a stable identity.
  const issues = batch.issues
    .map((issue, position) => ({ ...issue, id: position }))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "erro" ? -1 : 1));
  const codes = batch.payload?.clients.map((entry) => entry.clientCode) ?? [];
  const yearClients = and(eq(client.orgId, ctx.orgId), eq(client.calendarYear, ctx.calendarYear));
  const [[existing], [total]] = await Promise.all([
    codes.length === 0
      ? Promise.resolve([{ value: 0 }])
      : db()
          .select({ value: count() })
          .from(client)
          .where(and(yearClients, inArray(client.code, codes))),
    db().select({ value: count() }).from(client).where(yearClients),
  ]);
  const existingCount = existing?.value ?? 0;
  const totalExisting = total?.value ?? 0;

  return (
    <>
      <PageHeader
        title="Pré-visualizar importação"
        description={
          <>
            {batch.fileName} · enviado em {formatDateTime(batch.createdAt)} ·{" "}
            <Link href="/importar" className="underline underline-offset-4">
              voltar
            </Link>
          </>
        }
      />
      <KpiStrip
        items={[
          {
            label: "Clientes na planilha",
            value: String(batch.stats.clients),
            note: `${existingCount} já existem · ${batch.stats.clients - existingCount} novos`,
          },
          { label: "Linhas de rendimento", value: String(batch.stats.incomeLines) },
          { label: "Empresas", value: String(batch.stats.companies) },
          {
            label: "Erros",
            value: String(batch.stats.errors),
            tone: batch.stats.errors > 0 ? "pay" : "default",
          },
          {
            label: "Avisos",
            value: String(batch.stats.warnings),
            tone: batch.stats.warnings > 0 ? "attention" : "default",
          },
        ]}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="problemas" className="min-w-0">
          <h2 id="problemas" className="mb-3 text-sm font-semibold">
            Erros e avisos por linha
          </h2>
          {issues.length === 0 ? (
            <p className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
              Nenhum problema encontrado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Tipo
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Aba
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Linha
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Coluna
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Mensagem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => (
                    <tr key={issue.id} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-normal",
                            issue.severity === "erro"
                              ? "border-pay/30 text-pay"
                              : "border-attention/30 text-attention",
                          )}
                        >
                          {issue.severity}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{issue.sheet}</td>
                      <td className="px-3 py-2 tabular-nums">{issue.row ?? "—"}</td>
                      <td className="px-3 py-2">{issue.column ?? "—"}</td>
                      <td className="px-3 py-2">
                        {issue.message}
                        {issue.value ? (
                          <span className="block text-xs text-muted-foreground">
                            valor: {issue.value}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {issues.length > MAX_ISSUES_SHOWN ? (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Mostrando {MAX_ISSUES_SHOWN} de {issues.length}. Corrija os primeiros e envie de
                  novo.
                </p>
              ) : null}
            </div>
          )}
        </section>
        <aside>
          {batch.status === "PREVIEW" ? (
            <ConfirmPanel
              batchId={batch.id}
              errors={batch.stats.errors}
              existing={totalExisting}
              incoming={batch.stats.clients}
            />
          ) : (
            <p className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
              Esta importação já foi {batch.status === "CONFIRMED" ? "confirmada" : "descartada"}.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
