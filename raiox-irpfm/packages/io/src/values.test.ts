import { describe, expect, it } from "vitest";
import {
  type Cell,
  looksLikePersonalData,
  parseCode,
  parseMoney,
  parseMonth,
  parseRate,
  parseYesNo,
} from "./values.ts";

const text = (value: string): Cell => ({ text: value, numeric: false });
const num = (value: string): Cell => ({ text: value, numeric: true });

describe("parseMoney", () => {
  it.each([
    ["60.000,00", "60000.00"],
    ["60000,00", "60000.00"],
    ["R$ 1.234.567,89", "1234567.89"],
    ["1.234.567", "1234567.00"],
    ["1234.56", "1234.56"],
    ["  500 ", "500.00"],
    ["0", "0.00"],
  ])("texto %s → %s", (input, expected) => {
    expect(parseMoney(text(input))).toEqual({ ok: true, value: expected, rounded: false });
  });

  it("célula numérica do Excel nunca é lida com separador de milhar", () => {
    expect(parseMoney(num("1.234"))).toEqual({ ok: true, value: "1.23", rounded: true });
    expect(parseMoney(num("60000"))).toEqual({ ok: true, value: "60000.00", rounded: false });
    expect(parseMoney(num("1.2345678E5"))).toEqual({
      ok: true,
      value: "123456.78",
      rounded: false,
    });
  });

  it("arredonda ao centavo e sinaliza", () => {
    expect(parseMoney(num("1234.5599999999999"))).toEqual({
      ok: true,
      value: "1234.56",
      rounded: true,
    });
  });

  it.each(["abc", "1,2,3", "-100", "12.34,5,6", "R$"])("rejeita %s", (input) => {
    expect(parseMoney(text(input)).ok).toBe(false);
  });
});

describe("parseRate", () => {
  it.each([
    [text("32%"), "0.32"],
    [text("32,5%"), "0.325"],
    [text("0,32"), "0.32"],
    [num("0.32"), "0.32"],
    [num("0"), "0"],
  ])("%o → %s", (input, expected) => {
    const result = parseRate(input);
    expect(result.ok && result.value).toBe(expected);
  });

  it("número entre 1 e 100 sem % é lido como percentual, com aviso", () => {
    expect(parseRate(text("32"))).toEqual({ ok: true, value: "0.32", interpretedAsPercent: true });
  });

  it("rejeita acima de 100%", () => {
    expect(parseRate(text("150%")).ok).toBe(false);
    expect(parseRate(text("250")).ok).toBe(false);
  });
});

describe("outros campos", () => {
  it("mês", () => {
    expect(parseMonth(num("3"))).toEqual({ ok: true, value: 3 });
    expect(parseMonth(text("12"))).toEqual({ ok: true, value: 12 });
    expect(parseMonth(text("13")).ok).toBe(false);
    expect(parseMonth(num("2.5")).ok).toBe(false);
  });

  it("sim/não", () => {
    for (const yes of ["S", "sim", "Y", "TRUE", "1", "x"]) {
      expect(parseYesNo(text(yes))).toEqual({ ok: true, value: true });
    }
    for (const no of ["N", "não", "nao", "FALSE", "0"]) {
      expect(parseYesNo(text(no))).toEqual({ ok: true, value: false });
    }
    expect(parseYesNo(text("talvez")).ok).toBe(false);
  });

  it("código pseudônimo", () => {
    expect(parseCode(text(" cli-001 "))).toEqual({ ok: true, value: "CLI-001" });
    expect(parseCode(text("João")).ok).toBe(false);
    expect(parseCode(text("a".repeat(41))).ok).toBe(false);
  });

  it("detecta CPF, CNPJ, e-mail e telefone", () => {
    expect(looksLikePersonalData("123.456.789-09")).toBe("CPF");
    expect(looksLikePersonalData("12345678909")).toBe("CPF");
    expect(looksLikePersonalData("12.345.678/0001-95")).toBe("CNPJ");
    expect(looksLikePersonalData("fulano@exemplo.com")).toBe("e-mail");
    expect(looksLikePersonalData("(11) 99876-5432")).toBe("telefone");
    expect(looksLikePersonalData("CLI-0001")).toBeNull();
    expect(looksLikePersonalData("Dr. R.")).toBeNull();
  });
});
