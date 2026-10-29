import { type ClientResult, D, type Dec, type Serialized } from "@raiox/engine";

export type WaterfallKind = "total" | "deduction" | "balance";

export interface WaterfallStep {
  key: string;
  label: string;
  kind: WaterfallKind;
  /** Amount of the item as calculated. A deduction can exceed what is left to absorb. */
  amount: string;
  /** Running value before and after the step (canonical decimal strings). */
  from: string;
  to: string;
  ruleIds: string[];
}

const ZERO = new D(0);

/**
 * Steps from the gross IRPFM to the balance of the declaration, read from a
 * serialized result. It only re-arranges amounts the engine already computed:
 * each deduction absorbs at most what is left of the gross tax (§4º: the
 * IRPFM due is never negative), so the bars always add up to the IRPFM due,
 * and the withholding then takes it to the final balance.
 */
export function waterfallSteps(result: Serialized<ClientResult>): WaterfallStep[] {
  const gross = new D(result.grossMinimumTax);
  const withholding = new D(result.withholding.total);
  if (gross.isZero() && withholding.isZero()) return [];

  // Rule IDs come from the trail step with the same id, so they never drift.
  const rulesOf = (id: string) => result.trail.find((step) => step.id === id)?.ruleIds ?? [];
  const d = result.deductions;
  const deductions: [string, string, string][] = [
    ["deducao-i", "(−) IRPF do ajuste", d.irpfAdjustment],
    ["deducao-ii", "(−) IR exclusivo na fonte", d.exclusiveWithholding],
    ["deducao-iii", "(−) IR da Lei 14.754", d.law14754],
    ["deducao-iv", "(−) IR definitivo", d.definitive],
    ["deducao-v", "(−) Redutor (art. 16-B)", d.reducer],
  ];

  const steps: WaterfallStep[] = [];
  const push = (step: Omit<WaterfallStep, "from" | "to">, from: Dec, to: Dec) =>
    steps.push({ ...step, from: from.toFixed(2), to: to.toFixed(2) });

  if (gross.greaterThan(0)) {
    push(
      {
        key: "irpfm-bruto",
        label: "IRPFM bruto",
        kind: "total",
        amount: gross.toFixed(2),
        ruleIds: rulesOf("irpfm-bruto"),
      },
      ZERO,
      gross,
    );
    let running = gross;
    for (const [key, label, value] of deductions) {
      const amount = new D(value);
      if (amount.isZero()) continue;
      const absorbed = amount.lessThan(running) ? amount : running;
      push(
        { key, label, kind: "deduction", amount: amount.toFixed(2), ruleIds: rulesOf(key) },
        running,
        running.minus(absorbed),
      );
      running = running.minus(absorbed);
    }
  }

  const due = new D(result.minimumTaxDue);
  push(
    {
      key: "irpfm-devido",
      label: "IRPFM devido",
      kind: "total",
      amount: due.toFixed(2),
      ruleIds: rulesOf("irpfm-devido"),
    },
    ZERO,
    due,
  );
  if (withholding.greaterThan(0)) {
    push(
      {
        key: "retencao",
        label: "(−) Retenção sobre dividendos",
        kind: "deduction",
        amount: withholding.toFixed(2),
        ruleIds: rulesOf("retencao"),
      },
      due,
      due.minus(withholding),
    );
  }
  const balance = new D(result.finalBalance);
  push(
    {
      key: "saldo",
      label: balance.isNegative()
        ? "Saldo: a restituir"
        : balance.isZero()
          ? "Saldo: zero"
          : "Saldo: a pagar",
      kind: "balance",
      amount: balance.abs().toFixed(2),
      ruleIds: rulesOf("saldo"),
    },
    ZERO,
    balance,
  );
  return steps;
}
