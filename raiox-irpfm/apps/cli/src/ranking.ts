import {
  type ClientResult,
  type Dec,
  formatBRL,
  formatPercent,
  getRuleSet,
  type RankedClient,
  toMoneyString,
} from "@raiox/engine";
import { decimalComma, toBrazilianCsv } from "@raiox/io";

function band(result: ClientResult): string {
  const { threshold, fullRateFrom } = getRuleSet(result.calendarYear).minimumTax;
  if (result.base.lessThanOrEqualTo(threshold)) return "abaixo do limite";
  if (result.base.lessThan(fullRateFrom)) return "transição";
  return "alíquota cheia";
}

const money = (value: Dec) => decimalComma(toMoneyString(value));
const rate = (value: Dec) => decimalComma(value.times(100).toDecimalPlaces(4).toFixed(4));

export const RANKING_COLUMNS = [
  "posicao",
  "codigo_cliente",
  "apelido",
  "codigo_assessor",
  "score",
  "rendimentos_totais",
  "base_irpfm",
  "faixa",
  "aliquota_pct",
  "irpfm_bruto",
  "irpf_ajuste",
  "irpf_ajuste_origem",
  "redutor",
  "irpfm_devido",
  "retencao_dividendos",
  "saldo_irpfm",
  "a_pagar",
  "a_restituir",
  "carga_efetiva_pct",
  "alertas",
  "regras_pendentes",
] as const;

/** Ranking CSV for Brazilian Excel (semicolon, decimal comma, BOM). */
export function rankingCsv(ranked: readonly RankedClient[]): string {
  return toBrazilianCsv(
    RANKING_COLUMNS,
    ranked.map(({ position, result, score }) => [
      String(position),
      result.clientCode,
      result.nickname,
      result.advisorCode,
      decimalComma(score.score.toFixed(1)),
      money(result.totalIncome),
      money(result.base),
      band(result),
      rate(result.rate),
      money(result.grossMinimumTax),
      money(result.deductions.irpfAdjustment),
      result.deductions.irpfSource,
      money(result.deductions.reducer),
      money(result.minimumTaxDue),
      money(result.withholding.total),
      money(result.finalBalance),
      money(result.amountToPay),
      money(result.amountToRefund),
      rate(result.effectiveTaxRate),
      result.alerts
        .filter((alert) => alert.code !== "REGRA_PENDENTE")
        .map((alert) => alert.code)
        .join(", "),
      result.pendingRulesUsed.join(", "),
    ]),
  );
}

/** Compact console table of the top of the ranking. */
export function rankingTable(ranked: readonly RankedClient[], limit = 10): string {
  const rows = ranked
    .slice(0, limit)
    .map(({ position, result, score }) => [
      String(position).padStart(3),
      result.clientCode.padEnd(10),
      score.score.toFixed(1).padStart(5),
      formatBRL(result.base).padStart(18),
      formatPercent(result.rate, 2).padStart(7),
      formatBRL(result.amountToPay).padStart(16),
      formatBRL(result.amountToRefund).padStart(16),
    ]);
  const header = [
    "  #",
    "cliente   ",
    "score",
    "base IRPFM".padStart(18),
    "alíq.".padStart(7),
    "a pagar".padStart(16),
    "a restituir".padStart(16),
  ];
  return [header, ...rows].map((columns) => columns.join("  ")).join("\n");
}
