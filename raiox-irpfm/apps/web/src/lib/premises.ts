import type { PendingChoices, ReducerStrategy } from "@raiox/engine";
import { z } from "zod";

/**
 * PENDENTE choices an office can set. The reducer denominator (R-16B-05) is
 * not one of them: the alternative contradicts art. 16-A, §1º, XII.
 */
export const choicesSchema = z
  .object({
    simplesNacionalWithholding: z.boolean(),
    exemptStockGainsInBase: z.boolean(),
    reducerStrategy: z.enum(["INCREMENTAL_NET", "INCREMENTAL_GROSS", "NOMINAL_RATE"]),
    estimateIrpfWhenMissing: z.boolean(),
    estimateTaxWhenMissing: z.boolean(),
  })
  .partial()
  .strict();

export const premisesSchema = z.object({
  conservative: z.boolean(),
  choices: choicesSchema,
});

export const brandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor hexadecimal, ex.: #12343B")
    .nullable(),
});

export type EditableChoice = Exclude<keyof PendingChoices, "reducerDenominator">;

/** How each editable choice is presented, with the rule it decides. */
export const CHOICE_TEXT: Record<
  Exclude<EditableChoice, "reducerStrategy">,
  { ruleId: string; label: string; help: string }
> = {
  simplesNacionalWithholding: {
    ruleId: "R-6A-08",
    label: "Reter sobre dividendos de empresa do Simples Nacional",
    help: "A lei não exclui o Simples da retenção mensal; a Receita entende que se aplica.",
  },
  exemptStockGainsInBase: {
    ruleId: "R-16A-06",
    label: "Somar o ganho isento em ações à base do IRPFM",
    help: "Isento no IR, mas fora da lista de exclusões do IRPFM.",
  },
  estimateIrpfWhenMissing: {
    ruleId: "R-16A-22",
    label: "Estimar o IRPF do ajuste quando o contador não informar",
    help: "Desligado, o IRPF ausente vale zero: o IRPFM fica maior (nunca subestima).",
  },
  estimateTaxWhenMissing: {
    ruleId: "R-16A-23",
    label: "Estimar o IR de cada linha quando não informado",
    help: "Desligado, o IR ausente vale zero: o IRPFM fica maior (nunca subestima).",
  },
};

export const STRATEGY_TEXT: Record<ReducerStrategy, string> = {
  INCREMENTAL_NET: "Acréscimo do IRPFM devido (já com as deduções I a IV)",
  INCREMENTAL_GROSS: "Acréscimo do IRPFM bruto",
  NOMINAL_RATE: "Alíquota nominal do IRPFM",
};
