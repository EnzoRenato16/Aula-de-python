import { decimalComma, toBrazilianCsv } from "@raiox/io";
import { BAND_LABEL } from "@/lib/alerts";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { type Band, listResults } from "@/server/services/calculation";
import { getCurrentContext } from "@/server/session";

const BANDS: readonly Band[] = ["abaixo", "transicao", "cheia"];

export async function GET(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) return new Response("Não autorizado", { status: 401 });
  const params = new URL(request.url).searchParams;
  const { run, rows } = await listResults(db(), ctx, {
    search: params.get("search")?.slice(0, 60) ?? undefined,
    advisorCode: params.get("advisorCode") ?? undefined,
    alert: params.get("alert") ?? undefined,
    band: BANDS.find((band) => band === params.get("band")),
  });
  if (!run) return new Response("Ainda não há cálculo.", { status: 404 });

  const csv = toBrazilianCsv(
    [
      "posicao",
      "codigo_cliente",
      "apelido",
      "codigo_assessor",
      "score",
      "rendimentos_totais",
      "base_irpfm",
      "faixa",
      "aliquota",
      "irpfm_devido",
      "retencao_dividendos",
      "a_pagar",
      "a_restituir",
      "carga_efetiva",
      "alertas",
    ],
    rows.map((row) => [
      String(row.position),
      row.clientCode,
      row.nickname,
      row.advisorCode,
      decimalComma(row.score),
      decimalComma(row.totalIncome),
      decimalComma(row.base),
      BAND_LABEL[row.band as Band] ?? row.band,
      decimalComma(row.rate),
      decimalComma(row.minimumTaxDue),
      decimalComma(row.withholding),
      decimalComma(row.amountToPay),
      decimalComma(row.amountToRefund),
      decimalComma(row.effectiveTaxRate),
      row.alertCodes.join(", "),
    ]),
  );
  await audit(db(), ctx, "export.ranking", "calculation_run", run.id, { rows: rows.length });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="raiox-ranking-${run.calendarYear}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
