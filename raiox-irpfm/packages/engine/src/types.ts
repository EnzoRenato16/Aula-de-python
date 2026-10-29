import type { Dec, DecimalInput } from "./money.ts";
import type { IncomeTypeCode, ReducerLimitCategory, RuleSet } from "./rules/types.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** One income line: client × income type × (optional) month. */
export interface IncomeLineInput {
  type: IncomeTypeCode;
  /** Gross amount received in the calendar year (cash basis), ≥ 0. */
  amount: DecimalInput;
  /** 1–12. Required for DIVIDENDOS (monthly withholding). */
  month?: number | null;
  /** Tax withheld/paid on this line (regimes EXCLUSIVA, DEFINITIVA, LEI_14754). */
  taxWithheld?: DecimalInput | null;
  /** Pseudonymous code of the paying company (required for DIVIDENDOS). */
  payerCode?: string | null;
  /** DIVIDENDOS only: line qualifies for the transition rule (R-6A-06, R-16A-EX-XII). */
  transition?: boolean;
}

export interface PayerInput {
  /** Pseudonymous company code. Never a CNPJ. */
  code: string;
  /** (IRPJ + CSLL due) ÷ accounting profit, as a fraction ("0.32"). R-16B-03. */
  effectiveRate?: DecimalInput | null;
  limitCategory?: ReducerLimitCategory;
  simplesNacional?: boolean;
}

/** Investment position, used only by scenarios. */
export interface PositionInput {
  assetClass: IncomeTypeCode;
  balance: DecimalInput;
  /** Expected yield per year, as a fraction ("0.12"). */
  expectedAnnualRate: DecimalInput;
  /** Tax rate on the yield, as a fraction; defaults to the class estimate. */
  taxRate?: DecimalInput | null;
}

export interface ClientInput {
  /** Pseudonymous client code. Never a CPF or a full name. */
  clientCode: string;
  nickname?: string | null;
  advisorCode?: string | null;
  incomes: readonly IncomeLineInput[];
  payers?: readonly PayerInput[];
  /** IRPF devido na declaração de ajuste (art. 16-A §3º I), informed by the accountant. */
  irpfAdjustmentDue?: DecimalInput | null;
  positions?: readonly PositionInput[];
}

// ---------------------------------------------------------------------------
// Options (PENDENTE choices)
// ---------------------------------------------------------------------------

export type ReducerStrategy = "INCREMENTAL_NET" | "INCREMENTAL_GROSS" | "NOMINAL_RATE";
export type ReducerDenominator = "IN_BASE" | "ALL_RECEIVED";

export interface PendingChoices {
  /** R-6A-08 */
  simplesNacionalWithholding: boolean;
  /** R-16A-06 */
  exemptStockGainsInBase: boolean;
  /** R-16B-04. "MIN_OF_ALL" = smallest reducer across strategies and denominators. */
  reducerStrategy: ReducerStrategy | "MIN_OF_ALL";
  /** R-16B-05 (ignored when reducerStrategy = MIN_OF_ALL) */
  reducerDenominator: ReducerDenominator;
  /** R-16A-22 */
  estimateIrpfWhenMissing: boolean;
  /** R-16A-23 */
  estimateTaxWhenMissing: boolean;
}

export interface CalculationOptions {
  calendarYear?: number;
  /** Overrides the rule set of `calendarYear` (tests, what-if on rules). */
  ruleSet?: RuleSet;
  /** Conservative mode overrides every PENDENTE choice (D-006). */
  conservative?: boolean;
  choices?: Partial<PendingChoices>;
  /** Internal: skip marginal-rate computation (used by the marginal computation itself). */
  skipMarginal?: boolean;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type Severity = "info" | "atencao" | "critico";

export type AlertCode =
  | "FAIXA_TRANSICAO"
  | "PROXIMO_DO_LIMIAR"
  | "IRPFM_A_PAGAR"
  | "RETENCAO_MENSAL"
  | "IRRF_RESTITUIVEL"
  | "IRPF_AJUSTE_ESTIMADO"
  | "IRPF_AJUSTE_AUSENTE"
  | "IR_LINHA_ESTIMADO"
  | "IR_LINHA_AUSENTE"
  | "ALIQUOTA_PJ_AUSENTE"
  | "DIVIDENDOS_TRANSICAO"
  | "SIMPLES_NACIONAL_RETENCAO"
  | "REGRA_PENDENTE";

export interface Alert {
  code: AlertCode;
  severity: Severity;
  message: string;
  ruleIds: string[];
}

export type StepUnit = "BRL" | "RATE" | "FLAG";

/** One line of the calculation trail (audit). */
export interface TrailStep {
  id: string;
  label: string;
  /** Human-readable formula with the actual numbers, in pt-BR. */
  formula: string;
  value: Dec;
  unit: StepUnit;
  ruleIds: string[];
  legalRef: string;
  children?: TrailStep[];
}

export interface IncomeTypeSummary {
  type: IncomeTypeCode;
  label: string;
  amount: Dec;
  /** Tax on these lines (informed + estimated). */
  tax: Dec;
  taxEstimated: Dec;
  inBase: boolean;
  /** Rule that excludes the type, when excluded. */
  exclusionRuleId: string | null;
}

export interface WithholdingEntry {
  payerCode: string;
  month: number;
  /** Dividends of the pair (payer, month) subject to art. 6º-A (transition excluded). */
  subjectAmount: Dec;
  transitionAmount: Dec;
  withheld: Dec;
  simplesNacional: boolean;
}

export interface ReducerEntry {
  payerCode: string;
  dividends: Dec;
  pjEffectiveRate: Dec | null;
  irpfmEffectiveRate: Dec;
  limit: Dec;
  limitCategory: ReducerLimitCategory;
  value: Dec;
  status: "CALCULADO" | "SEM_ALIQUOTA_PJ" | "NAO_SE_APLICA";
}

export type IrpfSource = "INFORMADO" | "ESTIMADO" | "AUSENTE";

export interface ClientResult {
  clientCode: string;
  nickname: string | null;
  advisorCode: string | null;
  calendarYear: number;
  ruleSetVersion: string;
  choices: PendingChoices;
  conservative: boolean;

  totalIncome: Dec;
  includedIncome: Dec;
  excludedIncome: Dec;
  baseDeductions: Dec;
  base: Dec;
  byType: IncomeTypeSummary[];

  subjectToMinimumTax: boolean;
  rate: Dec;
  grossMinimumTax: Dec;

  deductions: {
    irpfAdjustment: Dec;
    irpfSource: IrpfSource;
    exclusiveWithholding: Dec;
    law14754: Dec;
    definitive: Dec;
    reducer: Dec;
  };
  reducerByPayer: ReducerEntry[];
  reducerStrategyUsed: ReducerStrategy;
  reducerDenominatorUsed: ReducerDenominator;

  minimumTaxDue: Dec;
  withholding: { total: Dec; entries: WithholdingEntry[] };
  /** §5º result: positive = to pay, negative = to refund. */
  finalBalance: Dec;
  amountToPay: Dec;
  amountToRefund: Dec;

  /** IRPF ajuste + every line tax + IRPFM due. Withholding is an advance, not a cost. */
  totalTaxes: Dec;
  netIncome: Dec;
  effectiveTaxRate: Dec;

  marginalRates: MarginalRate[];
  trail: TrailStep[];
  alerts: Alert[];
  pendingRulesUsed: string[];
}

export interface MarginalRate {
  type: IncomeTypeCode;
  label: string;
  /** Δ total taxes ÷ step. */
  rate: Dec;
  components: { ownTax: Dec; irpfAdjustment: Dec; minimumTax: Dec };
}
