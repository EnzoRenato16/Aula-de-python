import { RULES_2026 } from "./2026.ts";
import type { IncomeTypeCode, IncomeTypeDefinition, RuleDefinition, RuleSet } from "./types.ts";

export * from "./types.ts";
export { RULES_2026 };

/** Calendar year of the first IRPFM (exercício 2027). */
export const DEFAULT_CALENDAR_YEAR = 2026;

const RULE_SETS: Record<number, RuleSet> = {
  2026: RULES_2026,
};

export const SUPPORTED_YEARS: readonly number[] = Object.keys(RULE_SETS).map((year) =>
  Number.parseInt(year, 10),
);

export function getRuleSet(calendarYear: number): RuleSet {
  const ruleSet = RULE_SETS[calendarYear];
  if (!ruleSet) {
    throw new Error(
      `Ano-calendário ${calendarYear} sem regras cadastradas. Anos suportados: ${SUPPORTED_YEARS.join(", ")}.`,
    );
  }
  return ruleSet;
}

export function findIncomeType(ruleSet: RuleSet, code: IncomeTypeCode): IncomeTypeDefinition {
  const definition = ruleSet.incomeTypes.find((type) => type.code === code);
  if (!definition) throw new Error(`Tipo de rendimento desconhecido: ${code}`);
  return definition;
}

export function findRule(ruleSet: RuleSet, id: string): RuleDefinition {
  const rule = ruleSet.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`Regra desconhecida: ${id}`);
  return rule;
}
