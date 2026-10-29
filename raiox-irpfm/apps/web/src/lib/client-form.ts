import { INCOME_TYPE_CODES, type IncomeTypeCode, type TaxRegime } from "@raiox/engine";
import { z } from "zod";

/**
 * Manual client form. Values stay as typed ("60.000,00", "34%"): the server
 * validates them with the spreadsheet importer, so a client typed here and a
 * client imported from the template go through exactly the same rules. The
 * checks below only catch empty required fields before the round trip.
 */
const typed = (max: number) => z.string().trim().max(max, "Texto longo demais");
const requiredTyped = (message: string, max = 30) =>
  z.string().trim().min(1, message).max(max, "Texto longo demais");

export const LIMIT_CATEGORIES = ["GERAL", "FINANCEIRA", "BANCO"] as const;

export const clientFormSchema = z.object({
  code: requiredTyped("Informe o código do cliente", 40),
  nickname: typed(40),
  advisorCode: typed(40),
  irpfAdjustmentDue: typed(30),
  incomes: z
    .array(
      z.object({
        type: z.enum(INCOME_TYPE_CODES, "Escolha o tipo"),
        amount: requiredTyped("Informe o valor"),
        month: z.string(),
        payerCode: typed(40),
        taxWithheld: typed(30),
        transition: z.boolean(),
      }),
    )
    .max(600, "Até 600 linhas de rendimento por cliente"),
  companies: z
    .array(
      z.object({
        code: requiredTyped("Informe o código da empresa", 40),
        effectiveRate: typed(30),
        limitCategory: z.enum(LIMIT_CATEGORIES),
        simplesNacional: z.boolean(),
      }),
    )
    .max(60, "Até 60 empresas por cliente"),
  positions: z
    .array(
      z.object({
        assetClass: z.enum(INCOME_TYPE_CODES, "Escolha a classe"),
        balance: requiredTyped("Informe o saldo"),
        expectedAnnualRate: requiredTyped("Informe a taxa esperada"),
        taxRate: typed(30),
      }),
    )
    .max(60, "Até 60 posições por cliente"),
});

export type ClientForm = z.infer<typeof clientFormSchema>;
export type IncomeForm = ClientForm["incomes"][number];
export type CompanyForm = ClientForm["companies"][number];
export type PositionForm = ClientForm["positions"][number];

/** What the form needs to know about each income type (from the rule set). */
export interface IncomeTypeOption {
  code: IncomeTypeCode;
  label: string;
  regime: TaxRegime;
  requiresMonth: boolean;
  requiresPayer: boolean;
  investable: boolean;
}

export const REGIME_GROUP: Record<TaxRegime, string> = {
  AJUSTE: "Tributáveis no ajuste anual",
  EXCLUSIVA: "Tributação exclusiva na fonte",
  DEFINITIVA: "Tributação definitiva",
  LEI_14754: "Exterior (Lei 14.754)",
  DIVIDENDO: "Lucros e dividendos",
  ISENTO: "Isentos e alíquota zero",
  BASE_DEDUCTION: "Deduções da base",
};

/** Result of saving the form, field paths as react-hook-form names them. */
export type ClientFormOutcome =
  | { saved: true; code: string; warnings: string[] }
  | { saved: false; fieldErrors: Record<string, string>; formErrors: string[] };
