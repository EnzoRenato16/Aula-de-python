import { type ClientResult, formatBRL, formatPercent, getRuleSet } from "@raiox/engine";

/**
 * Deterministic summary of a result, in pt-BR. It is the fixed template the
 * AI message falls back to when any number in a generated text fails the
 * check against the result (golden rule 4). Uses "simulação", never
 * "recomendação".
 */
export function summarySentences(result: ClientResult): string[] {
  const sentences: string[] = [];
  const { threshold } = getRuleSet(result.calendarYear).minimumTax;
  const declaration = result.calendarYear + 1;
  if (!result.subjectToMinimumTax) {
    sentences.push(
      `Nesta simulação, os rendimentos do ano somam ${formatBRL(result.totalIncome)}, abaixo do limite de ${formatBRL(threshold)}: não há tributação mínima (IRPFM).`,
    );
  } else if (result.grossMinimumTax.isZero()) {
    sentences.push(
      `Nesta simulação, a base do IRPFM é de ${formatBRL(result.base)}; com as exclusões legais, ela fica abaixo de ${formatBRL(threshold)} e a alíquota é zero.`,
    );
  } else if (result.minimumTaxDue.isZero()) {
    sentences.push(
      `Nesta simulação, o IRPFM bruto de ${formatBRL(result.grossMinimumTax)} (alíquota de ${formatPercent(result.rate, 2)} sobre a base de ${formatBRL(result.base)}) é totalmente coberto pelo imposto já devido ou pago: não há IRPFM adicional.`,
    );
  } else {
    sentences.push(
      `Nesta simulação, a base do IRPFM é de ${formatBRL(result.base)}, com alíquota de ${formatPercent(result.rate, 2)}. Depois das deduções, o IRPFM devido é de ${formatBRL(result.minimumTaxDue)}.`,
    );
  }

  if (result.withholding.total.greaterThan(0)) {
    sentences.push(
      `A retenção de 10% sobre dividendos soma ${formatBRL(result.withholding.total)} no ano e é antecipação do imposto.`,
    );
  }
  if (result.amountToPay.greaterThan(0)) {
    sentences.push(
      `Saldo do IRPFM na declaração de ${declaration}: ${formatBRL(result.amountToPay)} a pagar.`,
    );
  } else if (result.amountToRefund.greaterThan(0)) {
    sentences.push(
      `Saldo do IRPFM na declaração de ${declaration}: ${formatBRL(result.amountToRefund)} a restituir.`,
    );
  }
  return sentences;
}
