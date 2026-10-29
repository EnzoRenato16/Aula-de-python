import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULES_2026 } from "./rules/2026.ts";
import { INCOME_TYPE_CODES } from "./rules/types.ts";

const doc = readFileSync(new URL("../../../docs/REGRAS.md", import.meta.url), "utf8");
const docRuleIds = new Set(
  [...doc.matchAll(/^\| (R-[A-Z0-9§-]+) \|/gm)].map((match) => match[1] as string),
);

describe("docs/REGRAS.md ↔ rules/2026.ts", () => {
  it("todo ID de regra do código está documentado", () => {
    const missing = RULES_2026.rules.map((rule) => rule.id).filter((id) => !docRuleIds.has(id));
    expect(missing).toEqual([]);
  });

  it("todo ID documentado existe no código", () => {
    const codeIds = new Set(RULES_2026.rules.map((rule) => rule.id));
    expect([...docRuleIds].filter((id) => !codeIds.has(id))).toEqual([]);
  });

  it("o status de cada regra é o mesmo no documento e no código", () => {
    for (const rule of RULES_2026.rules) {
      const row = doc.split("\n").find((line) => line.startsWith(`| ${rule.id} |`));
      expect(row, rule.id).toBeDefined();
      expect(
        row?.trim().endsWith(`| ${rule.status} |`) || row?.includes(`| ${rule.status}`),
        rule.id,
      ).toBe(true);
    }
  });

  it("toda regra PENDENTE explica padrão/conservador", () => {
    const withoutNote = RULES_2026.rules
      .filter((rule) => rule.status === "PENDENTE" && !rule.pendingNote)
      .map((rule) => rule.id);
    expect(withoutNote).toEqual([]);
  });

  it("todo tipo de rendimento do catálogo aparece no documento e vice-versa", () => {
    const catalog = RULES_2026.incomeTypes.map((type) => type.code);
    expect([...catalog].sort()).toEqual([...INCOME_TYPE_CODES].sort());
    const undocumented = catalog.filter((code) => !doc.includes(`\`${code}\``));
    expect(undocumented).toEqual([]);
  });

  it("todo ruleId referenciado no catálogo existe", () => {
    const ids = new Set(RULES_2026.rules.map((rule) => rule.id));
    const refs = RULES_2026.incomeTypes.flatMap((type) =>
      "ruleId" in type.base ? [type.base.ruleId] : [],
    );
    expect(refs.filter((id) => !ids.has(id))).toEqual([]);
  });
});
