/** @jsxRuntime automatic */
/** @jsxImportSource react */

import {
  type ClientResult,
  D,
  type Dec,
  formatBRL,
  formatPercent,
  type Severity,
} from "@raiox/engine";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { FONT_FAMILY } from "./fonts.ts";
import { summarySentences } from "./summary.ts";

export interface Brand {
  officeName: string;
  /** Hex color used for the header band and accents. */
  primaryColor?: string;
  /** PNG/JPG logo (file path, data URI or Buffer). */
  logo?: string | Buffer;
}

export interface ClientReportProps {
  result: ClientResult;
  brand: Brand;
  generatedAt: Date;
}

export const DISCLAIMER =
  "Simulação elaborada com as regras da Lei 15.270/2025 e as informações fornecidas pelo escritório. Não é recomendação de investimento nem consultoria tributária. Valide os números com o contador antes de qualquer decisão.";

const INK = "#1B1F23";
const MUTED = "#5B6670";
const LINE = "#D9DEE2";
const PAPER = "#F6F4EF";
const PAY = "#A3362F";
const REFUND = "#2E6B4F";
export const DEFAULT_PRIMARY = "#12343B";
const ACCENT = "#B9872F";

const SEVERITY_COLOR: Record<Severity, string> = {
  critico: PAY,
  atencao: ACCENT,
  info: MUTED,
};
const SEVERITY_LABEL: Record<Severity, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  info: "Info",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 8.5,
    color: INK,
    paddingTop: 0,
    paddingBottom: 30,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
  },
  band: {
    paddingHorizontal: 36,
    paddingTop: 22,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  office: { fontSize: 15, fontWeight: 600, color: "#FFFFFF" },
  kicker: { fontSize: 7, letterSpacing: 1.2, color: "#E6E9EA", marginTop: 4 },
  bandRight: { alignItems: "flex-end" },
  clientCode: { fontSize: 12, fontWeight: 600, color: "#FFFFFF" },
  bandMeta: { fontSize: 7.5, color: "#E6E9EA", marginTop: 2 },
  body: { paddingHorizontal: 36, paddingTop: 14 },
  summary: {
    fontSize: 9.5,
    lineHeight: 1.45,
    backgroundColor: PAPER,
    padding: 10,
    borderLeftWidth: 3,
    marginBottom: 12,
  },
  kpis: { flexDirection: "row", marginBottom: 12 },
  kpi: { flex: 1, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6, marginRight: 10 },
  kpiLast: { marginRight: 0 },
  kpiLabel: { fontSize: 6.8, color: MUTED, letterSpacing: 0.6 },
  kpiValue: { fontSize: 13, fontWeight: 600, marginTop: 3 },
  kpiNote: { fontSize: 6.8, color: MUTED, marginTop: 2 },
  sectionTitle: {
    fontSize: 7.2,
    fontWeight: 600,
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 5,
    marginTop: 4,
  },
  waterRow: { flexDirection: "row", alignItems: "center", height: 13 },
  waterLabel: { width: 170, fontSize: 7.8 },
  waterTrack: { flex: 1, height: 7, backgroundColor: "#EEF0F2", marginHorizontal: 8 },
  waterValue: { width: 82, textAlign: "right", fontSize: 7.8 },
  waterNote: { fontSize: 6.8, color: MUTED, marginTop: 3 },
  columns: { flexDirection: "row", marginTop: 10 },
  column: { flex: 1 },
  columnGap: { width: 18 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 2.2,
  },
  tableHead: { color: MUTED, fontSize: 6.8, fontWeight: 600 },
  cellType: { flex: 1, paddingRight: 4 },
  cellAmount: { width: 72, textAlign: "right" },
  cellBase: { width: 36, textAlign: "right" },
  alert: { flexDirection: "row", marginBottom: 4 },
  alertTag: { width: 40, fontSize: 6.5, fontWeight: 600, paddingTop: 0.6 },
  alertText: { flex: 1, fontSize: 7.4, lineHeight: 1.35 },
  trailRow: {
    flexDirection: "row",
    paddingVertical: 1.6,
    borderBottomWidth: 0.4,
    borderBottomColor: LINE,
  },
  trailLabel: { width: 165, fontSize: 7, fontWeight: 500 },
  trailFormula: { flex: 1, fontSize: 7, color: "#33393F" },
  trailRef: { width: 92, fontSize: 6.2, color: MUTED, textAlign: "right" },
  footer: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 14,
  },
  disclaimer: {
    fontSize: 6.8,
    lineHeight: 1.4,
    color: INK,
    borderTopWidth: 0.8,
    borderTopColor: INK,
    paddingTop: 5,
  },
  footMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.2,
    color: MUTED,
    marginTop: 3,
  },
  logo: { height: 26, marginBottom: 6, objectFit: "contain" },
});

function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

interface WaterfallItem {
  label: string;
  value: Dec;
  /** Length of the bar: for deductions of art. 16-A §3º, only the part they absorb. */
  bar: Dec;
  kind: "total" | "minus" | "result";
}

function waterfall(result: ClientResult): WaterfallItem[] {
  const d = result.deductions;
  const deductions: [string, Dec][] = [
    [
      `(−) IRPF do ajuste${d.irpfSource === "ESTIMADO" ? " (estimado)" : d.irpfSource === "AUSENTE" ? " (não informado)" : ""}`,
      d.irpfAdjustment,
    ],
    ["(−) IR exclusivo na fonte", d.exclusiveWithholding],
    ["(−) IR exterior (Lei 14.754)", d.law14754],
    ["(−) IR definitivo (bolsa)", d.definitive],
    ["(−) Redutor (art. 16-B)", d.reducer],
  ];
  // The IRPFM due is never negative (§4º): each deduction absorbs at most what is left.
  let remaining = result.grossMinimumTax;
  const items: WaterfallItem[] = [
    {
      label: "IRPFM bruto (alíquota × base)",
      value: result.grossMinimumTax,
      bar: result.grossMinimumTax,
      kind: "total",
    },
    ...deductions.map(([label, value]): WaterfallItem => {
      const absorbed = value.lessThan(remaining) ? value : remaining;
      remaining = remaining.minus(absorbed);
      return { label, value, bar: absorbed, kind: "minus" };
    }),
    {
      label: "= IRPFM devido",
      value: result.minimumTaxDue,
      bar: result.minimumTaxDue,
      kind: "result",
    },
    {
      label: "(−) Retenção sobre dividendos",
      value: result.withholding.total,
      bar: result.withholding.total,
      kind: "minus",
    },
    {
      label: result.finalBalance.isNegative() ? "= Saldo a restituir" : "= Saldo a pagar",
      value: result.finalBalance.abs(),
      bar: result.finalBalance.abs(),
      kind: "result",
    },
  ];
  return items.filter((item) => item.kind !== "minus" || item.value.greaterThan(0));
}

function Waterfall({ result, primary }: { result: ClientResult; primary: string }) {
  const items = waterfall(result);
  const scale = items.reduce((max, item) => (item.bar.greaterThan(max) ? item.bar : max), new D(0));
  const partial = items.some((item) => item.bar.lessThan(item.value));
  return (
    <View>
      {items.map((item) => {
        const share = scale.isZero()
          ? 0
          : item.bar.dividedBy(scale).times(100).toDecimalPlaces(1).toNumber();
        const color =
          item.kind === "minus"
            ? "#9AA5AE"
            : item.label.includes("restituir")
              ? REFUND
              : item.label.includes("pagar") && item.value.greaterThan(0)
                ? PAY
                : primary;
        return (
          <View key={item.label} style={styles.waterRow}>
            <Text style={[styles.waterLabel, item.kind !== "minus" ? { fontWeight: 600 } : {}]}>
              {item.label}
            </Text>
            <View style={styles.waterTrack}>
              <View style={{ width: `${share}%`, height: 7, backgroundColor: color }} />
            </View>
            <Text style={[styles.waterValue, item.kind !== "minus" ? { fontWeight: 600 } : {}]}>
              {formatBRL(item.value)}
            </Text>
          </View>
        );
      })}
      {partial ? (
        <Text style={styles.waterNote}>
          As deduções zeram o IRPFM sem deixá-lo negativo: a barra mostra só a parte usada.
        </Text>
      ) : null}
    </View>
  );
}

const MAX_INCOME_ROWS = 11;
const MAX_ALERTS = 6;
const TRAIL_STEPS = [
  "rendimentos-totais",
  "exclusoes",
  "base",
  "aliquota",
  "irpfm-bruto",
  "deducao-i",
  "deducao-ii",
  "deducao-v",
  "irpfm-devido",
  "retencao",
  "saldo",
  "carga-efetiva",
];

export function ClientReport({ result, brand, generatedAt }: ClientReportProps) {
  const primary = brand.primaryColor ?? DEFAULT_PRIMARY;
  const balanceColor = result.amountToPay.greaterThan(0)
    ? PAY
    : result.amountToRefund.greaterThan(0)
      ? REFUND
      : INK;
  const incomes = [...result.byType].sort((a, b) => b.amount.comparedTo(a.amount));
  const shownIncomes = incomes.slice(0, MAX_INCOME_ROWS);
  const hiddenIncomes = incomes.slice(MAX_INCOME_ROWS);
  const severityOrder: Record<Severity, number> = { critico: 0, atencao: 1, info: 2 };
  const alerts = [...result.alerts]
    .filter((alert) => alert.code !== "REGRA_PENDENTE")
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, MAX_ALERTS);
  const trail = TRAIL_STEPS.flatMap((id) => result.trail.filter((step) => step.id === id));

  return (
    <Document
      title={`Raio-X IRPFM: ${result.clientCode}`}
      author={brand.officeName}
      subject="Simulação da Lei 15.270/2025"
      creator="Raio-X IRPFM"
      producer="Raio-X IRPFM"
      language="pt-BR"
    >
      <Page size="A4" style={styles.page}>
        <View style={[styles.band, { backgroundColor: primary }]}>
          <View>
            {brand.logo ? <Image src={brand.logo} style={styles.logo} /> : null}
            <Text style={styles.office}>{brand.officeName}</Text>
            <Text style={styles.kicker}>
              RAIO-X IRPFM · SIMULAÇÃO · ANO-CALENDÁRIO {result.calendarYear} · DECLARAÇÃO{" "}
              {result.calendarYear + 1}
            </Text>
          </View>
          <View style={styles.bandRight}>
            <Text style={styles.clientCode}>{result.clientCode}</Text>
            {result.nickname ? <Text style={styles.bandMeta}>{result.nickname}</Text> : null}
            <Text style={styles.bandMeta}>
              {result.advisorCode ? `Assessor ${result.advisorCode} · ` : ""}Gerado em{" "}
              {formatDate(generatedAt)}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={[styles.summary, { borderLeftColor: primary }]}>
            {summarySentences(result).join(" ")}
          </Text>

          <View style={styles.kpis}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>BASE DO IRPFM</Text>
              <Text style={styles.kpiValue}>{formatBRL(result.base)}</Text>
              <Text style={styles.kpiNote}>de {formatBRL(result.totalIncome)} recebidos</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>ALÍQUOTA</Text>
              <Text style={styles.kpiValue}>{formatPercent(result.rate, 2)}</Text>
              <Text style={styles.kpiNote}>bruto {formatBRL(result.grossMinimumTax)}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>IRPFM DEVIDO</Text>
              <Text style={styles.kpiValue}>{formatBRL(result.minimumTaxDue)}</Text>
              <Text style={styles.kpiNote}>retenção {formatBRL(result.withholding.total)}</Text>
            </View>
            <View style={[styles.kpi, styles.kpiLast]}>
              <Text style={styles.kpiLabel}>
                {result.amountToRefund.greaterThan(0) ? "SALDO A RESTITUIR" : "SALDO A PAGAR"}
              </Text>
              <Text style={[styles.kpiValue, { color: balanceColor }]}>
                {formatBRL(
                  result.amountToRefund.greaterThan(0) ? result.amountToRefund : result.amountToPay,
                )}
              </Text>
              <Text style={styles.kpiNote}>
                carga efetiva {formatPercent(result.effectiveTaxRate, 2)}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>DO IRPFM BRUTO AO SALDO</Text>
          <Waterfall result={result} primary={primary} />

          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.sectionTitle}>RENDIMENTOS DO ANO</Text>
              <View style={[styles.tableRow, styles.tableHead]}>
                <Text style={styles.cellType}>Tipo</Text>
                <Text style={styles.cellAmount}>Valor</Text>
                <Text style={styles.cellBase}>Base?</Text>
              </View>
              {shownIncomes.map((income) => (
                <View key={income.type} style={styles.tableRow}>
                  <Text style={styles.cellType}>{income.label}</Text>
                  <Text style={styles.cellAmount}>{formatBRL(income.amount)}</Text>
                  <Text style={[styles.cellBase, { color: income.inBase ? INK : MUTED }]}>
                    {income.inBase ? "sim" : "não"}
                  </Text>
                </View>
              ))}
              {hiddenIncomes.length > 0 ? (
                <Text style={{ fontSize: 6.8, color: MUTED, marginTop: 2 }}>
                  + {hiddenIncomes.length} outro(s) tipo(s)
                </Text>
              ) : null}
            </View>
            <View style={styles.columnGap} />
            <View style={styles.column}>
              <Text style={styles.sectionTitle}>PONTOS DE ATENÇÃO</Text>
              {alerts.length === 0 ? (
                <Text style={styles.alertText}>Nenhum ponto de atenção nesta simulação.</Text>
              ) : (
                alerts.map((alert) => (
                  <View key={alert.code} style={styles.alert}>
                    <Text style={[styles.alertTag, { color: SEVERITY_COLOR[alert.severity] }]}>
                      {SEVERITY_LABEL[alert.severity].toUpperCase()}
                    </Text>
                    <Text style={styles.alertText}>{alert.message}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>TRILHA DE CÁLCULO</Text>
          {trail.map((step) => (
            <View key={step.id} style={styles.trailRow} wrap={false}>
              <Text style={styles.trailLabel}>{step.label}</Text>
              <Text style={styles.trailFormula}>{step.formula}</Text>
              <Text style={styles.trailRef}>{step.legalRef.replace("Lei 9.250, ", "")}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
          <View style={styles.footMeta}>
            <Text>
              Regras {result.ruleSetVersion}
              {result.conservative ? " · modo conservador" : ""}
              {result.pendingRulesUsed.length > 0
                ? ` · interpretações PENDENTES usadas: ${result.pendingRulesUsed.join(", ")}`
                : ""}
            </Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
