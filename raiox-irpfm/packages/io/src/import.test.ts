import { type ClientInput, calculateClient } from "@raiox/engine";
import { describe, expect, it } from "vitest";
import { issuesToCsv } from "./csv.ts";
import { importWorkbook } from "./import.ts";
import { TEMPLATE_EXAMPLE, writeClientsWorkbook, writeTemplate } from "./template.ts";
import { readCsvWorkbook, readXlsxWorkbook } from "./workbook.ts";

const csv = (lines: string[]) => lines.join("\n");

describe("template XLSX", () => {
  it("o template gerado é lido de volta sem erros e reproduz o cliente de exemplo", async () => {
    const workbook = await readXlsxWorkbook(await writeTemplate());
    expect([...workbook.keys()].sort()).toEqual([
      "clientes",
      "empresas",
      "posicoes",
      "rendimentos",
    ]);
    const result = importWorkbook(workbook);
    expect(result.issues.filter((issue) => issue.severity === "erro")).toEqual([]);
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain("linha de exemplo");
    expect(result.clients).toHaveLength(1);

    const imported = result.clients[0] as ClientInput;
    expect(imported.clientCode).toBe(TEMPLATE_EXAMPLE.clientCode);
    expect(imported.irpfAdjustmentDue).toBe("98000.00");
    expect(imported.incomes).toHaveLength(TEMPLATE_EXAMPLE.incomes.length);
    expect(imported.payers?.find((payer) => payer.code === "EXEMPLO-HOLDING")?.effectiveRate).toBe(
      "0.34",
    );
    expect(imported.positions).toHaveLength(2);

    // Same numbers through the engine, before and after the round trip.
    const before = calculateClient(TEMPLATE_EXAMPLE, { skipMarginal: true });
    const after = calculateClient(imported, { skipMarginal: true });
    expect(after.minimumTaxDue.toFixed(2)).toBe(before.minimumTaxDue.toFixed(2));
    expect(after.finalBalance.toFixed(2)).toBe(before.finalBalance.toFixed(2));
    expect(after.base.toFixed(2)).toBe(before.base.toFixed(2));
  });

  it("valores com centavos atravessam o XLSX sem float", async () => {
    const client: ClientInput = {
      clientCode: "CLI-CENTS",
      irpfAdjustmentDue: "12345.67",
      incomes: [{ type: "RENDA_FIXA", amount: "1234567.89", taxWithheld: "185185.18" }],
    };
    const result = importWorkbook(await readXlsxWorkbook(await writeClientsWorkbook([client])));
    expect(result.clients[0]?.incomes[0]).toMatchObject({
      amount: "1234567.89",
      taxWithheld: "185185.18",
    });
    expect(result.clients[0]?.irpfAdjustmentDue).toBe("12345.67");
  });
});

describe("validação por linha", () => {
  it("relata cada erro com aba, linha e coluna, e importa as linhas válidas", () => {
    const workbook = readCsvWorkbook([
      {
        name: "rendimentos.csv",
        content: csv([
          "codigo_cliente;tipo_rendimento;mes;valor;ir_retido_ou_pago;codigo_empresa;regra_transicao",
          "CLI-1;SALARIO;;600.000,00;;;",
          "CLI-1;DIVIDENDOS;;60.000,00;;EMP-A;N",
          "CLI-1;DIVIDENDOS;3;60.000,00;;;",
          "CLI-1;TIPO_INVENTADO;;100,00;;;",
          "CLI-1;RENDA_FIXA;;abc;;;",
          "123.456.789-09;SALARIO;;1000;;;",
          "CLI-2;Dividendos;13;50000;;EMP-A;talvez",
          "CLI-2;renda fixa;;85.000,00;12.750,00;;",
        ]),
      },
    ]);
    const result = importWorkbook(workbook);
    const errors = result.issues.filter((issue) => issue.severity === "erro");
    const at = (row: number, column: string) =>
      errors.find((issue) => issue.row === row && issue.column === column)?.message;

    expect(at(3, "mes")).toContain("obrigatório");
    expect(at(4, "codigo_empresa")).toContain("obrigatório");
    expect(at(5, "tipo_rendimento")).toContain("desconhecido");
    expect(at(6, "valor")).toContain("inválido");
    expect(at(7, "codigo_cliente")).toContain("CPF");
    expect(at(8, "mes")).toContain("1 a 12");
    expect(at(8, "regra_transicao")).toContain("S ou N");
    expect(result.ok).toBe(false);

    // Valid rows still come through (preview before confirming).
    expect(result.clients.map((client) => client.clientCode)).toEqual(["CLI-1", "CLI-2"]);
    expect(result.clients[1]?.incomes[0]).toEqual({
      type: "RENDA_FIXA",
      amount: "85000.00",
      taxWithheld: "12750.00",
    });
    expect(result.stats.errors).toBe(errors.length);
  });

  it("aceita CSV com vírgula e avisa sobre colunas e empresas desconhecidas", () => {
    const workbook = readCsvWorkbook([
      {
        name: "base.csv",
        content: csv([
          "codigo_cliente,tipo_rendimento,mes,valor,codigo_empresa,observacao",
          "CLI-9,DIVIDENDOS,1,70000,EMP-X,qualquer",
        ]),
      },
    ]);
    const result = importWorkbook(workbook);
    expect(result.ok).toBe(true);
    const warnings = result.issues.map((issue) => issue.message).join(" | ");
    expect(warnings).toContain('coluna "observacao" ignorada');
    expect(warnings).toContain("EMP-X não está na aba empresas");
    expect(result.clients[0]?.incomes[0]).toMatchObject({
      amount: "70000.00",
      month: 1,
      transition: false,
    });
  });

  it("recusa CNPJ, e-mail e nome completo como identificadores", () => {
    const workbook = readCsvWorkbook([
      {
        name: "clientes.csv",
        content: csv([
          "codigo_cliente;apelido",
          "CLI-1;Maria Aparecida Souza",
          "CLI-2;contato@exemplo.com",
          "12.345.678/0001-95;ok",
        ]),
      },
      {
        name: "rendimentos.csv",
        content: csv(["codigo_cliente;tipo_rendimento;valor", "CLI-1;SALARIO;1000"]),
      },
    ]);
    const result = importWorkbook(workbook);
    const messages = result.issues.map(
      (issue) => `${issue.severity}:${issue.row}:${issue.message}`,
    );
    expect(messages.some((m) => m.startsWith("aviso:2:") && m.includes("nome completo"))).toBe(
      true,
    );
    expect(messages.some((m) => m.startsWith("erro:3:") && m.includes("e-mail"))).toBe(true);
    expect(messages.some((m) => m.startsWith("erro:4:") && m.includes("CNPJ"))).toBe(true);
  });

  it("exige a aba rendimentos e suas colunas obrigatórias", () => {
    expect(importWorkbook(new Map()).issues[0]?.message).toContain("não encontrada");
    const result = importWorkbook(
      readCsvWorkbook([
        { name: "rendimentos.csv", content: csv(["codigo_cliente;valor", "CLI-1;10"]) },
      ]),
    );
    expect(result.issues.some((issue) => issue.message.includes('"tipo_rendimento"'))).toBe(true);
  });

  it("gera relatório de erros em CSV para Excel brasileiro", () => {
    const result = importWorkbook(
      readCsvWorkbook([
        {
          name: "rendimentos.csv",
          content: csv(["codigo_cliente;tipo_rendimento;valor", "CLI-1;SALARIO;x"]),
        },
      ]),
    );
    const report = issuesToCsv(result.issues);
    expect(report.startsWith("﻿gravidade;aba;linha;coluna;valor;mensagem\r\n")).toBe(true);
    expect(report).toContain("erro;rendimentos;2;valor;x;");
  });
});
