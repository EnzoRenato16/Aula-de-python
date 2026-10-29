import { describe, expect, it } from "vitest";
import { calculateClient } from "./calculate.ts";
import type { ClientInput } from "./types.ts";

const mixed: ClientInput = {
  clientCode: "C-TRAIL",
  irpfAdjustmentDue: "120000.00",
  payers: [
    { code: "HOLDING-1", effectiveRate: "0.29" },
    { code: "CLINICA", simplesNacional: true },
  ],
  incomes: [
    { type: "SALARIO", amount: "420000.00" },
    { type: "DIVIDENDOS", amount: "80000.00", month: 3, payerCode: "HOLDING-1" },
    { type: "DIVIDENDOS", amount: "70000.00", month: 6, payerCode: "CLINICA" },
    { type: "DIVIDENDOS", amount: "300000.00", month: 1, payerCode: "HOLDING-1", transition: true },
    { type: "RENDA_FIXA", amount: "90000.00" },
    { type: "LCI", amount: "60000.00" },
  ],
};

describe("trilha de cálculo", () => {
  const result = calculateClient(mixed);

  it("tem os passos na ordem da lei", () => {
    expect(result.trail.map((step) => step.id)).toEqual([
      "rendimentos-totais",
      "exclusoes",
      "base",
      "sujeicao",
      "aliquota",
      "irpfm-bruto",
      "deducao-i",
      "deducao-ii",
      "deducao-iii",
      "deducao-iv",
      "deducao-v",
      "irpfm-devido",
      "retencao",
      "saldo",
      "carga-efetiva",
    ]);
  });

  it("todo passo cita fonte legal e, se for regra, um ID de REGRAS.md", () => {
    for (const step of result.trail) {
      expect(step.legalRef.length, step.id).toBeGreaterThan(0);
      if (step.id !== "carga-efetiva") expect(step.ruleIds.length, step.id).toBeGreaterThan(0);
    }
  });

  it("mostra a fórmula com os números reais em pt-BR", () => {
    const base = result.trail.find((step) => step.id === "base");
    expect(base?.formula).toBe("R$ 1.020.000,00 − R$ 360.000,00 = R$ 660.000,00");
    const rate = result.trail.find((step) => step.id === "aliquota");
    expect(rate?.formula).toBe("R$ 660.000,00 ÷ 60.000 − 10 = 1,0000%");
    const withholding = result.trail.find((step) => step.id === "retencao");
    expect(withholding?.children?.map((child) => child.formula)).toEqual([
      "10% × R$ 70.000,00 = R$ 7.000,00",
      "R$ 300.000,00 da transição, fora do cálculo",
      "10% × R$ 80.000,00 = R$ 8.000,00",
    ]);
  });

  it("marca IR estimado como ESTIMADO", () => {
    const ii = result.trail.find((step) => step.id === "deducao-ii");
    expect(ii?.children?.[0]?.formula).toContain("ESTIMADOS");
  });
});

describe("alertas", () => {
  const codes = (input: ClientInput) => calculateClient(input).alerts.map((alert) => alert.code);

  it("faixa de transição, retenção, restituição, Simples e regra pendente", () => {
    expect(codes(mixed)).toEqual(
      expect.arrayContaining([
        "FAIXA_TRANSICAO",
        "RETENCAO_MENSAL",
        "IRRF_RESTITUIVEL",
        "DIVIDENDOS_TRANSICAO",
        "SIMPLES_NACIONAL_RETENCAO",
        "REGRA_PENDENTE",
      ]),
    );
  });

  it("perto do limiar de R$ 600 mil", () => {
    expect(
      codes({
        clientCode: "C",
        irpfAdjustmentDue: "0",
        incomes: [{ type: "SALARIO", amount: "560000" }],
      }),
    ).toContain("PROXIMO_DO_LIMIAR");
  });

  it("IRPFM a pagar é crítico", () => {
    const result = calculateClient({
      clientCode: "C",
      irpfAdjustmentDue: "0",
      incomes: [{ type: "GANHO_BOLSA_ISENTO", amount: "1500000" }],
    });
    const alert = result.alerts.find((candidate) => candidate.code === "IRPFM_A_PAGAR");
    expect(alert?.severity).toBe("critico");
    expect(alert?.message).toContain("R$ 150.000,00");
  });
});

describe("alíquota marginal efetiva (+R$ 1.000)", () => {
  it("na faixa de transição, sem imposto já pago, dividendo tem marginal acima de 10%", () => {
    const result = calculateClient({
      clientCode: "C",
      irpfAdjustmentDue: "0",
      incomes: [{ type: "DIVIDENDOS", amount: "900000", month: 5, payerCode: "PJ" }],
    });
    const dividends = result.marginalRates.find((rate) => rate.type === "DIVIDENDOS");
    // d/dbase (base²/6.000.000 − 0,1·base) em 900 mil = 20%
    expect(dividends?.rate.toDecimalPlaces(3).toString()).toBe("0.2");
    const lci = result.marginalRates.find((rate) => rate.type === "LCI");
    expect(lci?.rate.isZero()).toBe(true);
  });

  it("renda fixa: IR próprio de 15% absorve o IRPFM marginal quando ele é menor", () => {
    const result = calculateClient({
      clientCode: "C",
      irpfAdjustmentDue: "0",
      incomes: [{ type: "RENDA_FIXA", amount: "2000000", taxWithheld: "300000" }],
    });
    const fixedIncome = result.marginalRates.find((rate) => rate.type === "RENDA_FIXA");
    // IR 15% + IRPFM marginal 10% − 15% (dedução) → max(0, …) = devido segue zero → 15%
    expect(fixedIncome?.rate.toString()).toBe("0.15");
  });
});

describe("alíquota marginal: tipos com IR próprio desconhecido", () => {
  it("não mostra 13º, PLR nem ganho de capital (o IR deles depende de tabela)", () => {
    const result = calculateClient({
      clientCode: "C",
      irpfAdjustmentDue: "0",
      incomes: [
        { type: "DECIMO_TERCEIRO", amount: "50000", taxWithheld: "12000" },
        { type: "PLR", amount: "100000", taxWithheld: "24000" },
        { type: "GANHO_CAPITAL", amount: "300000", taxWithheld: "45000" },
      ],
    });
    const types = result.marginalRates.map((rate) => rate.type);
    expect(types).not.toContain("DECIMO_TERCEIRO");
    expect(types).not.toContain("PLR");
    expect(types).not.toContain("GANHO_CAPITAL");
    expect(types).toContain("SALARIO");
  });
});
