import type { EvaluatedLine } from "./calculate.ts";
import { formatBRL, formatNumber, formatPercent } from "./format.ts";
import { D, type Dec, sum, ZERO } from "./money.ts";
import type { IncomeTypeDefinition, RuleSet } from "./rules/types.ts";
import type { ClientResult, ReducerStrategy, TrailStep } from "./types.ts";

export const MONTH_NAMES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

const STRATEGY_LABEL: Record<ReducerStrategy, string> = {
  INCREMENTAL_NET:
    "acréscimo do IRPFM devido (já com deduções I a IV) pela inclusão dos dividendos",
  INCREMENTAL_GROSS: "acréscimo do IRPFM bruto pela inclusão dos dividendos",
  NOMINAL_RATE: "alíquota nominal do IRPFM",
};

const ONE = new D(1);
/** Decimal places (in percent) of the transition-band rate shown in the trail. */
const AUDIT_RATE_PLACES = 8;

function brlStep(
  id: string,
  label: string,
  formula: string,
  value: Dec,
  ruleIds: string[],
  legalRef: string,
  children?: TrailStep[],
): TrailStep {
  const step: TrailStep = { id, label, formula, value, unit: "BRL", ruleIds, legalRef };
  if (children && children.length > 0) step.children = children;
  return step;
}

function exclusionRule(definition: IncomeTypeDefinition): string {
  return definition.base.kind === "EXCLUDED" || definition.base.kind === "CHOICE"
    ? definition.base.ruleId
    : "R-16A-EX-XII";
}

/** Builds the audit trail: every step with value, formula and legal source. */
export function buildTrail(
  result: ClientResult,
  lines: readonly EvaluatedLine[],
  ruleSet: RuleSet,
): TrailStep[] {
  const { minimumTax, monthlyWithholding } = ruleSet;
  const steps: TrailStep[] = [];
  const incomeLines = lines.filter((line) => line.definition.base.kind !== "SUBTRACTED");

  steps.push(
    brlStep(
      "rendimentos-totais",
      "Rendimentos recebidos no ano",
      `Soma de ${incomeLines.length} linha(s) de rendimento recebidas no ano-calendário (regime de caixa)`,
      result.totalIncome,
      ["R-16A-02"],
      "Lei 9.250, art. 16-A, caput",
    ),
  );

  // Exclusions, grouped by type (transition dividends apart)
  const excludedChildren: TrailStep[] = [];
  for (const definition of ruleSet.incomeTypes) {
    const excluded = incomeLines.filter(
      (line) => line.definition.code === definition.code && !line.inBase,
    );
    const amount = sum(excluded.map((line) => line.amount));
    if (amount.isZero()) continue;
    const isTransition = definition.code === "DIVIDENDOS";
    const ruleId = isTransition ? "R-16A-EX-XII" : exclusionRule(definition);
    excludedChildren.push(
      brlStep(
        `exclusao-${definition.code}`,
        isTransition ? "Lucros e dividendos da regra de transição" : definition.label,
        `${formatBRL(amount)} fora da base`,
        amount,
        [ruleId],
        ruleSet.rules.find((rule) => rule.id === ruleId)?.legalRef ?? "Lei 9.250, art. 16-A, §1º",
      ),
    );
  }
  steps.push(
    brlStep(
      "exclusoes",
      "Exclusões da base (lista taxativa)",
      excludedChildren.length === 0
        ? "Nenhum rendimento excluído"
        : excludedChildren.map((child) => `${child.label} ${formatBRL(child.value)}`).join(" + "),
      result.excludedIncome,
      ["R-16A-09"],
      "Lei 9.250, art. 16-A, §1º",
      excludedChildren,
    ),
  );

  if (result.baseDeductions.greaterThan(0)) {
    steps.push(
      brlStep(
        "repasses-cartorio",
        "Repasses obrigatórios (cartórios)",
        `${formatBRL(result.baseDeductions)} subtraídos da base`,
        result.baseDeductions,
        ["R-16A-EX-§7"],
        "Lei 9.250, art. 16-A, §7º",
      ),
    );
  }

  steps.push(
    brlStep(
      "base",
      "Base de cálculo do IRPFM",
      result.baseDeductions.greaterThan(0)
        ? `${formatBRL(result.totalIncome)} − ${formatBRL(result.excludedIncome)} − ${formatBRL(result.baseDeductions)} = ${formatBRL(result.base)}`
        : `${formatBRL(result.totalIncome)} − ${formatBRL(result.excludedIncome)} = ${formatBRL(result.base)}`,
      result.base,
      ["R-16A-04", "R-16A-09"],
      "Lei 9.250, art. 16-A, §1º",
    ),
  );

  steps.push({
    id: "sujeicao",
    label: "Sujeito à tributação mínima?",
    formula: `${formatBRL(result.totalIncome)} ${result.subjectToMinimumTax ? ">" : "≤"} ${formatBRL(minimumTax.threshold)} → ${result.subjectToMinimumTax ? "sim" : "não"}`,
    value: result.subjectToMinimumTax ? ONE : ZERO,
    unit: "FLAG",
    ruleIds: ["R-16A-01", "R-16A-03"],
    legalRef: "Lei 9.250, art. 16-A, caput",
  });

  // In the linear band the rate has infinitely many decimals, so "rate × base"
  // with a printed rate can miss a cent. The gross tax is shown with the exact
  // equivalent formula instead: base² ÷ (divisor × 100) − offset% × base.
  const inBand =
    result.subjectToMinimumTax &&
    result.base.greaterThan(minimumTax.threshold) &&
    result.base.lessThan(minimumTax.fullRateFrom);
  const ratePlaces = inBand ? AUDIT_RATE_PLACES : 4;
  let rateFormula: string;
  let rateRules: string[];
  if (!result.subjectToMinimumTax || result.base.lessThanOrEqualTo(minimumTax.threshold)) {
    rateFormula = `Base ${formatBRL(result.base)} ≤ ${formatBRL(minimumTax.threshold)} → 0%`;
    rateRules = ["R-16A-10"];
  } else if (result.base.greaterThanOrEqualTo(minimumTax.fullRateFrom)) {
    rateFormula = `Base ${formatBRL(result.base)} ≥ ${formatBRL(minimumTax.fullRateFrom)} → ${formatPercent(minimumTax.maxRate)}`;
    rateRules = ["R-16A-12"];
  } else {
    rateFormula = `${formatBRL(result.base)} ÷ ${formatNumber(minimumTax.linearDivisor)} − ${formatNumber(minimumTax.linearOffset)} = ${formatPercent(result.rate, ratePlaces)} (sem arredondar)`;
    rateRules = ["R-16A-11", "R-16A-13"];
  }
  steps.push({
    id: "aliquota",
    label: "Alíquota da tributação mínima",
    formula: rateFormula,
    value: result.rate,
    unit: "RATE",
    ruleIds: rateRules,
    legalRef: "Lei 9.250, art. 16-A, §2º",
  });

  steps.push(
    brlStep(
      "irpfm-bruto",
      "IRPFM bruto",
      inBand
        ? `${formatBRL(result.base)}² ÷ ${formatNumber(minimumTax.linearDivisor.times(100))} − ${formatNumber(minimumTax.linearOffset)}% × ${formatBRL(result.base)} = ${formatBRL(result.grossMinimumTax)} (igual a alíquota × base, sem arredondar a alíquota)`
        : `${formatPercent(result.rate, ratePlaces)} × ${formatBRL(result.base)} = ${formatBRL(result.grossMinimumTax)}`,
      result.grossMinimumTax,
      ["R-16A-14", "R-ARR-01"],
      "Lei 9.250, art. 16-A, §3º, caput",
    ),
  );

  const irpfLabel = {
    INFORMADO: "informado pelo contador",
    ESTIMADO: `ESTIMATIVA: tabela ${result.calendarYear} com desconto simplificado`,
    AUSENTE: "não informado; considerado zero",
  }[result.deductions.irpfSource];
  steps.push(
    brlStep(
      "deducao-i",
      "(−) I. IRPF devido no ajuste anual",
      `${formatBRL(result.deductions.irpfAdjustment)} (${irpfLabel})`,
      result.deductions.irpfAdjustment,
      ["R-16A-15", "R-16A-22"],
      "Lei 9.250, art. 16-A, §3º, I",
    ),
  );

  const taxChildren = (regime: "EXCLUSIVA" | "LEI_14754" | "DEFINITIVA") =>
    ruleSet.incomeTypes
      .map((definition) => {
        const ofType = lines.filter(
          (line) =>
            line.inBase && line.definition.code === definition.code && definition.regime === regime,
        );
        const tax = sum(ofType.map((line) => line.tax));
        if (tax.isZero()) return null;
        const estimated = sum(ofType.map((line) => line.taxEstimated));
        return brlStep(
          `ir-${definition.code}`,
          definition.label,
          estimated.greaterThan(0)
            ? `${formatBRL(tax)} (dos quais ${formatBRL(estimated)} ESTIMADOS)`
            : formatBRL(tax),
          tax,
          estimated.greaterThan(0) ? ["R-16A-16", "R-16A-23"] : ["R-16A-16"],
          "Lei 9.250, art. 16-A, §3º",
        );
      })
      .filter((step): step is TrailStep => step !== null);

  steps.push(
    brlStep(
      "deducao-ii",
      "(−) II. IR retido exclusivamente na fonte (rendimentos da base)",
      formatBRL(result.deductions.exclusiveWithholding),
      result.deductions.exclusiveWithholding,
      ["R-16A-16"],
      "Lei 9.250, art. 16-A, §3º, II",
      taxChildren("EXCLUSIVA"),
    ),
  );
  steps.push(
    brlStep(
      "deducao-iii",
      "(−) III. IR da Lei 14.754/2023 (exterior)",
      formatBRL(result.deductions.law14754),
      result.deductions.law14754,
      ["R-16A-17"],
      "Lei 9.250, art. 16-A, §3º, III",
      taxChildren("LEI_14754"),
    ),
  );
  steps.push(
    brlStep(
      "deducao-iv",
      "(−) IV. IR pago definitivamente (rendimentos da base)",
      formatBRL(result.deductions.definitive),
      result.deductions.definitive,
      ["R-16A-16"],
      "Lei 9.250, art. 16-A, §3º, IV",
      taxChildren("DEFINITIVA"),
    ),
  );

  const reducerChildren = result.reducerByPayer.map((entry) => {
    const formula =
      entry.status === "CALCULADO" && entry.pjEffectiveRate !== null
        ? `${formatBRL(entry.dividends)} × máx(0; ${formatPercent(entry.pjEffectiveRate)} + ${formatPercent(entry.irpfmEffectiveRate)} − ${formatPercent(entry.limit)}) = ${formatBRL(entry.value)}`
        : entry.status === "SEM_ALIQUOTA_PJ"
          ? `Alíquota efetiva da empresa não informada → redutor zero`
          : `IRPFM bruto zero → redutor não se aplica`;
    return brlStep(
      `redutor-${entry.payerCode}`,
      `Empresa ${entry.payerCode} (limite ${formatPercent(entry.limit, 0)})`,
      formula,
      entry.value,
      ["R-16B-01", "R-16B-02", "R-16B-03"],
      "Lei 9.250, art. 16-B, §§1º a 3º",
    );
  });
  steps.push(
    brlStep(
      "deducao-v",
      "(−) V. Redutor (art. 16-B)",
      result.reducerByPayer.length === 0
        ? "Sem lucros e dividendos na base"
        : `Alíquota efetiva do IRPFM = ${STRATEGY_LABEL[result.reducerStrategyUsed]}${result.choices.reducerStrategy === "MIN_OF_ALL" ? " (modo conservador: menor redutor)" : ""}`,
      result.deductions.reducer,
      ["R-16A-18", "R-16B-04", "R-16B-05", "R-16B-06"],
      "Lei 9.250, art. 16-B",
      reducerChildren,
    ),
  );

  const d = result.deductions;
  steps.push(
    brlStep(
      "irpfm-devido",
      "IRPFM devido",
      `máx(0; ${formatBRL(result.grossMinimumTax)} − ${formatBRL(d.irpfAdjustment)} − ${formatBRL(d.exclusiveWithholding)} − ${formatBRL(d.law14754)} − ${formatBRL(d.definitive)} − ${formatBRL(d.reducer)}) = ${formatBRL(result.minimumTaxDue)}`,
      result.minimumTaxDue,
      ["R-16A-19"],
      "Lei 9.250, art. 16-A, §§3º e 4º",
    ),
  );

  const withholdingChildren = result.withholding.entries
    .filter((entry) => entry.subjectAmount.greaterThan(0) || entry.transitionAmount.greaterThan(0))
    .map((entry) => {
      const parts: string[] = [];
      if (entry.withheld.greaterThan(0)) {
        parts.push(
          `${formatPercent(monthlyWithholding.rate, 0)} × ${formatBRL(entry.subjectAmount)} = ${formatBRL(entry.withheld)}`,
        );
      } else if (entry.subjectAmount.greaterThan(monthlyWithholding.threshold)) {
        parts.push(`${formatBRL(entry.subjectAmount)}: Simples Nacional sem retenção (opção)`);
      } else if (entry.subjectAmount.greaterThan(0)) {
        parts.push(
          `${formatBRL(entry.subjectAmount)} ≤ ${formatBRL(monthlyWithholding.threshold)} → sem retenção`,
        );
      }
      if (entry.transitionAmount.greaterThan(0)) {
        parts.push(`${formatBRL(entry.transitionAmount)} da transição, fora do cálculo`);
      }
      const ruleIds = ["R-6A-01", "R-6A-03", "R-6A-05"];
      if (entry.transitionAmount.greaterThan(0)) ruleIds.push("R-6A-06", "R-6A-07");
      if (entry.simplesNacional) ruleIds.push("R-6A-08");
      return brlStep(
        `retencao-${entry.payerCode}-${entry.month}`,
        `Empresa ${entry.payerCode}, ${monthName(entry.month)}`,
        parts.join("; "),
        entry.withheld,
        ruleIds,
        "Lei 9.250, art. 6º-A",
      );
    });
  steps.push(
    brlStep(
      "retencao",
      "(−) IRRF antecipado sobre dividendos (art. 6º-A)",
      formatBRL(result.withholding.total),
      result.withholding.total,
      ["R-6A-01", "R-6A-10", "R-16A-20"],
      "Lei 9.250, art. 16-A, §5º",
      withholdingChildren,
    ),
  );

  const balanceLabel = result.finalBalance.isNegative()
    ? "a restituir"
    : result.finalBalance.isZero()
      ? "sem saldo"
      : "a pagar";
  steps.push(
    brlStep(
      "saldo",
      "Saldo do IRPFM na declaração",
      `${formatBRL(result.minimumTaxDue)} − ${formatBRL(result.withholding.total)} = ${formatBRL(result.finalBalance)} (${balanceLabel})`,
      result.finalBalance,
      ["R-16A-20", "R-16A-21"],
      "Lei 9.250, art. 16-A, §§5º e 6º",
    ),
  );

  steps.push({
    id: "carga-efetiva",
    label: "Carga efetiva total sobre os rendimentos",
    formula: `(IRPF ${formatBRL(d.irpfAdjustment)} + IR das linhas ${formatBRL(result.totalTaxes.minus(d.irpfAdjustment).minus(result.minimumTaxDue))} + IRPFM ${formatBRL(result.minimumTaxDue)}) ÷ ${formatBRL(result.totalIncome)} = ${formatPercent(result.effectiveTaxRate, 2)}`,
    value: result.effectiveTaxRate,
    unit: "RATE",
    ruleIds: [],
    legalRef: "Indicador do produto (não é regra legal)",
  });

  return steps;
}
