import type { Dec } from "../money.ts";

export type RuleStatus = "CONFIRMADA" | "PENDENTE";

/** One entry of docs/REGRAS.md, as data. */
export interface RuleDefinition {
  id: string;
  title: string;
  legalRef: string;
  status: RuleStatus;
  /** For PENDENTE rules: what the default does and what conservative mode does. */
  pendingNote?: string;
}

/** Which deduction of art. 16-A §3º absorbs the tax of an income line. */
export type TaxRegime =
  | "AJUSTE" // taxed in the annual adjustment: covered by deduction I (IRPF devido)
  | "EXCLUSIVA" // withheld exclusively at source: deduction II
  | "DEFINITIVA" // paid definitively (e.g. stock exchange gains): deduction IV
  | "LEI_14754" // offshore investments and controlled entities: deduction III
  | "DIVIDENDO" // dividends: monthly withholding of art. 6º-A, deducted after the floor (§5º)
  | "ISENTO" // exempt or zero rate
  | "BASE_DEDUCTION"; // amount subtracted from the base (§7º, notary pass-throughs)

/** Regimes whose tax is a line-level amount deducted by §3º II, III or IV. */
export const TAXED_REGIMES: ReadonlySet<TaxRegime> = new Set([
  "EXCLUSIVA",
  "DEFINITIVA",
  "LEI_14754",
]);

/** How an income type is treated in the IRPFM base (art. 16-A §1º). */
export type BaseTreatment =
  | { kind: "INCLUDED" }
  | { kind: "EXCLUDED"; ruleId: string }
  | { kind: "CHOICE"; choice: "exemptStockGainsInBase"; ruleId: string }
  | { kind: "SUBTRACTED"; ruleId: string };

export const INCOME_TYPE_CODES = [
  "SALARIO",
  "ALUGUEL",
  "APOSENTADORIA",
  "ATIVIDADE_RURAL",
  "OUTROS_TRIBUTAVEIS",
  "DECIMO_TERCEIRO",
  "PLR",
  "JCP",
  "RENDA_FIXA",
  "FUNDOS",
  "PREVIDENCIA",
  "FII_TRIBUTADO",
  "OUTROS_EXCLUSIVOS",
  "GANHO_BOLSA",
  "EXTERIOR_14754",
  "DIVIDENDOS",
  "GANHO_BOLSA_ISENTO",
  "OUTROS_ISENTOS",
  "GANHO_CAPITAL",
  "RRA_EXCLUSIVO",
  "DOACAO_HERANCA",
  "POUPANCA",
  "LH",
  "LCI",
  "CRI",
  "LIG",
  "LCD",
  "DEBENTURE_INCENTIVADA",
  "FUNDO_INFRA",
  "FIP_IE",
  "FII_ISENTO",
  "FIAGRO_ISENTO",
  "LCA",
  "CRA",
  "CDCA",
  "CDA_WA",
  "CPR",
  "RURAL_ISENTA",
  "INDENIZACAO",
  "MOLESTIA_GRAVE",
  "TVM_ISENTO_OUTROS",
  "REPASSE_CARTORIO",
] as const;

export type IncomeTypeCode = (typeof INCOME_TYPE_CODES)[number];

export interface IncomeTypeDefinition {
  code: IncomeTypeCode;
  label: string;
  /** Short help text for the template dictionary. */
  help: string;
  example: string;
  base: BaseTreatment;
  regime: TaxRegime;
  /**
   * Rate used to estimate the tax of a line when it is not informed
   * (R-16A-23). null means "must be informed": a missing value counts as zero
   * with an alert.
   */
  estimatedTaxRate: Dec | null;
  /** Whether the line must carry a month (dividends: monthly withholding). */
  requiresMonth: boolean;
  /** Whether the line must reference a paying company. */
  requiresPayer: boolean;
  /** Can be used as an asset class in the positions sheet (scenarios). */
  investable: boolean;
}

export interface ProgressiveBracket {
  /** Upper bound of the bracket (inclusive); null = no limit. */
  upTo: Dec | null;
  rate: Dec;
  deduction: Dec;
}

export type ReducerLimitCategory = "GERAL" | "FINANCEIRA" | "BANCO";

export interface RuleSet {
  calendarYear: number;
  /** Bumped whenever any value below changes. Recorded in every result. */
  version: string;
  publishedAt: string;
  sources: readonly { id: string; title: string; url: string }[];

  monthlyWithholding: {
    threshold: Dec; // R$ 50.000,00, strictly greater than
    rate: Dec; // 10%
  };

  minimumTax: {
    threshold: Dec; // R$ 600.000,00, strictly greater than
    fullRateFrom: Dec; // R$ 1.200.000,00, greater than or equal
    maxRate: Dec; // 10%
    /** Alíquota % = REND / divisor − offset (§2º II). */
    linearDivisor: Dec; // 60.000
    linearOffset: Dec; // 10 (percentage points)
  };

  reducer: {
    limits: Record<ReducerLimitCategory, Dec>;
  };

  irpfEstimate: {
    annualTable: readonly ProgressiveBracket[];
    simplifiedDiscountRate: Dec;
    simplifiedDiscountCap: Dec;
    /** Art. 11-A annual reduction. */
    reduction: {
      fullUpTo: Dec; // 60.000: reduction up to `fullMax`, so that tax is zero
      fullMax: Dec; // 2.694,15
      phaseOutUpTo: Dec; // 88.200
      phaseOutConstant: Dec; // 8.429,73
      phaseOutFactor: Dec; // 0,095575
    };
  };

  marginalStep: Dec; // R$ 1.000,00 finite difference

  incomeTypes: readonly IncomeTypeDefinition[];
  rules: readonly RuleDefinition[];
}
