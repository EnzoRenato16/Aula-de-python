import { ScenarioError } from "@raiox/engine";
import { writeClientsWorkbook } from "@raiox/io";
import { describe, expect, it } from "vitest";
import type { ScenarioForm } from "../../lib/scenario-form.ts";
import { ForbiddenError, NotFoundError, type OrgContext } from "../context.ts";
import { addMember, createOrganization, db } from "../test/fixtures.ts";
import { recalculate } from "./calculation.ts";
import { getClientDetail } from "./client-detail.ts";
import { confirmImport, previewImport } from "./imports.ts";
import {
  deleteScenario,
  listScenarios,
  saveScenario,
  simulateForm,
  toOperations,
} from "./scenarios.ts";

async function seedClient(owner: OrgContext) {
  const bytes = await writeClientsWorkbook(
    [
      {
        clientCode: "SOCIO-1",
        advisorCode: "ASS-1",
        irpfAdjustmentDue: "0.00",
        incomes: [
          { type: "DIVIDENDOS", amount: "400000.00", month: 3, payerCode: "EMP-A" },
          { type: "DIVIDENDOS", amount: "250000.00", month: 9, payerCode: "EMP-A" },
        ],
        payers: [{ code: "EMP-A", effectiveRate: "0.34", limitCategory: "GERAL" }],
        positions: [
          { assetClass: "RENDA_FIXA", balance: "1000000.00", expectedAnnualRate: "0.12" },
        ],
      },
      {
        clientCode: "OUTRO-2",
        advisorCode: "ASS-2",
        incomes: [{ type: "SALARIO", amount: "300000.00" }],
      },
    ],
    { includeGuide: false },
  );
  const batchId = await previewImport(db, owner, { name: "base.xlsx", bytes });
  await confirmImport(db, owner, batchId, { mode: "MERGE", acceptErrors: false });
  await recalculate(db, owner);
}

const capAtThreshold: ScenarioForm = {
  name: "Até o limite mensal",
  operations: [{ kind: "RESCHEDULE_DIVIDENDS", payerCode: "EMP-A", schedule: "CAP_AT_THRESHOLD" }],
};

describe("formulário de cenário", () => {
  it("converte valores digitados em pt-BR com os mesmos parsers da importação", () => {
    expect(
      toOperations([
        {
          kind: "MOVE_ALLOCATION",
          fromClass: "RENDA_FIXA",
          toClass: "LCI",
          amount: "R$ 1.500,50",
          toAnnualRate: "11%",
          fromAnnualRate: "",
          toTaxRate: "0,15",
        },
        { kind: "ADJUST_DIVIDENDS", payerCode: "EMP-A", direction: "RETAIN", amount: "100.000" },
        {
          kind: "ADJUST_DIVIDENDS",
          payerCode: "EMP-A",
          direction: "DISTRIBUTE",
          amount: "1.000,00",
        },
      ]),
    ).toEqual([
      {
        kind: "MOVE_ALLOCATION",
        fromClass: "RENDA_FIXA",
        toClass: "LCI",
        amount: "1500.50",
        toAnnualRate: "0.11",
        toTaxRate: "0.15",
      },
      { kind: "ADJUST_DIVIDENDS", payerCode: "EMP-A", delta: "-100000.00" },
      { kind: "ADJUST_DIVIDENDS", payerCode: "EMP-A", delta: "1000.00" },
    ]);
  });

  it("aponta a operação e o campo com valor inválido", () => {
    expect(() =>
      toOperations([
        { kind: "ADJUST_DIVIDENDS", payerCode: "EMP-A", direction: "RETAIN", amount: "1.000,00" },
        {
          kind: "MOVE_ALLOCATION",
          fromClass: "RENDA_FIXA",
          toClass: "LCI",
          amount: "-5",
          toAnnualRate: "10%",
          fromAnnualRate: "",
          toTaxRate: "",
        },
      ]),
    ).toThrow(/Operação 2: valor movido/);
  });
});

describe("cenários salvos", () => {
  it("simula, salva, lista e exclui com as premissas do escritório", async () => {
    const owner = await createOrganization();
    await seedClient(owner);
    const view = await simulateForm(db, owner, "SOCIO-1", capAtThreshold);
    expect(view.base.withholding).toBe("65000.00");
    expect(view.scenario.withholding).toBe("10000.00");

    const detail = await getClientDetail(db, owner, "SOCIO-1");
    const id = await saveScenario(db, owner, "SOCIO-1", capAtThreshold);
    const [saved] = await listScenarios(db, owner, detail.id);
    expect(saved).toMatchObject({ id, name: "Até o limite mensal", mine: true });
    expect(saved?.netIncomeDelta).toBe(view.delta.netIncome);
    expect(saved?.operations).toEqual(capAtThreshold.operations);

    await deleteScenario(db, owner, id);
    expect(await listScenarios(db, owner, detail.id)).toEqual([]);
  });

  it("recusa nome de cenário com dado pessoal (LGPD)", async () => {
    const owner = await createOrganization();
    await seedClient(owner);
    await expect(
      saveScenario(db, owner, "SOCIO-1", { ...capAtThreshold, name: "CPF 529.982.247-25" }),
    ).rejects.toThrow(ScenarioError);
  });

  it("assessor salva cenário do próprio cliente, não de outro, e só exclui o que é dele", async () => {
    const owner = await createOrganization();
    await seedClient(owner);
    const advisor = await addMember(owner, "member", "ASS-1");
    const otherAdvisor = await addMember(owner, "member", "ASS-1");

    const id = await saveScenario(db, advisor, "SOCIO-1", capAtThreshold);
    await expect(
      saveScenario(db, advisor, "OUTRO-2", { name: "", operations: capAtThreshold.operations }),
    ).rejects.toThrow(NotFoundError);
    await expect(deleteScenario(db, otherAdvisor, id)).rejects.toThrow(ForbiddenError);
    await deleteScenario(db, owner, id);
  });

  it("um escritório não vê nem exclui cenários de outro", async () => {
    const a = await createOrganization("A");
    const b = await createOrganization("B");
    await seedClient(a);
    const id = await saveScenario(db, a, "SOCIO-1", capAtThreshold);
    const detail = await getClientDetail(db, a, "SOCIO-1");
    expect(await listScenarios(db, b, detail.id)).toEqual([]);
    await expect(deleteScenario(db, b, id)).rejects.toThrow(NotFoundError);
    await expect(getClientDetail(db, b, "SOCIO-1")).rejects.toThrow(NotFoundError);
  });
});

describe("ficha do cliente", () => {
  it("calcula com as premissas atuais e traz a posição no ranking", async () => {
    const owner = await createOrganization();
    await seedClient(owner);
    const detail = await getClientDetail(db, owner, "SOCIO-1");
    expect(detail.result?.withholding.total.toFixed(2)).toBe("65000.00");
    expect(detail.ranking).toMatchObject({ of: 2 });
    expect(detail.calculationError).toBeNull();

    const advisor = await addMember(owner, "member", "ASS-2");
    await expect(getClientDetail(db, advisor, "SOCIO-1")).rejects.toThrow(NotFoundError);
  });
});
