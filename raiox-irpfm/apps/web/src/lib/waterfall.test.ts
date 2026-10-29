import { calculateClient, D, serializeResult } from "@raiox/engine";
import { generateClients } from "@raiox/seed";
import { describe, expect, it } from "vitest";
import { waterfallSteps } from "./waterfall.ts";

const seedResults = [1, 2, 3].flatMap((seed) =>
  generateClients({ clients: 300, seed }).map((client) => serializeResult(calculateClient(client))),
);

describe("waterfallSteps", () => {
  it("fecha ao centavo com o IRPFM devido e o saldo do motor", () => {
    for (const result of seedResults) {
      const steps = waterfallSteps(result);
      if (steps.length === 0) {
        expect(result.grossMinimumTax).toBe("0.00");
        expect(result.withholding.total).toBe("0.00");
        continue;
      }
      const due = steps.find((step) => step.key === "irpfm-devido");
      expect(due?.to).toBe(result.minimumTaxDue);
      expect(steps.at(-1)?.to).toBe(result.finalBalance);

      // Each deduction starts where the previous bar ended.
      steps.forEach((step, index) => {
        if (step.kind !== "deduction") return;
        expect(step.from).toBe(steps[index - 1]?.to);
        if (step.key !== "retencao") expect(new D(step.to).isNegative()).toBe(false);
      });
      // The deductions take the gross tax exactly to the IRPFM due.
      const dueIndex = steps.findIndex((step) => step.key === "irpfm-devido");
      if (dueIndex > 0) expect(steps[dueIndex - 1]?.to).toBe(result.minimumTaxDue);
    }
  });

  it("mostra o valor cheio da dedução mesmo quando ela só absorve parte do IRPFM bruto", () => {
    const result = serializeResult(
      calculateClient({
        clientCode: "T-1",
        irpfAdjustmentDue: "500000.00",
        incomes: [{ type: "SALARIO", amount: "1500000.00" }],
      }),
    );
    const steps = waterfallSteps(result);
    const irpf = steps.find((step) => step.key === "deducao-i");
    expect(irpf).toMatchObject({ amount: "500000.00", from: "150000.00", to: "0.00" });
    expect(steps.map((step) => step.key)).toEqual([
      "irpfm-bruto",
      "deducao-i",
      "irpfm-devido",
      "saldo",
    ]);
    expect(steps.at(-1)).toMatchObject({ label: "Saldo: zero", to: "0.00" });
  });

  it("leva a retenção até a restituição quando não há IRPFM", () => {
    const result = serializeResult(
      calculateClient({
        clientCode: "T-2",
        irpfAdjustmentDue: "0.00",
        incomes: [{ type: "DIVIDENDOS", amount: "100000.00", month: 3, payerCode: "E1" }],
      }),
    );
    const steps = waterfallSteps(result);
    expect(steps.map((step) => [step.key, step.from, step.to])).toEqual([
      ["irpfm-devido", "0.00", "0.00"],
      ["retencao", "0.00", "-10000.00"],
      ["saldo", "0.00", "-10000.00"],
    ]);
    expect(steps.at(-1)?.label).toBe("Saldo: a restituir");
    expect(steps.every((step) => step.ruleIds.length > 0)).toBe(true);
  });

  it("não desenha nada quando não há IRPFM nem retenção", () => {
    const result = serializeResult(
      calculateClient({ clientCode: "T-3", incomes: [{ type: "SALARIO", amount: "120000.00" }] }),
    );
    expect(waterfallSteps(result)).toEqual([]);
  });
});
