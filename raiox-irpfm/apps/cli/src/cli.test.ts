import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { writeTemplate } from "@raiox/io";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calcular } from "./commands/calcular.ts";
import { seed } from "./commands/seed.ts";
import { RANKING_COLUMNS } from "./ranking.ts";
import type { Logger } from "./util.ts";

const messages: string[] = [];
const silent: Logger = {
  step: (m) => messages.push(m),
  info: (m) => messages.push(m),
  detail: (m) => messages.push(m),
  ok: (m) => messages.push(m),
  warn: (m) => messages.push(m),
  error: (m) => messages.push(m),
  progress: () => {},
  blank: () => {},
};

/** Minimal valid 1×1 PNG, built by hand (no binary fixture in the repo). */
function tinyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, 18, 52, 59]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("CLI", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "raiox-cli-"));
    await writeFile(join(dir, "template.xlsx"), await writeTemplate());
    await writeFile(join(dir, "logo.png"), tinyPng());
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("calcular: gera ranking, JSONs e um PDF por cliente, com logo", async () => {
    const output = join(dir, "resultado");
    const code = await calcular(
      {
        entrada: join(dir, "template.xlsx"),
        saida: output,
        escritorio: "Escritório Teste",
        cor: "#204060",
        logo: join(dir, "logo.png"),
      },
      silent,
    );
    expect(code).toBe(0);
    const ranking = await readFile(join(output, "ranking.csv"), "utf8");
    expect(ranking.split("\r\n")[0]).toBe(`\uFEFF${RANKING_COLUMNS.join(";")}`);
    expect(ranking).toContain("EXEMPLO-01;Cliente exemplo;ASS-01;");
    const results = JSON.parse(await readFile(join(output, "resultados.json"), "utf8"));
    expect(results[0].result.clientCode).toBe("EXEMPLO-01");
    expect(typeof results[0].result.minimumTaxDue).toBe("string");
    const inputs = JSON.parse(await readFile(join(output, "entradas.json"), "utf8"));
    expect(inputs.clients).toHaveLength(1);
    expect(await readdir(join(output, "pdf"))).toEqual(["EXEMPLO-01.pdf"]);
    const pdf = await readFile(join(output, "pdf", "EXEMPLO-01.pdf"));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("calcular: com erros de importação, para e grava o relatório", async () => {
    const input = join(dir, "com-erro.csv");
    await writeFile(input, "codigo_cliente;tipo_rendimento;valor\nCLI-1;SALARIO;abc\n");
    const output = join(dir, "resultado-erro");
    expect(await calcular({ entrada: input, saida: output, pdf: false }, silent)).toBe(1);
    const report = await readFile(join(output, "relatorio-importacao.csv"), "utf8");
    expect(report).toContain("erro;rendimentos;2;valor;abc;");
  });

  it("calcular: --ignorar-erros calcula só as linhas válidas", async () => {
    const input = join(dir, "parcial.csv");
    await writeFile(
      input,
      "codigo_cliente;tipo_rendimento;valor\nCLI-1;SALARIO;abc\nCLI-2;SALARIO;700000\n",
    );
    const output = join(dir, "resultado-parcial");
    expect(
      await calcular({ entrada: input, saida: output, pdf: false, ignorarErros: true }, silent),
    ).toBe(0);
    expect(await readFile(join(output, "ranking.csv"), "utf8")).toContain("CLI-2");
  });

  it("calcular: valida opções antes de calcular", async () => {
    const base = { entrada: join(dir, "template.xlsx"), saida: join(dir, "x") };
    await expect(calcular({ ...base, cor: "azul" }, silent)).rejects.toThrow(/hexadecimal/);
    await expect(calcular({ ...base, logo: "logo.gif" }, silent)).rejects.toThrow(/PNG ou JPG/);
    await expect(
      calcular({ ...base, entrada: join(dir, "nao-existe.xlsx") }, silent),
    ).rejects.toThrow(/não encontrado/);
  });

  it("seed: gera a base sintética e recusa parâmetros inválidos", async () => {
    const path = join(dir, "seed.xlsx");
    expect(await seed({ saida: path, clientes: "5", semente: "1" }, silent)).toBe(0);
    expect((await readFile(path)).subarray(0, 2).toString("latin1")).toBe("PK");
    expect(await seed({ saida: path, clientes: "abc", semente: "1" }, silent)).toBe(1);
    expect(await seed({ saida: path, clientes: "5", semente: "x" }, silent)).toBe(1);
  });
});
