import { writeClientsWorkbook } from "@raiox/io";
import { generateClients } from "@raiox/seed";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "../context.ts";
import { auditLog, calculationRun, clientResult } from "../db/schema.ts";
import { addMember, createOrganization, csvFile, db } from "../test/fixtures.ts";
import { listAudit } from "./audit.ts";
import { getClientResult, listResults, recalculate } from "./calculation.ts";
import { deleteClient, loadClientInputs } from "./clients.ts";
import { confirmImport, discardImport, getBatch, ImportError, previewImport } from "./imports.ts";
import { runScenario } from "./scenarios.ts";
import { getSettings, updateSettings } from "./settings.ts";

const RENDIMENTOS_HEADER =
  "codigo_cliente;tipo_rendimento;mes;valor;ir_retido_ou_pago;codigo_empresa;regra_transicao";

async function importSeed(
  ctx: Awaited<ReturnType<typeof createOrganization>>,
  count: number,
  seed = 42,
) {
  const clients = generateClients({ clients: count, seed }).map(
    ({ profile: _profile, ...client }) => client,
  );
  const bytes = await writeClientsWorkbook(clients, { includeGuide: false });
  const batchId = await previewImport(db, ctx, { name: "base.xlsx", bytes });
  await confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: false });
  return recalculate(db, ctx);
}

describe("importação e cálculo", () => {
  it("prévia não altera a base; confirmação grava e o cálculo ranqueia", async () => {
    const ctx = await createOrganization();
    const batchId = await previewImport(
      db,
      ctx,
      csvFile([
        RENDIMENTOS_HEADER,
        "CLI-1;SALARIO;;900000,00;;;",
        "CLI-2;DIVIDENDOS;3;60000;;EMP-A;N",
      ]),
    );
    expect(await loadClientInputs(db, ctx, { scope: "visible" })).toHaveLength(0);
    const batch = await getBatch(db, ctx, batchId);
    expect(batch.status).toBe("PREVIEW");
    expect(batch.stats.clients).toBe(2);

    await confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: false });
    const summary = await recalculate(db, ctx);
    expect(summary.clientCount).toBe(2);

    const { rows } = await listResults(db, ctx);
    expect(rows.map((row) => row.clientCode).sort()).toEqual(["CLI-1", "CLI-2"]);
    const salary = rows.find((row) => row.clientCode === "CLI-1");
    // Base 900.000 → 5% → 45.000 (IRPF do ajuste estimado: 0 de IRPFM adicional)
    expect(salary?.base).toBe("900000.00");
    expect(salary?.rate).toBe("0.0500000000");
    const dividend = await getClientResult(db, ctx, "CLI-2");
    expect(dividend.withholding.total).toBe("6000.00");
    expect((await getBatch(db, ctx, batchId)).payload).toBeNull();
  });

  it("recusa planilha com erros, a menos que o usuário aceite importar só as linhas válidas", async () => {
    const ctx = await createOrganization();
    const batchId = await previewImport(
      db,
      ctx,
      csvFile([RENDIMENTOS_HEADER, "CLI-1;SALARIO;;abc;;;", "CLI-2;SALARIO;;700000;;;"]),
    );
    await expect(
      confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: false }),
    ).rejects.toThrow(ImportError);
    await confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: true });
    const inputs = await loadClientInputs(db, ctx, { scope: "visible" });
    expect(inputs.map((entry) => entry.input.clientCode)).toEqual(["CLI-2"]);
    await expect(
      confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: true }),
    ).rejects.toThrow(/já foi confirmada/);
  });

  it("MERGE substitui só os clientes do arquivo; REPLACE remove os que não vieram", async () => {
    const ctx = await createOrganization();
    const first = await previewImport(
      db,
      ctx,
      csvFile([RENDIMENTOS_HEADER, "A;SALARIO;;100;;;", "B;SALARIO;;200;;;"]),
    );
    await confirmImport(db, ctx, first, { mode: "MERGE", acceptErrors: false });
    const second = await previewImport(
      db,
      ctx,
      csvFile([RENDIMENTOS_HEADER, "B;SALARIO;;250;;;", "C;SALARIO;;300;;;"]),
    );
    await confirmImport(db, ctx, second, { mode: "MERGE", acceptErrors: false });
    let inputs = await loadClientInputs(db, ctx, { scope: "visible" });
    expect(
      inputs.map((entry) => `${entry.input.clientCode}:${entry.input.incomes[0]?.amount}`),
    ).toEqual(["A:100.00", "B:250.00", "C:300.00"]);
    const third = await previewImport(db, ctx, csvFile([RENDIMENTOS_HEADER, "C;SALARIO;;350;;;"]));
    const result = await confirmImport(db, ctx, third, { mode: "REPLACE", acceptErrors: false });
    expect(result.removed).toBe(2);
    inputs = await loadClientInputs(db, ctx, { scope: "visible" });
    expect(inputs.map((entry) => entry.input.clientCode)).toEqual(["C"]);
  });

  it("descartar uma prévia não grava nada e não pode ser confirmada depois", async () => {
    const ctx = await createOrganization();
    const batchId = await previewImport(
      db,
      ctx,
      csvFile([RENDIMENTOS_HEADER, "A;SALARIO;;100;;;"]),
    );
    await discardImport(db, ctx, batchId);
    await expect(
      confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: false }),
    ).rejects.toThrow(ImportError);
    expect(await loadClientInputs(db, ctx, { scope: "visible" })).toHaveLength(0);
  });

  it("recusa arquivo de formato desconhecido", async () => {
    const ctx = await createOrganization();
    await expect(
      previewImport(db, ctx, { name: "base.pdf", bytes: Buffer.from("x") }),
    ).rejects.toThrow(/xlsx/);
  });

  it("o seed de 200 clientes atravessa importação, banco e cálculo com os mesmos números da CLI", async () => {
    const ctx = await createOrganization();
    const summary = await importSeed(ctx, 200);
    expect(summary.clientCount).toBe(200);
    expect(summary.skipped).toEqual([]);
    const { rows } = await listResults(db, ctx);
    expect(rows).toHaveLength(200);
    // Same order and values as the engine run directly (positions 1..200).
    expect(rows.map((row) => row.position)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  });

  it("mantém só as 5 rodadas mais recentes", async () => {
    const ctx = await createOrganization();
    await importSeed(ctx, 3);
    for (let i = 0; i < 6; i++) await recalculate(db, ctx);
    const runs = await db.select().from(calculationRun).where(eq(calculationRun.orgId, ctx.orgId));
    expect(runs).toHaveLength(5);
  });

  it("modo conservador nas premissas muda o cálculo e fica no log de auditoria", async () => {
    const ctx = await createOrganization();
    const batchId = await previewImport(
      db,
      ctx,
      csvFile([RENDIMENTOS_HEADER, "A;SALARIO;;1000000;;;"]),
    );
    await confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: false });
    await recalculate(db, ctx);
    const standard = await getClientResult(db, ctx, "A");
    expect(standard.minimumTaxDue).toBe("0.00"); // IRPF estimado cobre o IRPFM

    await updateSettings(db, ctx, { conservative: true, choices: {}, primaryColor: null });
    expect((await getSettings(db, ctx.orgId)).conservative).toBe(true);
    await recalculate(db, ctx);
    const conservative = await getClientResult(db, ctx, "A");
    expect(conservative.minimumTaxDue).toBe("66666.67"); // IRPF ausente vale zero

    const actions = (await listAudit(db, ctx)).map((entry) => entry.action);
    expect(actions).toContain("settings.update");
    expect(actions).toContain("calculation.run");
  });

  it("excluir um cliente remove dados e resultados", async () => {
    const ctx = await createOrganization();
    await importSeed(ctx, 3);
    await deleteClient(db, ctx, "CLI-0001");
    await expect(getClientResult(db, ctx, "CLI-0001")).rejects.toThrow(NotFoundError);
    const results = await db.select().from(clientResult).where(eq(clientResult.orgId, ctx.orgId));
    expect(results.map((row) => row.clientCode)).not.toContain("CLI-0001");
  });

  it("simula cenário de um cliente visível", async () => {
    const ctx = await createOrganization();
    const batchId = await previewImport(
      db,
      ctx,
      csvFile([
        RENDIMENTOS_HEADER,
        "A;DIVIDENDOS;3;400000;;EMP-A;N",
        "A;DIVIDENDOS;9;250000;;EMP-A;N",
      ]),
    );
    await confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: false });
    const view = await runScenario(db, ctx, "A", [
      { kind: "RESCHEDULE_DIVIDENDS", payerCode: "EMP-A", schedule: "CAP_AT_THRESHOLD" },
    ]);
    expect(view.base.withholding).toBe("65000.00");
    expect(view.scenario.withholding).toBe("10000.00");
    expect(view.delta.netIncome).toBe("0.00");
  });
});

describe("isolamento entre escritórios", () => {
  it("um escritório não lê, não confirma e não exclui dados de outro", async () => {
    const a = await createOrganization("Escritório A");
    const b = await createOrganization("Escritório B");
    await importSeed(a, 5);
    const batchOfA = await previewImport(db, a, csvFile([RENDIMENTOS_HEADER, "X;SALARIO;;100;;;"]));

    expect(await loadClientInputs(db, b, { scope: "visible" })).toEqual([]);
    expect((await listResults(db, b)).rows).toEqual([]);
    await expect(getClientResult(db, b, "CLI-0001")).rejects.toThrow(NotFoundError);
    await expect(getBatch(db, b, batchOfA)).rejects.toThrow(NotFoundError);
    await expect(
      confirmImport(db, b, batchOfA, { mode: "REPLACE", acceptErrors: true }),
    ).rejects.toThrow(NotFoundError);
    await expect(deleteClient(db, b, "CLI-0001")).rejects.toThrow(NotFoundError);
    await expect(runScenario(db, b, "CLI-0001", [])).rejects.toThrow(NotFoundError);
    expect((await listAudit(db, b)).every((entry) => entry.action !== "import.preview")).toBe(true);

    // A continua intacto.
    expect((await listResults(db, a)).rows).toHaveLength(5);
  });
});

describe("papéis", () => {
  it("assessor vê só os próprios clientes; sem código não vê nenhum", async () => {
    const owner = await createOrganization();
    const batchId = await previewImport(db, owner, {
      name: "base.csv",
      bytes: Buffer.from(
        [
          "codigo_cliente;tipo_rendimento;valor",
          "A1;SALARIO;700000",
          "A2;SALARIO;800000",
          "B1;SALARIO;900000",
        ].join("\n"),
      ),
    });
    await confirmImport(db, owner, batchId, { mode: "MERGE", acceptErrors: false });
    // Advisor codes come from the clientes sheet; set them through a second import.
    const withAdvisors = await previewImport(db, owner, {
      name: "clientes.xlsx",
      bytes: await writeClientsWorkbook(
        [
          {
            clientCode: "A1",
            advisorCode: "ASS-A",
            incomes: [{ type: "SALARIO", amount: "700000.00" }],
          },
          {
            clientCode: "A2",
            advisorCode: "ASS-A",
            incomes: [{ type: "SALARIO", amount: "800000.00" }],
          },
          {
            clientCode: "B1",
            advisorCode: "ASS-B",
            incomes: [{ type: "SALARIO", amount: "900000.00" }],
          },
        ],
        { includeGuide: false },
      ),
    });
    await confirmImport(db, owner, withAdvisors, { mode: "MERGE", acceptErrors: false });
    await recalculate(db, owner);

    const advisorA = await addMember(owner, "member", "ASS-A");
    const advisorWithoutCode = await addMember(owner, "member", null);
    expect((await listResults(db, advisorA)).rows.map((row) => row.clientCode)).toEqual(
      expect.arrayContaining(["A1", "A2"]),
    );
    expect((await listResults(db, advisorA)).rows).toHaveLength(2);
    await expect(getClientResult(db, advisorA, "B1")).rejects.toThrow(NotFoundError);
    await expect(runScenario(db, advisorA, "B1", [])).rejects.toThrow(NotFoundError);
    expect((await listResults(db, advisorWithoutCode)).rows).toEqual([]);
    expect((await listResults(db, owner)).rows).toHaveLength(3);
  });

  it("assessor não importa, não exclui e não muda premissas", async () => {
    const owner = await createOrganization();
    const advisor = await addMember(owner, "member", "ASS-1");
    await expect(
      previewImport(db, advisor, csvFile([RENDIMENTOS_HEADER, "A;SALARIO;;100;;;"])),
    ).rejects.toThrow(ForbiddenError);
    await expect(deleteClient(db, advisor, "A")).rejects.toThrow(ForbiddenError);
    await expect(
      updateSettings(db, advisor, { conservative: true, choices: {}, primaryColor: null }),
    ).rejects.toThrow(ForbiddenError);
    const admin = await addMember(owner, "admin");
    await expect(
      previewImport(db, admin, csvFile([RENDIMENTOS_HEADER, "A;SALARIO;;100;;;"])),
    ).resolves.toBeTypeOf("string");
  });
});

describe("LGPD no log de auditoria", () => {
  it("o log não guarda apelidos nem valores de clientes", async () => {
    const ctx = await createOrganization();
    const batchId = await previewImport(db, ctx, {
      name: "base.xlsx",
      bytes: await writeClientsWorkbook(
        [
          {
            clientCode: "CLI-9",
            nickname: "Dr. Segredo",
            incomes: [{ type: "SALARIO", amount: "123456.78" }],
          },
        ],
        { includeGuide: false },
      ),
    });
    await confirmImport(db, ctx, batchId, { mode: "MERGE", acceptErrors: false });
    await recalculate(db, ctx);
    const logs = await db.select().from(auditLog).where(eq(auditLog.orgId, ctx.orgId));
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain("Segredo");
    expect(dump).not.toContain("123456");
  });
});
