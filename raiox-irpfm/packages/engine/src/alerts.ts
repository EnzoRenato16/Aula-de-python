import type { EvaluatedLine } from "./calculate.ts";
import { formatBRL, formatPercent } from "./format.ts";
import { grossMinimumTaxDerivative } from "./minimum-tax.ts";
import { D, sum } from "./money.ts";
import type { RuleSet } from "./rules/types.ts";
import type { Alert, ClientResult } from "./types.ts";

/** "Near the threshold" window: within 10% below the minimum-tax threshold. */
const NEAR_THRESHOLD_FACTOR = new D("0.9");

function uniqueLabels(lines: readonly EvaluatedLine[]): string {
  return [...new Set(lines.map((line) => line.definition.label))].join(", ");
}

export function buildAlerts(
  result: ClientResult,
  lines: readonly EvaluatedLine[],
  ruleSet: RuleSet,
): Alert[] {
  const alerts: Alert[] = [];
  const { threshold, fullRateFrom } = ruleSet.minimumTax;
  const relevant = result.grossMinimumTax.greaterThan(0);

  if (result.base.greaterThan(threshold) && result.base.lessThan(fullRateFrom)) {
    const marginal = grossMinimumTaxDerivative(result.base, ruleSet);
    alerts.push({
      code: "FAIXA_TRANSICAO",
      severity: "atencao",
      message: `Base de ${formatBRL(result.base)} na faixa de transição (${formatBRL(threshold)} a ${formatBRL(fullRateFrom)}): alíquota de ${formatPercent(result.rate, 2)} e alíquota marginal de ${formatPercent(marginal, 1)} sobre cada real a mais na base (antes das deduções).`,
      ruleIds: ["R-16A-11"],
    });
  } else if (
    result.base.lessThanOrEqualTo(threshold) &&
    result.base.greaterThanOrEqualTo(threshold.times(NEAR_THRESHOLD_FACTOR))
  ) {
    alerts.push({
      code: "PROXIMO_DO_LIMIAR",
      severity: "info",
      message: `Base de ${formatBRL(result.base)}, a ${formatBRL(threshold.minus(result.base))} do início da tributação mínima.`,
      ruleIds: ["R-16A-10"],
    });
  }

  if (result.amountToPay.greaterThan(0)) {
    alerts.push({
      code: "IRPFM_A_PAGAR",
      severity: "critico",
      message: `IRPFM a pagar na declaração de ${result.calendarYear + 1}: ${formatBRL(result.amountToPay)}.`,
      ruleIds: ["R-16A-19", "R-16A-21"],
    });
  }

  const withheldEntries = result.withholding.entries.filter((entry) =>
    entry.withheld.greaterThan(0),
  );
  if (withheldEntries.length > 0) {
    const months = new Set(withheldEntries.map((entry) => entry.month)).size;
    alerts.push({
      code: "RETENCAO_MENSAL",
      severity: "atencao",
      message: `Retenção de 10% sobre dividendos em ${months} mês(es): ${formatBRL(result.withholding.total)} antecipados no ano.`,
      ruleIds: ["R-6A-01"],
    });
  }

  if (result.amountToRefund.greaterThan(0)) {
    alerts.push({
      code: "IRRF_RESTITUIVEL",
      severity: "info",
      message: `${formatBRL(result.amountToRefund)} da retenção sobre dividendos voltam na restituição do ajuste de ${result.calendarYear + 1}.`,
      ruleIds: ["R-6A-10", "R-16A-20"],
    });
  }

  if (relevant && result.deductions.irpfSource === "ESTIMADO") {
    alerts.push({
      code: "IRPF_AJUSTE_ESTIMADO",
      severity: "atencao",
      message: `IRPF do ajuste não informado: usamos a ESTIMATIVA de ${formatBRL(result.deductions.irpfAdjustment)} (desconto simplificado). Peça o valor ao contador.`,
      ruleIds: ["R-16A-22"],
    });
  }
  if (relevant && result.deductions.irpfSource === "AUSENTE") {
    alerts.push({
      code: "IRPF_AJUSTE_AUSENTE",
      severity: "critico",
      message:
        "IRPF do ajuste não informado e considerado zero: o IRPFM pode estar superestimado. Peça o valor ao contador.",
      ruleIds: ["R-16A-15"],
    });
  }

  const estimated = lines.filter((line) => line.taxEstimated.greaterThan(0) && line.inBase);
  if (relevant && estimated.length > 0) {
    alerts.push({
      code: "IR_LINHA_ESTIMADO",
      severity: "info",
      message: `IR estimado pela alíquota mínima do regime (${formatBRL(sum(estimated.map((line) => line.taxEstimated)))}) em: ${uniqueLabels(estimated)}.`,
      ruleIds: ["R-16A-23"],
    });
  }
  const missing = lines.filter((line) => line.taxMissing && line.inBase);
  if (relevant && missing.length > 0) {
    alerts.push({
      code: "IR_LINHA_AUSENTE",
      severity: "atencao",
      message: `IR não informado (considerado zero) em: ${uniqueLabels(missing)}. Informar o IR retido reduz o IRPFM.`,
      ruleIds: ["R-16A-16"],
    });
  }

  const withoutPjRate = result.reducerByPayer.filter((entry) => entry.status === "SEM_ALIQUOTA_PJ");
  if (withoutPjRate.length > 0 && result.minimumTaxDue.greaterThan(0)) {
    alerts.push({
      code: "ALIQUOTA_PJ_AUSENTE",
      severity: "atencao",
      message: `Sem alíquota efetiva informada para ${withoutPjRate.map((entry) => entry.payerCode).join(", ")}: redutor considerado zero. Com o dado, o IRPFM pode cair.`,
      ruleIds: ["R-16B-03"],
    });
  }

  const transition = sum(result.withholding.entries.map((entry) => entry.transitionAmount));
  if (transition.greaterThan(0)) {
    alerts.push({
      code: "DIVIDENDOS_TRANSICAO",
      severity: "info",
      message: `${formatBRL(transition)} em dividendos marcados como regra de transição (fora da retenção e da base). Confirme com o contador a data de aprovação e o cronograma de pagamento.`,
      ruleIds: ["R-6A-06", "R-16A-EX-XII", "R-6A-11"],
    });
  }

  const simples = withheldEntries.filter((entry) => entry.simplesNacional);
  if (simples.length > 0) {
    alerts.push({
      code: "SIMPLES_NACIONAL_RETENCAO",
      severity: "info",
      message: `Retenção sobre dividendos de empresa do Simples Nacional (${formatBRL(sum(simples.map((entry) => entry.withheld)))}), conforme entendimento da Receita; tema controverso.`,
      ruleIds: ["R-6A-08"],
    });
  }

  if (result.pendingRulesUsed.length > 0) {
    alerts.push({
      code: "REGRA_PENDENTE",
      severity: "info",
      message: `Cálculo usa regra(s) com interpretação PENDENTE: ${result.pendingRulesUsed.join(", ")}. Veja a tela Premissas.`,
      ruleIds: [...result.pendingRulesUsed],
    });
  }

  return alerts;
}
