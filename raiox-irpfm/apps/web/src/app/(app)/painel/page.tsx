import { D, sum } from "@raiox/engine";
import { Download, FileSpreadsheet, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { RecalculateButton } from "@/components/app/recalculate-button";
import { DashboardFilters } from "@/components/dashboard/filters";
import { KpiStrip } from "@/components/dashboard/kpis";
import { RankingTable } from "@/components/dashboard/ranking-table";
import { Button } from "@/components/ui/button";
import { brl, formatDateTime } from "@/lib/format";
import { isManager } from "@/server/context";
import { db } from "@/server/db";
import { advisorCodes, type Band, listResults } from "@/server/services/calculation";
import { requireContext } from "@/server/session";

export const metadata: Metadata = { title: "Painel" };

const BANDS: readonly Band[] = ["abaixo", "transicao", "cheia"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const band = BANDS.find((value) => value === params.faixa);
  const filters = {
    search: params.busca?.slice(0, 60),
    advisorCode: params.assessor,
    alert: params.alerta,
    band,
  };
  const [{ run, rows }, advisors] = await Promise.all([
    listResults(db(), ctx, filters),
    advisorCodes(db(), ctx),
  ]);
  const manager = isManager(ctx);

  if (!run) {
    return (
      <>
        <PageHeader title="Painel" />
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">Nenhum cálculo ainda</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {manager
              ? "Importe a planilha do escritório (ou cadastre um cliente) para ver quem paga IRPFM, quem está na faixa de transição e quem tem retenção a restituir."
              : "Quando o escritório importar a base, seus clientes aparecem aqui."}
          </p>
          {manager ? (
            <div className="mt-5 flex justify-center gap-2">
              <Button asChild>
                <Link href="/importar">
                  <FileSpreadsheet className="size-4" /> Importar planilha
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/clientes/novo">
                  <UserPlus className="size-4" /> Cadastrar cliente
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </>
    );
  }

  const paying = rows.filter((row) => new D(row.amountToPay).greaterThan(0));
  const refunding = rows.filter((row) => new D(row.amountToRefund).greaterThan(0));
  const total = (values: string[]) => sum(values.map((value) => new D(value))).toFixed(2);
  const inBand = rows.filter((row) => row.band === "transicao").length;
  const exportQuery = new URLSearchParams(
    Object.entries(filters).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
    ),
  ).toString();
  const noAdvisorCode = !manager && !ctx.advisorCode;

  return (
    <>
      <PageHeader
        title="Painel"
        description={
          <>
            Simulação do ano-calendário {run.calendarYear} · cálculo de{" "}
            {formatDateTime(run.createdAt)} · regras {run.ruleSetVersion}
            {run.conservative ? " · modo conservador" : ""}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/exportar/ranking${exportQuery ? `?${exportQuery}` : ""}`}>
                <Download className="size-4" /> Exportar CSV
              </a>
            </Button>
            {manager ? <RecalculateButton /> : null}
            {manager ? (
              <Button asChild>
                <Link href="/clientes/novo">
                  <UserPlus className="size-4" /> Novo cliente
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {noAdvisorCode ? (
        <p className="mb-4 rounded-md border bg-attention-bg px-4 py-3 text-sm text-attention">
          Seu usuário ainda não tem código de assessor. Peça ao dono ou a um admin do escritório
          para vincular seu código na tela Equipe.
        </p>
      ) : null}
      <KpiStrip
        items={[
          { label: "Clientes", value: String(rows.length), note: "no filtro atual" },
          {
            label: "IRPFM a pagar",
            value: brl(total(paying.map((row) => row.amountToPay))),
            note: `${paying.length} cliente(s)`,
            tone: paying.length > 0 ? "pay" : "default",
          },
          {
            label: "Retenção a restituir",
            value: brl(total(refunding.map((row) => row.amountToRefund))),
            note: `${refunding.length} cliente(s)`,
            tone: refunding.length > 0 ? "refund" : "default",
          },
          {
            label: "Retenção no ano",
            value: brl(total(rows.map((row) => row.withholding))),
            note: "antecipação do IRPFM",
          },
          {
            label: "Faixa de transição",
            value: String(inBand),
            note: "base entre os limites",
            tone: inBand > 0 ? "attention" : "default",
          },
        ]}
      />
      <div className="mt-6 mb-3">
        <DashboardFilters advisors={advisors} showAdvisor={manager} />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum cliente com esses filtros.
        </p>
      ) : (
        <RankingTable rows={rows} />
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Ordem pelo score de oportunidade (IRPFM a pagar, faixa de transição, restituição, retenção e
        dados faltando). Simulação; não é recomendação de investimento nem consultoria tributária.
      </p>
    </>
  );
}
