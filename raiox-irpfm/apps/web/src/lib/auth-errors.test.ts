import { describe, expect, it } from "vitest";
import { authErrorMessage, officeSlug } from "./auth-errors.ts";

describe("officeSlug", () => {
  it("tira acentos e símbolos e acrescenta um sufixo", () => {
    expect(officeSlug("Ação & Patrimônio Investimentos")).toMatch(
      /^acao-patrimonio-investimentos-[a-z0-9]{1,6}$/,
    );
    expect(officeSlug("!!!")).toMatch(/^escritorio-[a-z0-9]{1,6}$/);
  });
});

describe("authErrorMessage", () => {
  it("traduz códigos conhecidos e limita a exposição dos demais", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(authErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(authErrorMessage({ code: "SOMETHING_INTERNAL", message: "stack trace" })).toBe(
      "Não foi possível concluir. Confira os dados e tente de novo.",
    );
  });
});
