import { INCOME_TYPE_CODES } from "@raiox/engine";
import { z } from "zod";

/**
 * What the scenario simulator sends: amounts and rates as typed by the user
 * ("200.000,00", "12%"). The server converts them with the same parsers as
 * the spreadsheet import, so "1.500" means the same thing everywhere.
 */
const typed = (message: string) => z.string().trim().min(1, message).max(30, "Valor longo demais");
const optionalTyped = z.string().trim().max(30, "Valor longo demais");
const companyCode = z.string().trim().min(1, "Escolha a empresa").max(40);

export const operationFormSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("MOVE_ALLOCATION"),
    fromClass: z.enum(INCOME_TYPE_CODES, "Escolha a classe de origem"),
    toClass: z.enum(INCOME_TYPE_CODES, "Escolha a classe de destino"),
    amount: typed("Informe o valor movido"),
    toAnnualRate: typed("Informe a taxa esperada do destino"),
    fromAnnualRate: optionalTyped,
    toTaxRate: optionalTyped,
  }),
  z.object({
    kind: z.literal("RESCHEDULE_DIVIDENDS"),
    payerCode: companyCode,
    schedule: z.enum(["EVEN", "CAP_AT_THRESHOLD"]),
  }),
  z.object({
    kind: z.literal("ADJUST_DIVIDENDS"),
    payerCode: companyCode,
    direction: z.enum(["RETAIN", "DISTRIBUTE"]),
    amount: typed("Informe o valor"),
  }),
]);

export const MAX_OPERATIONS = 5;

export const scenarioFormSchema = z.object({
  name: z.string().trim().max(60, "Nome com mais de 60 caracteres"),
  operations: z
    .array(operationFormSchema)
    .min(1, "Adicione pelo menos uma operação")
    .max(MAX_OPERATIONS, `Até ${MAX_OPERATIONS} operações por cenário`),
});

export type OperationForm = z.infer<typeof operationFormSchema>;
export type ScenarioForm = z.infer<typeof scenarioFormSchema>;
export type OperationKind = OperationForm["kind"];

export const OPERATION_LABEL: Record<OperationKind, string> = {
  MOVE_ALLOCATION: "Mover alocação",
  RESCHEDULE_DIVIDENDS: "Redistribuir dividendos no ano",
  ADJUST_DIVIDENDS: "Reter ou distribuir mais dividendos",
};
