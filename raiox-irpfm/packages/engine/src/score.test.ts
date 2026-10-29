import { describe, expect, it } from "vitest";
import { calculateClient } from "./calculate.ts";
import { sum } from "./money.ts";
import { DEFAULT_SCORE_CONFIG, opportunityScore, rankClients } from "./score.ts";
import type { ClientInput } from "./types.ts";

const calc = (input: ClientInput) => calculateClient(input, { skipMarginal: true });

describe("score de oportunidade", () => {
  it("pesos somam 1", () => {
    expect(sum(Object.values(DEFAULT_SCORE_CONFIG.weights)).toString()).toBe("1");
  });

  it("cliente sem impacto tem score zero", () => {
    const result = calc({
      clientCode: "C-0",
      irpfAdjustmentDue: "10000",
      incomes: [{ type: "SALARIO", amount: "100000" }],
    });
    expect(opportunityScore(result).score.toString()).toBe("0");
  });

  it("IRPFM alto a pagar domina o score e fica entre 0 e 100", () => {
    const result = calc({
      clientCode: "C-1",
      irpfAdjustmentDue: "0",
      incomes: [{ type: "SALARIO", amount: "2000000" }],
    });
    const { score, components } = opportunityScore(result);
    expect(score.greaterThan(0) && score.lessThanOrEqualTo(100)).toBe(true);
    expect(components.find((c) => c.key === "irpfmToPay")?.value.toString()).toBe("1");
  });

  it("ranking ordena por score, depois IRPFM a pagar, depois código", () => {
    const results = [
      calc({
        clientCode: "B",
        irpfAdjustmentDue: "0",
        incomes: [{ type: "SALARIO", amount: "100000" }],
      }),
      calc({
        clientCode: "A",
        irpfAdjustmentDue: "0",
        incomes: [{ type: "SALARIO", amount: "100000" }],
      }),
      calc({
        clientCode: "C",
        irpfAdjustmentDue: "0",
        incomes: [{ type: "SALARIO", amount: "1500000" }],
      }),
    ];
    expect(rankClients(results).map((entry) => entry.result.clientCode)).toEqual(["C", "A", "B"]);
    expect(rankClients(results).map((entry) => entry.position)).toEqual([1, 2, 3]);
  });
});
