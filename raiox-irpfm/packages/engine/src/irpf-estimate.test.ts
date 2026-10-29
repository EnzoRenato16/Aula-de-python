import { describe, expect, it } from "vitest";
import { estimateIrpfAdjustment } from "./irpf-estimate.ts";
import { money, toMoneyString } from "./money.ts";
import { RULES_2026 } from "./rules/2026.ts";

const estimate = (value: string) => toMoneyString(estimateIrpfAdjustment(money(value), RULES_2026));

describe("estimativa do IRPF do ajuste (tabela 2026, desconto simplificado)", () => {
  it("zera até R$ 60 mil por causa da redução do art. 11-A", () => {
    // (60.000 − 12.000) × 22,5% − 8.105,85 = 2.694,15 → redução de até 2.694,15 → zero
    expect(estimate("60000.00")).toBe("0.00");
    expect(estimate("30000.00")).toBe("0.00");
  });

  it("aplica a redução decrescente entre R$ 60 mil e R$ 88,2 mil", () => {
    // 80.000: base 64.000 → 27,5% − 10.904,66 = 6.695,34; redução 8.429,73 − 0,095575 × 80.000 = 783,73
    expect(estimate("80000.00")).toBe("5911.61");
  });

  it("sem redução acima de R$ 88,2 mil e com desconto limitado a R$ 17.640", () => {
    // (1.000.000 − 17.640) × 27,5% − 10.904,66 = 259.244,34
    expect(estimate("1000000.00")).toBe("259244.34");
  });

  it("zero sem rendimento tributável", () => {
    expect(estimate("0")).toBe("0.00");
  });
});
