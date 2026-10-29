/**
 * Property-based tests (fast-check): invariants that must hold for ANY input,
 * not just the hand-picked golden cases.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateClient } from "./calculate.ts";
import { money } from "./money.ts";
import { RULES_2026 } from "./rules/2026.ts";
import type { IncomeTypeCode } from "./rules/types.ts";
import { serializeResult } from "./serialize.ts";
import type {
  CalculationOptions,
  ClientInput,
  IncomeLineInput,
  PayerInput,
  PendingChoices,
} from "./types.ts";

const RUNS = { numRuns: Number.parseInt(process.env.FC_RUNS ?? "300", 10) };

function centsToString(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const rest = cents % 100;
  return `${whole}.${String(rest).padStart(2, "0")}`;
}

const amountArb = (maxReais: number) =>
  fc.integer({ min: 0, max: maxReais * 100 }).map(centsToString);

const payerCodes = ["PJ-A", "PJ-B", "PJ-C"] as const;

const allTypes = RULES_2026.incomeTypes.map((t) => t.code);
const excludedTypes = RULES_2026.incomeTypes
  .filter((t) => t.base.kind === "EXCLUDED")
  .map((t) => t.code);

const lineArb: fc.Arbitrary<IncomeLineInput> = fc
  .record({
    type: fc.constantFrom(...allTypes),
    amount: amountArb(900_000),
    month: fc.integer({ min: 1, max: 12 }),
    payerCode: fc.constantFrom(...payerCodes),
    transition: fc.boolean(),
    taxShare: fc.option(fc.integer({ min: 0, max: 30 }), { nil: undefined }),
  })
  .map(({ type, amount, month, payerCode, transition, taxShare }) => {
    const line: IncomeLineInput =
      type === "DIVIDENDOS"
        ? { type, amount, month, payerCode, transition }
        : { type, amount, month: null };
    if (taxShare !== undefined && type !== "DIVIDENDOS") {
      return { ...line, taxWithheld: money(amount).times(taxShare).dividedBy(100).toFixed(2) };
    }
    return line;
  });

const payerArb = (code: string): fc.Arbitrary<PayerInput> =>
  fc.record({
    code: fc.constant(code),
    effectiveRate: fc.constantFrom(null, "0.08", "0.24", "0.34", "0.40"),
    limitCategory: fc.constantFrom("GERAL" as const, "FINANCEIRA" as const, "BANCO" as const),
    simplesNacional: fc.boolean(),
  });

const clientArb: fc.Arbitrary<ClientInput> = fc.record({
  clientCode: fc.constant("C-PROP"),
  incomes: fc.array(lineArb, { minLength: 0, maxLength: 14 }),
  payers: fc.tuple(...payerCodes.map(payerArb)),
  irpfAdjustmentDue: fc.option(amountArb(400_000), { nil: null }),
});

const choicesArb: fc.Arbitrary<Partial<PendingChoices>> = fc.record(
  {
    simplesNacionalWithholding: fc.boolean(),
    exemptStockGainsInBase: fc.boolean(),
    reducerStrategy: fc.constantFrom(
      "INCREMENTAL_NET" as const,
      "INCREMENTAL_GROSS" as const,
      "NOMINAL_RATE" as const,
      "MIN_OF_ALL" as const,
    ),
    estimateIrpfWhenMissing: fc.boolean(),
    estimateTaxWhenMissing: fc.boolean(),
  },
  { requiredKeys: [] },
);

const optionsArb: fc.Arbitrary<CalculationOptions> = fc.record({
  conservative: fc.boolean(),
  choices: choicesArb,
  skipMarginal: fc.constant(true),
});

describe("propriedades do motor", () => {
  it("o IRPFM devido nunca é negativo", () => {
    fc.assert(
      fc.property(clientArb, optionsArb, (input, options) => {
        const result = calculateClient(input, options);
        expect(result.minimumTaxDue.isNegative()).toBe(false);
        expect(result.grossMinimumTax.isNegative()).toBe(false);
      }),
      RUNS,
    );
  });

  it("aumentar um rendimento excluído nunca altera o IRPFM nem o saldo", () => {
    const extraArb = fc.record({
      type: fc.constantFrom<IncomeTypeCode | "TRANSICAO">(...excludedTypes, "TRANSICAO"),
      amount: amountArb(5_000_000),
      taxShare: fc.integer({ min: 0, max: 30 }),
    });
    fc.assert(
      fc.property(clientArb, optionsArb, extraArb, (input, options, extra) => {
        const before = calculateClient(input, options);
        const added: IncomeLineInput =
          extra.type === "TRANSICAO"
            ? {
                type: "DIVIDENDOS",
                amount: extra.amount,
                month: 1,
                payerCode: "PJ-A",
                transition: true,
              }
            : {
                type: extra.type,
                amount: extra.amount,
                taxWithheld: money(extra.amount).times(extra.taxShare).dividedBy(100).toFixed(2),
              };
        // R-16B-05 ALL_RECEIVED is documented to break this invariant; keep the default.
        const after = calculateClient({ ...input, incomes: [...input.incomes, added] }, options);
        expect(after.minimumTaxDue.toFixed(2)).toBe(before.minimumTaxDue.toFixed(2));
        expect(after.finalBalance.toFixed(2)).toBe(before.finalBalance.toFixed(2));
        expect(after.base.toFixed(2)).toBe(before.base.toFixed(2));
      }),
      RUNS,
    );
  });

  it("o resultado não depende da ordem das linhas nem das empresas", () => {
    fc.assert(
      fc.property(
        clientArb,
        optionsArb,
        fc.infiniteStream(fc.nat()),
        (input, options, randomness) => {
          const shuffle = <T>(items: readonly T[]): T[] => {
            const copy = [...items];
            const iterator = randomness[Symbol.iterator]();
            for (let i = copy.length - 1; i > 0; i--) {
              const j = (iterator.next().value as number) % (i + 1);
              [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
            }
            return copy;
          };
          const shuffled: ClientInput = {
            ...input,
            incomes: shuffle(input.incomes),
            payers: shuffle(input.payers ?? []),
          };
          const a = serializeResult(calculateClient(input, { ...options, skipMarginal: false }));
          const b = serializeResult(calculateClient(shuffled, { ...options, skipMarginal: false }));
          expect(b).toEqual(a);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("saldo = IRPFM devido − retenção; a pagar e a restituir são coerentes", () => {
    fc.assert(
      fc.property(clientArb, optionsArb, (input, options) => {
        const r = calculateClient(input, options);
        expect(r.finalBalance.equals(r.minimumTaxDue.minus(r.withholding.total))).toBe(true);
        expect(r.amountToPay.minus(r.amountToRefund).equals(r.finalBalance)).toBe(true);
        expect(r.amountToPay.isNegative() || r.amountToRefund.isNegative()).toBe(false);
        expect(r.amountToPay.isZero() || r.amountToRefund.isZero()).toBe(true);
      }),
      RUNS,
    );
  });

  it("alíquota entre 0 e 10%, IRPFM bruto ≤ 10% da base, e zero com base de até R$ 600 mil", () => {
    fc.assert(
      fc.property(clientArb, optionsArb, (input, options) => {
        const r = calculateClient(input, options);
        expect(r.rate.greaterThanOrEqualTo(0) && r.rate.lessThanOrEqualTo("0.1")).toBe(true);
        expect(r.grossMinimumTax.lessThanOrEqualTo(r.base.times("0.1").plus("0.005"))).toBe(true);
        if (r.base.lessThanOrEqualTo(RULES_2026.minimumTax.threshold)) {
          expect(r.minimumTaxDue.isZero()).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("aumentar um rendimento incluído nunca reduz o IRPFM bruto", () => {
    fc.assert(
      fc.property(clientArb, optionsArb, amountArb(3_000_000), (input, options, amount) => {
        const before = calculateClient(input, options);
        const after = calculateClient(
          { ...input, incomes: [...input.incomes, { type: "SALARIO", amount }] },
          options,
        );
        expect(after.grossMinimumTax.greaterThanOrEqualTo(before.grossMinimumTax)).toBe(true);
      }),
      RUNS,
    );
  });

  it("modo conservador nunca dá IRPFM menor que o padrão", () => {
    fc.assert(
      fc.property(clientArb, (input) => {
        const standard = calculateClient(input, { skipMarginal: true });
        const conservative = calculateClient(input, { conservative: true, skipMarginal: true });
        expect(conservative.minimumTaxDue.greaterThanOrEqualTo(standard.minimumTaxDue)).toBe(true);
      }),
      RUNS,
    );
  });

  it("cada retenção é 10% do total do par (PJ, mês) quando o total passa de R$ 50 mil, senão zero", () => {
    fc.assert(
      fc.property(clientArb, optionsArb, (input, options) => {
        const r = calculateClient(input, options);
        const simplesWithholds =
          options.conservative === true || options.choices?.simplesNacionalWithholding !== false;
        for (const entry of r.withholding.entries) {
          const applies =
            entry.subjectAmount.greaterThan("50000") &&
            (!entry.simplesNacional || simplesWithholds);
          const expected = applies ? entry.subjectAmount.times("0.1") : money("0");
          expect(entry.withheld.toFixed(2)).toBe(expected.toDecimalPlaces(2, 4).toFixed(2));
        }
      }),
      RUNS,
    );
  });
});
