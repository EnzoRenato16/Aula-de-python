import { type Dec, roundMoney, sum, ZERO } from "./money.ts";
import { type NormalizedClient, payerOf } from "./normalize.ts";
import type { RuleSet } from "./rules/types.ts";
import type { PendingChoices, WithholdingEntry } from "./types.ts";

/**
 * Monthly withholding on dividends (art. 6º-A; R-6A-01..08).
 * Grouped by (payer, month); transition dividends do not count (R-6A-06/07).
 */
export function computeWithholding(
  client: NormalizedClient,
  ruleSet: RuleSet,
  choices: PendingChoices,
  pending: Set<string>,
): { total: Dec; entries: WithholdingEntry[] } {
  const groups = new Map<
    string,
    { payerCode: string; month: number; subject: Dec; transition: Dec }
  >();
  for (const line of client.lines) {
    if (line.definition.code !== "DIVIDENDOS" || line.payerCode === null || line.month === null) {
      continue;
    }
    const key = `${line.payerCode}\u0000${String(line.month).padStart(2, "0")}`;
    const group = groups.get(key) ?? {
      payerCode: line.payerCode,
      month: line.month,
      subject: ZERO,
      transition: ZERO,
    };
    if (line.transition) group.transition = group.transition.plus(line.amount);
    else group.subject = group.subject.plus(line.amount);
    groups.set(key, group);
  }

  const { threshold, rate } = ruleSet.monthlyWithholding;
  const entries = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]): WithholdingEntry => {
      const payer = payerOf(client, group.payerCode);
      const aboveThreshold = group.subject.greaterThan(threshold);
      if (group.subject.greaterThan(0) && group.transition.greaterThan(0)) pending.add("R-6A-07");
      if (payer.simplesNacional && aboveThreshold) pending.add("R-6A-08");
      const exempted = payer.simplesNacional && !choices.simplesNacionalWithholding;
      const withheld = aboveThreshold && !exempted ? roundMoney(group.subject.times(rate)) : ZERO;
      if (!withheld.equals(group.subject.times(rate)) && withheld.greaterThan(0)) {
        pending.add("R-ARR-01");
      }
      return {
        payerCode: group.payerCode,
        month: group.month,
        subjectAmount: group.subject,
        transitionAmount: group.transition,
        withheld,
        simplesNacional: payer.simplesNacional,
      };
    });

  return { total: sum(entries.map((entry) => entry.withheld)), entries };
}
