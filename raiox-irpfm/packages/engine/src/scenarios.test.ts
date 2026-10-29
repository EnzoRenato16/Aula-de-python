import { describe, expect, it } from "vitest";
import { compareScenario, ScenarioError } from "./scenarios.ts";
import type { ClientInput } from "./types.ts";

const brl = (value: { toFixed: (n: number) => string }) => value.toFixed(2);

const investor: ClientInput = {
  clientCode: "C-SCN",
  irpfAdjustmentDue: "0",
  incomes: [
    { type: "SALARIO", amount: "500000.00" },
    // R$ 2 mi em CDB a 12% a.a. → R$ 240 mil de rendimento, IR 15% informado
    { type: "RENDA_FIXA", amount: "240000.00", taxWithheld: "36000.00" },
  ],
  positions: [
    { assetClass: "RENDA_FIXA", balance: "2000000.00", expectedAnnualRate: "0.12" },
    { assetClass: "LCI", balance: "0.00", expectedAnnualRate: "0.10" },
  ],
};

describe("cenários", () => {
  it("mover renda fixa para LCI: compara pelo rendimento líquido, não só pelo imposto", () => {
    const comparison = compareScenario(investor, {
      name: "CDB → LCI",
      operations: [
        {
          kind: "MOVE_ALLOCATION",
          fromClass: "RENDA_FIXA",
          toClass: "LCI",
          amount: "1000000.00",
          toAnnualRate: "0.10",
        },
      ],
    });
    // Base: 740.000 → alíquota 2,333…% → bruto 17.266,67; dedução II 36.000 → IRPFM 0.
    expect(brl(comparison.base.minimumTaxDue)).toBe("0.00");
    expect(brl(comparison.base.netIncome)).toBe("704000.00");
    // Cenário: CDB rende 120.000 (IR 18.000) e LCI rende 100.000 (isenta, fora da base).
    expect(brl(comparison.scenario.totalIncome)).toBe("720000.00");
    expect(brl(comparison.scenario.totalTaxes)).toBe("18000.00");
    expect(brl(comparison.scenario.netIncome)).toBe("702000.00");
    // O imposto cai R$ 18 mil, mas o líquido cai R$ 2 mil: o cenário não compensa.
    expect(brl(comparison.delta.totalTaxes)).toBe("-18000.00");
    expect(brl(comparison.delta.netIncome)).toBe("-2000.00");
    expect(comparison.notes.join(" ")).toContain("rendimento líquido");
  });

  it("usa a taxa da posição de origem e exige taxa quando não há posição", () => {
    expect(() =>
      compareScenario(
        { ...investor, positions: [] },
        {
          name: "sem taxa",
          operations: [
            {
              kind: "MOVE_ALLOCATION",
              fromClass: "RENDA_FIXA",
              toClass: "LCA",
              amount: "100000.00",
              toAnnualRate: "0.1",
            },
          ],
        },
      ),
    ).toThrow(ScenarioError);
  });

  it("não move mais do que o saldo da posição", () => {
    expect(() =>
      compareScenario(investor, {
        name: "excesso",
        operations: [
          {
            kind: "MOVE_ALLOCATION",
            fromClass: "RENDA_FIXA",
            toClass: "LCI",
            amount: "3000000.00",
            toAnnualRate: "0.1",
          },
        ],
      }),
    ).toThrow(/saldo/);
  });

  const dividendClient: ClientInput = {
    clientCode: "C-DIV",
    irpfAdjustmentDue: "0",
    payers: [{ code: "PJ-A" }],
    incomes: [
      { type: "DIVIDENDOS", amount: "400000.00", month: 3, payerCode: "PJ-A" },
      { type: "DIVIDENDOS", amount: "250000.00", month: 9, payerCode: "PJ-A" },
      { type: "DIVIDENDOS", amount: "100000.00", month: 1, payerCode: "PJ-A", transition: true },
    ],
  };

  it("redistribuir dividendos em até R$ 50 mil por mês reduz a retenção sem mudar o imposto do ano", () => {
    const comparison = compareScenario(dividendClient, {
      name: "limite mensal",
      operations: [
        { kind: "RESCHEDULE_DIVIDENDS", payerCode: "PJ-A", schedule: "CAP_AT_THRESHOLD" },
      ],
    });
    // Base: mar 400.000 (40.000) + set 250.000 (25.000). Cenário: jan–nov 50.000; dez 100.000 (10.000).
    expect(brl(comparison.base.withholding)).toBe("65000.00");
    expect(brl(comparison.scenario.withholding)).toBe("10000.00");
    expect(brl(comparison.delta.netIncome)).toBe("0.00");
    expect(brl(comparison.delta.minimumTaxDue)).toBe("0.00");
    // A linha da transição não é mexida.
    const transition = comparison.scenarioInput.incomes.filter((line) => line.transition === true);
    expect(transition).toHaveLength(1);
  });

  it("distribuição uniforme em 12 meses preserva o total ao centavo", () => {
    const comparison = compareScenario(dividendClient, {
      name: "uniforme",
      operations: [{ kind: "RESCHEDULE_DIVIDENDS", payerCode: "PJ-A", schedule: "EVEN" }],
    });
    const regular = comparison.scenarioInput.incomes.filter(
      (line) => line.type === "DIVIDENDOS" && line.transition !== true,
    );
    expect(regular).toHaveLength(12);
    expect(new Set(regular.map((line) => line.month)).size).toBe(12);
    expect(brl(comparison.scenario.totalIncome)).toBe(brl(comparison.base.totalIncome));
  });

  it("dois movimentos da mesma classe não podem passar do saldo somados", () => {
    const move = {
      kind: "MOVE_ALLOCATION" as const,
      fromClass: "RENDA_FIXA" as const,
      toClass: "LCI" as const,
      amount: "1500000.00",
      toAnnualRate: "0.10",
    };
    expect(() => compareScenario(investor, { name: "duplo", operations: [move, move] })).toThrow(
      /saldo/,
    );
  });

  it("o rendimento da origem cai exatamente o valor do cenário, mesmo com várias linhas", () => {
    const comparison = compareScenario(
      {
        ...investor,
        incomes: [
          { type: "SALARIO", amount: "500000.00" },
          { type: "RENDA_FIXA", amount: "80000.01" },
          { type: "RENDA_FIXA", amount: "80000.01" },
          { type: "RENDA_FIXA", amount: "79999.98" },
        ],
      },
      {
        name: "três linhas",
        operations: [
          {
            kind: "MOVE_ALLOCATION",
            fromClass: "RENDA_FIXA",
            toClass: "LCI",
            amount: "333333.33",
            toAnnualRate: "0.10",
          },
        ],
      },
    );
    const origin = comparison.scenarioInput.incomes
      .filter((line) => line.type === "RENDA_FIXA")
      .reduce((total, line) => total + Math.round(Number(line.amount) * 100), 0);
    // 240.000,00 − 333.333,33 × 12% (40.000,00) = 200.000,00
    expect(origin).toBe(20_000_000);
  });

  it("calendário manual não aceita valores negativos", () => {
    expect(() =>
      compareScenario(dividendClient, {
        name: "negativo",
        operations: [
          {
            kind: "RESCHEDULE_DIVIDENDS",
            payerCode: "PJ-A",
            schedule: [
              { month: 1, amount: "750000.00" },
              { month: 2, amount: "-100000.00" },
            ],
          },
        ],
      }),
    ).toThrow(/negativos/);
  });

  it("calendário manual precisa somar o total da empresa", () => {
    expect(() =>
      compareScenario(dividendClient, {
        name: "manual errado",
        operations: [
          {
            kind: "RESCHEDULE_DIVIDENDS",
            payerCode: "PJ-A",
            schedule: [{ month: 1, amount: "100.00" }],
          },
        ],
      }),
    ).toThrow(/somar/);
  });

  it("reter dividendos na empresa reduz o imposto e o líquido do ano, e informa o valor postergado", () => {
    const comparison = compareScenario(dividendClient, {
      name: "reter",
      operations: [{ kind: "ADJUST_DIVIDENDS", payerCode: "PJ-A", delta: "-100000.00" }],
    });
    expect(brl(comparison.deferredDividends)).toBe("100000.00");
    expect(brl(comparison.delta.totalIncome)).toBe("-100000.00");
    expect(comparison.notes.join(" ")).toContain("postergad");
  });
});
