import { describe, expect, it } from "vitest";
import { formatBRL, formatNumber, formatPercent } from "./format.ts";
import { money } from "./money.ts";

describe("format (pt-BR)", () => {
  it("formats money", () => {
    expect(formatBRL(money("1234567.891"))).toBe("R$ 1.234.567,89");
    expect(formatBRL(money("0"))).toBe("R$ 0,00");
    expect(formatBRL(money("-50000"))).toBe("R$ −50.000,00");
  });

  it("formats percentages from fractions", () => {
    expect(formatPercent(money("0.05"))).toBe("5,0000%");
    expect(formatPercent(money("0.0166666666"), 2)).toBe("1,67%");
  });

  it("formats plain numbers", () => {
    expect(formatNumber(money("60000"))).toBe("60.000");
  });
});
