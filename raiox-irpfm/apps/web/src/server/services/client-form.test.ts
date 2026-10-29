import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { ClientForm } from "../../lib/client-form.ts";
import { ForbiddenError } from "../context.ts";
import { auditLog, incomeLine } from "../db/schema.ts";
import { addMember, createOrganization, db } from "../test/fixtures.ts";
import { getClientResult } from "./calculation.ts";
import { clientFormValues, saveClientForm, validateClientForm } from "./client-form.ts";

const empty: ClientForm = {
  code: "",
  nickname: "",
  advisorCode: "",
  irpfAdjustmentDue: "",
  incomes: [],
  companies: [],
  positions: [],
};

const partner: ClientForm = {
  ...empty,
  code: "socio-7",
  nickname: "Cliente Pinheiros",
  advisorCode: "ass-1",
  irpfAdjustmentDue: "12.345,67",
  incomes: [
    {
      type: "DIVIDENDOS",
      amount: "400.000,00",
      month: "3",
      payerCode: "emp-a",
      taxWithheld: "",
      transition: false,
    },
    {
      type: "RENDA_FIXA",
      amount: "50000",
      month: "",
      payerCode: "",
      taxWithheld: "7.500,00",
      transition: false,
    },
  ],
  companies: [
    { code: "EMP-A", effectiveRate: "34%", limitCategory: "GERAL", simplesNacional: false },
  ],
  positions: [
    { assetClass: "RENDA_FIXA", balance: "1.000.000,00", expectedAnnualRate: "12%", taxRate: "" },
  ],
};

describe("validação do formulário pelo importador", () => {
  it("aponta cada erro no campo do formulário", () => {
    const validated = validateClientForm(
      {
        ...empty,
        code: "A-1",
        nickname: "Maria Souza",
        incomes: [
          {
            type: "SALARIO",
            amount: "abc",
            month: "",
            payerCode: "",
            taxWithheld: "",
            transition: false,
          },
          {
            type: "DIVIDENDOS",
            amount: "1000",
            month: "",
            payerCode: "E1",
            taxWithheld: "",
            transition: false,
          },
        ],
        companies: [
          { code: "E1", effectiveRate: "250%", limitCategory: "GERAL", simplesNacional: false },
        ],
      },
      2026,
    );
    expect(validated.input).toBeNull();
    expect(validated.fieldErrors["incomes.0.amount"]).toMatch(/^Valor inválido/);
    expect(validated.fieldErrors["incomes.1.month"]).toMatch(/^Mês é obrigatório/);
    expect(validated.fieldErrors["companies.0.effectiveRate"]).toMatch(/^Taxa acima de 100%/);
    expect(validated.warnings).toContain(
      "apelido parece um nome completo; prefira um apelido que não identifique a pessoa",
    );
  });

  it("recusa CPF no código e mostra o erro uma vez, no campo do código", () => {
    const line = {
      type: "SALARIO" as const,
      amount: "100",
      month: "",
      payerCode: "",
      taxWithheld: "",
      transition: false,
    };
    const validated = validateClientForm(
      { ...empty, code: "529.982.247-25", incomes: [line, line, line] },
      2026,
    );
    expect(validated.fieldErrors).toEqual({ code: expect.stringMatching(/^Parece CPF/) });
    expect(validated.formErrors).toEqual([]);
  });

  it("avisa sem bloquear quando o IR informado já está no ajuste (D-014)", () => {
    const validated = validateClientForm(
      {
        ...empty,
        code: "A",
        incomes: [
          {
            type: "SALARIO",
            amount: "100000",
            month: "",
            payerCode: "",
            taxWithheld: "20000",
            transition: false,
          },
        ],
      },
      2026,
    );
    expect(validated.input?.incomes).toEqual([{ type: "SALARIO", amount: "100000.00" }]);
    expect(validated.warnings[0]).toMatch(/^Rendimento 1: valor ignorado/);
  });
});

describe("cadastro manual", () => {
  it("cria, recalcula, audita e devolve os mesmos valores para edição", async () => {
    const owner = await createOrganization();
    const outcome = await saveClientForm(db, owner, partner, null);
    expect(outcome).toEqual({ saved: true, code: "SOCIO-7", warnings: [] });

    const result = await getClientResult(db, owner, "SOCIO-7");
    expect(result.withholding.total).toBe("40000.00");
    expect(result.advisorCode).toBe("ASS-1");
    const lines = await db.select().from(incomeLine).where(eq(incomeLine.orgId, owner.orgId));
    expect(lines.every((line) => line.source === "MANUAL")).toBe(true);
    const actions = (await db.select().from(auditLog).where(eq(auditLog.orgId, owner.orgId))).map(
      (entry) => entry.action,
    );
    expect(actions).toContain("client.create");
    expect(actions).toContain("calculation.run");

    const values = await clientFormValues(db, owner, "SOCIO-7");
    expect(values).toEqual({
      ...partner,
      code: "SOCIO-7",
      advisorCode: "ASS-1",
      incomes: [
        { ...partner.incomes[0], amount: "400000,00", payerCode: "EMP-A" },
        { ...partner.incomes[1], amount: "50000,00", taxWithheld: "7500,00" },
      ],
      irpfAdjustmentDue: "12345,67",
      positions: [{ ...partner.positions[0], balance: "1000000,00" }],
    });
    // Saving the prefilled form again changes nothing.
    expect(await saveClientForm(db, owner, values, "SOCIO-7")).toMatchObject({ saved: true });
    expect((await getClientResult(db, owner, "SOCIO-7")).finalBalance).toBe(result.finalBalance);
  });

  it("não cria código repetido nem troca o código na edição", async () => {
    const owner = await createOrganization();
    await saveClientForm(db, owner, partner, null);
    expect(await saveClientForm(db, owner, partner, null)).toEqual({
      saved: false,
      fieldErrors: { code: "Já existe um cliente com o código SOCIO-7." },
      formErrors: [],
    });
    expect(await saveClientForm(db, owner, { ...partner, code: "OUTRO" }, "SOCIO-7")).toMatchObject(
      { saved: false, fieldErrors: { code: expect.stringMatching(/não pode ser alterado/) } },
    );
  });

  it("reaproveita a empresa já cadastrada quando o formulário não a repete", async () => {
    const owner = await createOrganization();
    await saveClientForm(db, owner, partner, null);
    const outcome = await saveClientForm(
      db,
      owner,
      {
        ...empty,
        code: "SOCIO-8",
        incomes: [
          {
            type: "DIVIDENDOS",
            amount: "900000",
            month: "6",
            payerCode: "EMP-A",
            taxWithheld: "",
            transition: false,
          },
        ],
      },
      null,
    );
    expect(outcome).toEqual({ saved: true, code: "SOCIO-8", warnings: [] });
    const result = await getClientResult(db, owner, "SOCIO-8");
    expect(result.reducerByPayer[0]).toMatchObject({ payerCode: "EMP-A", pjEffectiveRate: "0.34" });
  });

  it("assessor não cadastra nem edita", async () => {
    const owner = await createOrganization();
    const advisor = await addMember(owner, "member", "ASS-1");
    await expect(saveClientForm(db, advisor, partner, null)).rejects.toThrow(ForbiddenError);
    await expect(clientFormValues(db, advisor, "SOCIO-7")).rejects.toThrow(ForbiddenError);
  });
});
