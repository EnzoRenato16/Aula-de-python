import { DEFAULT_CALENDAR_YEAR, getRuleSet } from "@raiox/engine";
import type { Logger } from "../util.ts";

/** Prints the rules of the year with legal source and status (the "Premissas" screen, in text). */
export function regras(options: { ano?: string; pendentes?: boolean }, log: Logger): number {
  const ruleSet = getRuleSet(
    options.ano ? Number.parseInt(options.ano, 10) : DEFAULT_CALENDAR_YEAR,
  );
  log.info(`Regras do ano-calendário ${ruleSet.calendarYear} (versão ${ruleSet.version})`);
  log.blank();
  for (const rule of ruleSet.rules) {
    if (options.pendentes && rule.status !== "PENDENTE") continue;
    log.info(`${rule.id.padEnd(15)} ${rule.status.padEnd(10)} ${rule.title}`);
    log.detail(rule.legalRef);
    if (rule.pendingNote) log.detail(`→ ${rule.pendingNote}`);
  }
  return 0;
}
