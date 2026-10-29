import { calculateClient } from "@raiox/engine";
import { describe, expect, it } from "vitest";
import { generateClients } from "./generate.ts";

describe("seed sintético", () => {
  const clients = generateClients({ clients: 200, seed: 42 });
  const results = clients.map((client) => calculateClient(client, { skipMarginal: true }));

  it("é determinístico", () => {
    expect(JSON.stringify(generateClients({ clients: 200, seed: 42 }))).toBe(
      JSON.stringify(clients),
    );
    expect(JSON.stringify(generateClients({ clients: 200, seed: 7 }))).not.toBe(
      JSON.stringify(clients),
    );
  });

  it("tem 200 clientes com códigos pseudônimos e sem dados pessoais", () => {
    expect(clients).toHaveLength(200);
    for (const client of clients) {
      expect(client.clientCode).toMatch(/^CLI-\d{4}$/);
      for (const payer of client.payers ?? []) expect(payer.code).toMatch(/^EMP-\d{4}$/);
    }
  });

  it("cobre as três zonas do IRPFM e os casos de interesse", () => {
    const below = results.filter((r) => r.base.lessThanOrEqualTo(600_000)).length;
    const band = results.filter(
      (r) => r.base.greaterThan(600_000) && r.base.lessThan(1_200_000),
    ).length;
    const above = results.filter((r) => r.base.greaterThanOrEqualTo(1_200_000)).length;
    expect(below).toBeGreaterThanOrEqual(25);
    expect(band).toBeGreaterThanOrEqual(25);
    expect(above).toBeGreaterThanOrEqual(25);
    expect(results.filter((r) => r.amountToPay.greaterThan(0)).length).toBeGreaterThanOrEqual(20);
    expect(results.filter((r) => r.amountToRefund.greaterThan(0)).length).toBeGreaterThanOrEqual(
      20,
    );
    expect(results.some((r) => r.reducerByPayer.some((entry) => entry.value.greaterThan(0)))).toBe(
      true,
    );
    expect(results.some((r) => r.deductions.irpfSource === "ESTIMADO")).toBe(true);
    expect(
      results.some((r) => r.withholding.entries.some((e) => e.transitionAmount.greaterThan(0))),
    ).toBe(true);
  });
});
