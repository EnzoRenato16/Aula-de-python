/**
 * Golden tests: exact expected values, derived by hand from the official text
 * (docs/REGRAS.md). The first block is the mandatory list from the briefing.
 */
import { describe, expect, it } from "vitest";
import { calculateClient } from "./calculate.ts";
import { grossMinimumTax, minimumTaxRate } from "./minimum-tax.ts";
import { money, toMoneyString } from "./money.ts";
import { reducerForPayer } from "./reducer.ts";
import { RULES_2026 } from "./rules/2026.ts";
import type { IncomeTypeCode } from "./rules/types.ts";
import type { CalculationOptions, ClientInput, IncomeLineInput, PayerInput } from "./types.ts";

const brl = (value: { toFixed: (n: number) => string }) => value.toFixed(2);

function client(
  incomes: IncomeLineInput[],
  extra: Partial<Omit<ClientInput, "incomes" | "clientCode">> = {},
): ClientInput {
  return { clientCode: "C-TEST", irpfAdjustmentDue: "0", ...extra, incomes };
}

function calc(input: ClientInput, options: CalculationOptions = {}) {
  return calculateClient(input, { skipMarginal: true, ...options });
}

const dividend = (
  amount: string,
  month: number,
  payerCode = "PJ-A",
  transition = false,
): IncomeLineInput => ({ type: "DIVIDENDOS", amount, month, payerCode, transition });

const line = (type: IncomeTypeCode, amount: string, taxWithheld?: string): IncomeLineInput =>
  taxWithheld === undefined ? { type, amount } : { type, amount, taxWithheld };

describe("briefing golden tests", () => {
  it("base R$ 500 mil → IRPFM 0 e retenção 100% restituível", () => {
    const result = calc(client([dividend("500000.00", 3)]));
    expect(brl(result.base)).toBe("500000.00");
    expect(result.rate.isZero()).toBe(true);
    expect(brl(result.minimumTaxDue)).toBe("0.00");
    expect(brl(result.withholding.total)).toBe("50000.00");
    expect(brl(result.finalBalance)).toBe("-50000.00");
    expect(brl(result.amountToRefund)).toBe("50000.00");
    expect(brl(result.amountToPay)).toBe("0.00");
  });

  it("base R$ 600 mil → alíquota 0%", () => {
    expect(minimumTaxRate(money("600000.00"), RULES_2026).isZero()).toBe(true);
    const result = calc(client([line("SALARIO", "600000.00")]));
    expect(result.rate.isZero()).toBe(true);
    expect(brl(result.grossMinimumTax)).toBe("0.00");
  });

  it("base R$ 900 mil → 5% → IRPFM bruto de R$ 45.000", () => {
    expect(minimumTaxRate(money("900000.00"), RULES_2026).toString()).toBe("0.05");
    expect(toMoneyString(grossMinimumTax(money("900000.00"), RULES_2026))).toBe("45000.00");
    const result = calc(client([line("SALARIO", "900000.00")]));
    expect(brl(result.grossMinimumTax)).toBe("45000.00");
    expect(brl(result.minimumTaxDue)).toBe("45000.00");
  });

  it("base R$ 1,2 milhão → 10% → R$ 120.000", () => {
    expect(minimumTaxRate(money("1200000.00"), RULES_2026).toString()).toBe("0.1");
    expect(toMoneyString(grossMinimumTax(money("1200000.00"), RULES_2026))).toBe("120000.00");
  });

  it("base R$ 2 milhões → R$ 200.000", () => {
    expect(toMoneyString(grossMinimumTax(money("2000000.00"), RULES_2026))).toBe("200000.00");
    const result = calc(client([line("SALARIO", "2000000.00")]));
    expect(brl(result.minimumTaxDue)).toBe("200000.00");
  });

  it("R$ 60.000 de uma PJ no mês → retenção de R$ 6.000", () => {
    const result = calc(client([dividend("60000.00", 5)]));
    expect(brl(result.withholding.total)).toBe("6000.00");
    expect(result.withholding.entries).toHaveLength(1);
    expect(brl(result.withholding.entries[0]?.withheld ?? money("0"))).toBe("6000.00");
  });

  it("exatamente R$ 50.000 no mês → sem retenção", () => {
    const result = calc(client([dividend("50000.00", 5)]));
    expect(brl(result.withholding.total)).toBe("0.00");
  });

  it("duas PJs pagando R$ 40.000 cada no mesmo mês → sem retenção", () => {
    const result = calc(client([dividend("40000.00", 7, "PJ-A"), dividend("40000.00", 7, "PJ-B")]));
    expect(brl(result.withholding.total)).toBe("0.00");
  });

  it("dividendos da regra de transição → fora da base e sem retenção", () => {
    const result = calc(client([dividend("2000000.00", 2, "PJ-A", true)]));
    expect(brl(result.totalIncome)).toBe("2000000.00");
    expect(brl(result.base)).toBe("0.00");
    expect(brl(result.withholding.total)).toBe("0.00");
    expect(brl(result.minimumTaxDue)).toBe("0.00");
  });

  it("redutor: R$ 1.000.000 × (32% + 6,66% − 34%) = R$ 46.600", () => {
    const value = reducerForPayer({
      dividends: money("1000000.00"),
      pjEffectiveRate: money("0.32"),
      irpfmEffectiveRate: money("0.0666"),
      limit: money("0.34"),
    });
    expect(toMoneyString(value)).toBe("46600.00");
  });
});

describe("retenção mensal (art. 6º-A)", () => {
  it("incide sobre o total, não sobre o excedente (R$ 50.000,01 → R$ 5.000,00)", () => {
    const result = calc(client([dividend("50000.01", 1)]));
    expect(brl(result.withholding.total)).toBe("5000.00");
  });

  it("soma vários pagamentos da mesma PJ no mesmo mês (§2º)", () => {
    const result = calc(client([dividend("30000.00", 4), dividend("25000.00", 4)]));
    expect(brl(result.withholding.total)).toBe("5500.00");
  });

  it("não soma meses diferentes", () => {
    const result = calc(client([dividend("30000.00", 4), dividend("25000.00", 5)]));
    expect(brl(result.withholding.total)).toBe("0.00");
  });

  it("lucros da transição não contam para o limite do mês (R-6A-07)", () => {
    const result = calc(
      client([dividend("40000.00", 6, "PJ-A", true), dividend("30000.00", 6, "PJ-A")]),
    );
    expect(brl(result.withholding.total)).toBe("0.00");
    expect(result.pendingRulesUsed).toContain("R-6A-07");
  });

  it("Simples Nacional: retém por padrão (posição da Receita) e não retém se a opção for desligada", () => {
    const payers: PayerInput[] = [{ code: "PJ-S", simplesNacional: true }];
    const input = client([dividend("60000.00", 3, "PJ-S")], { payers });
    expect(brl(calc(input).withholding.total)).toBe("6000.00");
    const off = calc(input, { choices: { simplesNacionalWithholding: false } });
    expect(brl(off.withholding.total)).toBe("0.00");
    expect(brl(off.base)).toBe("60000.00");
  });

  it("12 meses de R$ 100 mil: retém R$ 120 mil, que quitam o IRPFM de R$ 120 mil", () => {
    const lines = Array.from({ length: 12 }, (_, index) => dividend("100000.00", index + 1));
    const result = calc(client(lines));
    expect(brl(result.withholding.total)).toBe("120000.00");
    expect(brl(result.minimumTaxDue)).toBe("120000.00");
    expect(brl(result.finalBalance)).toBe("0.00");
  });
});

describe("base de cálculo (art. 16-A §1º)", () => {
  const excludedTypes: IncomeTypeCode[] = [
    "GANHO_CAPITAL",
    "RRA_EXCLUSIVO",
    "DOACAO_HERANCA",
    "POUPANCA",
    "LH",
    "LCI",
    "CRI",
    "LIG",
    "LCD",
    "DEBENTURE_INCENTIVADA",
    "FUNDO_INFRA",
    "FIP_IE",
    "FII_ISENTO",
    "FIAGRO_ISENTO",
    "LCA",
    "CRA",
    "CDCA",
    "CDA_WA",
    "CPR",
    "RURAL_ISENTA",
    "INDENIZACAO",
    "MOLESTIA_GRAVE",
    "TVM_ISENTO_OUTROS",
  ];

  it.each(excludedTypes)("%s fica fora da base", (type) => {
    const result = calc(client([line(type, "1000000.00")]));
    expect(brl(result.base)).toBe("0.00");
    expect(brl(result.totalIncome)).toBe("1000000.00");
    expect(brl(result.minimumTaxDue)).toBe("0.00");
  });

  const includedTypes: IncomeTypeCode[] = [
    "SALARIO",
    "ALUGUEL",
    "APOSENTADORIA",
    "ATIVIDADE_RURAL",
    "OUTROS_TRIBUTAVEIS",
    "DECIMO_TERCEIRO",
    "PLR",
    "JCP",
    "RENDA_FIXA",
    "FUNDOS",
    "PREVIDENCIA",
    "FII_TRIBUTADO",
    "OUTROS_EXCLUSIVOS",
    "GANHO_BOLSA",
    "EXTERIOR_14754",
    "GANHO_BOLSA_ISENTO",
    "OUTROS_ISENTOS",
  ];

  it.each(includedTypes)("%s entra na base", (type) => {
    const result = calc(client([line(type, "1000000.00", "0")]));
    expect(brl(result.base)).toBe("1000000.00");
  });

  it("todo tipo do catálogo está classificado em um dos testes acima", () => {
    const tested = new Set<string>([
      ...excludedTypes,
      ...includedTypes,
      "DIVIDENDOS",
      "REPASSE_CARTORIO",
    ]);
    const untested = RULES_2026.incomeTypes.map((t) => t.code).filter((c) => !tested.has(c));
    expect(untested).toEqual([]);
  });

  it("ganho isento em ações entra por padrão e sai se a opção for desligada (R-16A-06)", () => {
    const input = client([line("GANHO_BOLSA_ISENTO", "1000000.00")]);
    const on = calc(input);
    expect(brl(on.grossMinimumTax)).toBe("66666.67");
    expect(on.pendingRulesUsed).toContain("R-16A-06");
    const off = calc(input, { choices: { exemptStockGainsInBase: false } });
    expect(brl(off.base)).toBe("0.00");
  });

  it("repasses de cartório são subtraídos da base (§7º)", () => {
    const result = calc(
      client([line("OUTROS_TRIBUTAVEIS", "1500000.00"), line("REPASSE_CARTORIO", "300000.00")]),
    );
    expect(brl(result.base)).toBe("1200000.00");
    expect(brl(result.totalIncome)).toBe("1500000.00");
    expect(brl(result.grossMinimumTax)).toBe("120000.00");
  });

  it("sujeição pelo total bruto não altera valores: R$ 700 mil com R$ 300 mil de LCI → IRPFM 0", () => {
    const result = calc(client([line("SALARIO", "400000.00"), line("LCI", "300000.00")]));
    expect(result.subjectToMinimumTax).toBe(true);
    expect(result.rate.isZero()).toBe(true);
    expect(brl(result.minimumTaxDue)).toBe("0.00");
  });
});

describe("alíquota e IRPFM bruto (§§2º e 3º)", () => {
  it("alíquota não é arredondada; o valor em reais é (R$ 700 mil → R$ 11.666,67)", () => {
    const rate = minimumTaxRate(money("700000.00"), RULES_2026);
    expect(rate.toSignificantDigits(12).toString()).toBe("0.0166666666667");
    expect(toMoneyString(grossMinimumTax(money("700000.00"), RULES_2026))).toBe("11666.67");
  });

  it("é contínua em R$ 1,2 milhão (R$ 1.199.999,99 → R$ 119.999,997 → R$ 120.000,00)", () => {
    const below = grossMinimumTax(money("1199999.99"), RULES_2026);
    expect(below.toDecimalPlaces(3).toString()).toBe("119999.997");
    expect(toMoneyString(below)).toBe("120000.00");
  });

  it("logo acima de R$ 600 mil a alíquota é positiva e pequena", () => {
    const rate = minimumTaxRate(money("600060.00"), RULES_2026);
    expect(rate.toString()).toBe("0.00001");
  });
});

describe("deduções e saldo (§§3º a 6º)", () => {
  it("IR exclusivo de linha incluída abate o IRPFM", () => {
    const result = calc(client([line("RENDA_FIXA", "1200000.00", "180000.00")]));
    expect(brl(result.deductions.exclusiveWithholding)).toBe("180000.00");
    expect(brl(result.minimumTaxDue)).toBe("0.00");
  });

  it("IR de rendimento excluído (ganho de capital) não abate", () => {
    const result = calc(
      client([line("SALARIO", "1000000.00"), line("GANHO_CAPITAL", "1000000.00", "150000.00")]),
    );
    expect(brl(result.base)).toBe("1000000.00");
    expect(brl(result.deductions.definitive)).toBe("0.00");
    expect(brl(result.minimumTaxDue)).toBe("66666.67");
  });

  it("IR definitivo de bolsa abate (IV) e IR da Lei 14.754 abate (III)", () => {
    const result = calc(
      client([
        line("GANHO_BOLSA", "600000.00", "90000.00"),
        line("EXTERIOR_14754", "600000.00", "90000.00"),
      ]),
    );
    expect(brl(result.grossMinimumTax)).toBe("120000.00");
    expect(brl(result.deductions.definitive)).toBe("90000.00");
    expect(brl(result.deductions.law14754)).toBe("90000.00");
    expect(brl(result.minimumTaxDue)).toBe("0.00");
  });

  it("deduções I a V nunca geram restituição; só a retenção de dividendos gera (§§4º e 5º)", () => {
    const result = calc(
      client([line("SALARIO", "1400000.00"), dividend("600000.00", 1)], {
        irpfAdjustmentDue: "380000.00",
      }),
    );
    expect(brl(result.grossMinimumTax)).toBe("200000.00");
    expect(brl(result.minimumTaxDue)).toBe("0.00");
    expect(brl(result.finalBalance)).toBe("-60000.00");
    expect(brl(result.amountToRefund)).toBe("60000.00");
  });
});

describe("redutor (art. 16-B)", () => {
  const payers: PayerInput[] = [{ code: "PJ-A", effectiveRate: "0.34" }];

  it("PJ a 34% com IRPFM de 10% sobre os dividendos: redutor zera o IRPFM", () => {
    const result = calc(client([dividend("1200000.00", 12)], { payers }));
    expect(brl(result.grossMinimumTax)).toBe("120000.00");
    expect(result.reducerByPayer[0]?.irpfmEffectiveRate.toString()).toBe("0.1");
    expect(brl(result.deductions.reducer)).toBe("120000.00");
    expect(brl(result.minimumTaxDue)).toBe("0.00");
  });

  it("sem alíquota efetiva da PJ: redutor zero e alerta", () => {
    const result = calc(client([dividend("1200000.00", 12)]));
    expect(brl(result.deductions.reducer)).toBe("0.00");
    expect(result.reducerByPayer[0]?.status).toBe("SEM_ALIQUOTA_PJ");
    expect(result.alerts.map((a) => a.code)).toContain("ALIQUOTA_PJ_AUSENTE");
  });

  it("limites por categoria: banco 45%", () => {
    const value = reducerForPayer({
      dividends: money("1000000.00"),
      pjEffectiveRate: money("0.40"),
      irpfmEffectiveRate: money("0.10"),
      limit: RULES_2026.reducer.limits.BANCO,
    });
    expect(toMoneyString(value)).toBe("50000.00");
  });

  it("nunca é negativo", () => {
    const value = reducerForPayer({
      dividends: money("1000000.00"),
      pjEffectiveRate: money("0.10"),
      irpfmEffectiveRate: money("0.10"),
      limit: money("0.34"),
    });
    expect(toMoneyString(value)).toBe("0.00");
  });

  describe("estratégias da alíquota efetiva do IRPFM (R-16B-04)", () => {
    // Salário R$ 600 mil (IRPF devido R$ 100 mil) + dividendos R$ 600 mil de PJ a 30%.
    // Base R$ 1,2 mi → bruto R$ 120 mil; antes do redutor, devido = R$ 20 mil.
    const input = client([line("SALARIO", "600000.00"), dividend("600000.00", 6)], {
      irpfAdjustmentDue: "100000.00",
      payers: [{ code: "PJ-A", effectiveRate: "0.30" }],
    });

    it("INCREMENTAL_NET: acréscimo de R$ 20 mil ÷ R$ 600 mil = 3,33% → redutor 0 → devido R$ 20 mil", () => {
      const result = calc(input, { choices: { reducerStrategy: "INCREMENTAL_NET" } });
      expect(result.reducerByPayer[0]?.irpfmEffectiveRate.toSignificantDigits(6).toString()).toBe(
        "0.0333333",
      );
      expect(brl(result.deductions.reducer)).toBe("0.00");
      expect(brl(result.minimumTaxDue)).toBe("20000.00");
    });

    it("INCREMENTAL_GROSS: acréscimo bruto de R$ 120 mil ÷ R$ 600 mil = 20% → redutor R$ 96 mil", () => {
      const result = calc(input, { choices: { reducerStrategy: "INCREMENTAL_GROSS" } });
      expect(brl(result.deductions.reducer)).toBe("96000.00");
      expect(brl(result.minimumTaxDue)).toBe("0.00");
    });

    it("NOMINAL_RATE: alíquota de 10% → redutor R$ 36 mil", () => {
      const result = calc(input, { choices: { reducerStrategy: "NOMINAL_RATE" } });
      expect(brl(result.deductions.reducer)).toBe("36000.00");
      expect(brl(result.minimumTaxDue)).toBe("0.00");
    });

    it("modo conservador usa o menor redutor (aqui, INCREMENTAL_NET)", () => {
      const result = calc(input, { conservative: true });
      expect(brl(result.deductions.reducer)).toBe("0.00");
      expect(brl(result.minimumTaxDue)).toBe("20000.00");
      expect(result.pendingRulesUsed).toContain("R-16B-04");
    });
  });

  it("dividendos da transição ficam fora do redutor (R-16B-06)", () => {
    const result = calc(
      client([dividend("1200000.00", 1, "PJ-A"), dividend("500000.00", 1, "PJ-B", true)], {
        payers: [
          { code: "PJ-A", effectiveRate: "0.34" },
          { code: "PJ-B", effectiveRate: "0.34" },
        ],
      }),
    );
    expect(result.reducerByPayer.map((r) => r.payerCode)).toEqual(["PJ-A"]);
  });
});

describe("IRPF do ajuste (dedução I)", () => {
  it("estima com a tabela 2026 e desconto simplificado quando ausente", () => {
    const result = calc(client([line("SALARIO", "1000000.00")], { irpfAdjustmentDue: null }));
    // (1.000.000 − 17.640) × 27,5% − 10.904,66 = 259.244,34
    expect(result.deductions.irpfSource).toBe("ESTIMADO");
    expect(brl(result.deductions.irpfAdjustment)).toBe("259244.34");
    expect(brl(result.minimumTaxDue)).toBe("0.00");
    expect(result.alerts.map((a) => a.code)).toContain("IRPF_AJUSTE_ESTIMADO");
  });

  it("modo conservador trata IRPF ausente como zero", () => {
    const result = calc(client([line("SALARIO", "1000000.00")], { irpfAdjustmentDue: null }), {
      conservative: true,
    });
    expect(result.deductions.irpfSource).toBe("AUSENTE");
    expect(brl(result.minimumTaxDue)).toBe("66666.67");
    expect(result.alerts.map((a) => a.code)).toContain("IRPF_AJUSTE_AUSENTE");
  });

  it("IR de linha ausente é estimado pela alíquota mínima do regime (CDB 15%)", () => {
    const result = calc(client([line("RENDA_FIXA", "1200000.00")]));
    expect(brl(result.deductions.exclusiveWithholding)).toBe("180000.00");
    expect(result.alerts.map((a) => a.code)).toContain("IR_LINHA_ESTIMADO");
  });
});

describe("resultado: carga efetiva e líquido", () => {
  it("retenção é antecipação, não custo: carga = IRPF + IR das linhas + IRPFM devido", () => {
    const lines = Array.from({ length: 12 }, (_, index) => dividend("100000.00", index + 1));
    const result = calc(client([...lines, line("RENDA_FIXA", "200000.00", "30000.00")]));
    // base 1,4 mi → bruto 140.000; dedução II 30.000 → devido 110.000
    expect(brl(result.minimumTaxDue)).toBe("110000.00");
    expect(brl(result.totalTaxes)).toBe("140000.00");
    expect(brl(result.netIncome)).toBe("1260000.00");
    expect(result.effectiveTaxRate.toString()).toBe("0.1");
  });
});
