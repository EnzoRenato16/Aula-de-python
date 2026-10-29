/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { type ClientInput, calculateClient } from "@raiox/engine";
import { describe, expect, it } from "vitest";
import { DISCLAIMER } from "./ClientReport.tsx";
import { renderClientReport } from "./render.tsx";
import { summarySentences } from "./summary.ts";

const client: ClientInput = {
  clientCode: "CLI-PDF",
  nickname: "Dr. R.",
  advisorCode: "ASS-01",
  irpfAdjustmentDue: "120000.00",
  payers: [{ code: "HOLDING-1", effectiveRate: "0.29" }],
  incomes: [
    { type: "SALARIO", amount: "420000.00" },
    { type: "DIVIDENDOS", amount: "380000.00", month: 3, payerCode: "HOLDING-1" },
    { type: "RENDA_FIXA", amount: "90000.00" },
    { type: "LCI", amount: "60000.00" },
  ],
};

describe("PDF do cliente", () => {
  it("gera um PDF de uma página", async () => {
    const pdf = await renderClientReport(calculateClient(client), {
      brand: { officeName: "Escritório Teste" },
      generatedAt: new Date(2026, 9, 29),
    });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
  });

  it("o resumo fala em simulação e nunca em recomendação", () => {
    const sentences = summarySentences(calculateClient(client)).join(" ");
    expect(sentences).toContain("simulação");
    expect(sentences.toLowerCase()).not.toContain("recomend");
    expect(DISCLAIMER).toContain("Não é recomendação de investimento nem consultoria tributária");
    expect(DISCLAIMER).toContain("contador");
  });
});
