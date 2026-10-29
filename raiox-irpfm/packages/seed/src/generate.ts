import {
  type ClientInput,
  D,
  DEFAULT_CALENDAR_YEAR,
  type Dec,
  estimateIrpfAdjustment,
  getRuleSet,
  type IncomeLineInput,
  type IncomeTypeCode,
  type PayerInput,
  type PositionInput,
  type ReducerLimitCategory,
} from "@raiox/engine";

/**
 * Deterministic generator of SYNTHETIC clients for demos and tests.
 * Same seed → same base, byte for byte. Never real data: codes are
 * sequential, nicknames are generic, companies are pseudonyms.
 */

/** mulberry32: small, fast, deterministic PRNG. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Integer in [min, max]. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick from empty list");
      return item;
    },
    /** Money in reais between min and max, rounded to `step` reais. Returned as a Decimal. */
    money(min: number, max: number, step = 100): Dec {
      return new D(Math.round(this.int(min, max) / step) * step);
    },
    /** Rate between min and max basis points (1 bp = 0,01%). */
    rate(minBp: number, maxBp: number): Dec {
      return new D(this.int(minBp, maxBp)).dividedBy(10000);
    },
  };
}

type Random = ReturnType<typeof createRandom>;

const NICKNAMES = [
  "Dr. R.",
  "Dra. A.",
  "Sr. M.",
  "Sra. L.",
  "Família T.",
  "Cliente Moema",
  "Cliente Savassi",
  "Cliente Batel",
  "Cliente Jardins",
  "Cliente Leblon",
  "Agro MT",
  "Agro GO",
  "Eng. P.",
  "Arq. C.",
  "Prof. H.",
  "Holding B.",
  "Família K.",
  "Dr. F. (ortopedia)",
  "Dra. S. (dermato)",
  "Cliente Boa Viagem",
];

const PROFILES = [
  { key: "executivo", weight: 17 },
  { key: "empresario", weight: 20 },
  { key: "socioAbaixoDoLimite", weight: 12 },
  { key: "medicoSimples", weight: 13 },
  { key: "rentista", weight: 13 },
  { key: "investidor", weight: 10 },
  { key: "aposentado", weight: 8 },
  { key: "agroHerdeiro", weight: 7 },
] as const;

type ProfileKey = (typeof PROFILES)[number]["key"];

interface Builder {
  random: Random;
  incomes: IncomeLineInput[];
  payers: Map<string, PayerInput>;
  positions: PositionInput[];
  nextCompany: () => string;
}

const money = (value: Dec) => value.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);

function add(
  builder: Builder,
  type: IncomeTypeCode,
  amount: Dec,
  extra: Partial<IncomeLineInput> = {},
): void {
  if (amount.lessThanOrEqualTo(0)) return;
  builder.incomes.push({ type, amount: money(amount), ...extra });
}

/** Adds a taxed line with tax informed (or left blank in ~15% of the cases, to exercise estimates). */
function addTaxed(builder: Builder, type: IncomeTypeCode, amount: Dec, rate: Dec): void {
  if (builder.random.chance(0.15)) add(builder, type, amount);
  else add(builder, type, amount, { taxWithheld: money(amount.times(rate)) });
}

/** Investment with matching position (balance = annual yield ÷ expected rate). */
function invest(
  builder: Builder,
  type: IncomeTypeCode,
  income: Dec,
  rate: Dec,
  taxRate?: Dec,
): void {
  if (taxRate) addTaxed(builder, type, income, taxRate);
  else add(builder, type, income);
  const position: PositionInput = {
    assetClass: type,
    balance: money(income.dividedBy(rate)),
    expectedAnnualRate: rate.toString(),
  };
  if (taxRate) position.taxRate = taxRate.toString();
  if (!builder.positions.some((existing) => existing.assetClass === type))
    builder.positions.push(position);
}

function company(
  builder: Builder,
  attributes: {
    effectiveRate: Dec | null;
    limitCategory?: ReducerLimitCategory;
    simples?: boolean;
  },
): string {
  const code = builder.nextCompany();
  const payer: PayerInput = { code };
  if (attributes.effectiveRate !== null) payer.effectiveRate = attributes.effectiveRate.toString();
  if (attributes.limitCategory && attributes.limitCategory !== "GERAL")
    payer.limitCategory = attributes.limitCategory;
  if (attributes.simples) payer.simplesNacional = true;
  builder.payers.set(code, payer);
  return code;
}

type Pattern = "monthly" | "quarterly" | "semiannual" | "annual";

function dividends(
  builder: Builder,
  payerCode: string,
  total: Dec,
  pattern: Pattern,
  transition = false,
): void {
  const months: Record<Pattern, number[]> = {
    monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    quarterly: [3, 6, 9, 12],
    semiannual: [4, 10],
    annual: [builder.random.int(3, 5)],
  };
  const chosen = months[pattern];
  const share = total.dividedBy(chosen.length).toDecimalPlaces(2, D.ROUND_DOWN);
  chosen.forEach((month, index) => {
    const amount =
      index === chosen.length - 1 ? total.minus(share.times(chosen.length - 1)) : share;
    add(builder, "DIVIDENDOS", amount, { month, payerCode, transition });
  });
}

const PROFILE_BUILDERS: Record<ProfileKey, (builder: Builder) => void> = {
  executivo(b) {
    const { random } = b;
    const salary = random.money(280_000, 1_600_000, 1000);
    add(b, "SALARIO", salary);
    add(b, "DECIMO_TERCEIRO", salary.dividedBy(12), {
      taxWithheld: money(salary.dividedBy(12).times("0.275").minus("908.73")),
    });
    if (random.chance(0.6)) {
      const plr = random.money(40_000, 450_000, 1000);
      add(b, "PLR", plr, { taxWithheld: money(plr.times("0.275").minus("3166.80")) });
    }
    invest(
      b,
      "RENDA_FIXA",
      random.money(15_000, 220_000),
      random.rate(1050, 1350),
      random.rate(1500, 2000),
    );
    if (random.chance(0.7)) invest(b, "LCI", random.money(8_000, 90_000), random.rate(900, 1100));
    if (random.chance(0.5))
      invest(b, "FUNDOS", random.money(10_000, 150_000), random.rate(1000, 1400), new D("0.15"));
    if (random.chance(0.3))
      invest(
        b,
        "PREVIDENCIA",
        random.money(10_000, 80_000),
        random.rate(1000, 1200),
        new D("0.10"),
      );
  },
  empresario(b) {
    const { random } = b;
    add(b, "SALARIO", random.money(60_000, 320_000, 1000));
    const companies = random.int(1, 3);
    for (let i = 0; i < companies; i++) {
      const regime = random.pick(["real", "presumido", "holding"] as const);
      const effectiveRate = random.chance(0.25)
        ? null
        : regime === "real"
          ? random.rate(2200, 3400)
          : regime === "presumido"
            ? random.rate(900, 2100)
            : random.rate(200, 900);
      const code = company(b, { effectiveRate });
      dividends(
        b,
        code,
        random.money(150_000, 2_400_000, 1000),
        random.pick(["monthly", "quarterly", "semiannual", "annual"] as const),
      );
      if (random.chance(0.45))
        dividends(b, code, random.money(100_000, 1_500_000, 1000), "annual", true);
    }
    if (random.chance(0.35)) addTaxed(b, "JCP", random.money(10_000, 180_000), new D("0.175"));
    invest(
      b,
      "RENDA_FIXA",
      random.money(20_000, 300_000),
      random.rate(1050, 1350),
      random.rate(1500, 2000),
    );
    if (random.chance(0.6)) invest(b, "LCA", random.money(20_000, 200_000), random.rate(900, 1100));
    if (random.chance(0.25))
      add(b, "GANHO_CAPITAL", random.money(100_000, 900_000), { taxWithheld: "0" });
  },
  // Partner who keeps each company's monthly distribution at or below R$ 50 mil
  // (no withholding during the year) and therefore pays the IRPFM in the
  // adjustment. Typical behaviour expected from 2026 on.
  socioAbaixoDoLimite(b) {
    const { random } = b;
    add(b, "SALARIO", random.money(60_000, 240_000, 1000));
    const companies = random.int(2, 4);
    for (let i = 0; i < companies; i++) {
      const effectiveRate = random.chance(0.5) ? null : random.rate(600, 2200);
      const code = company(b, { effectiveRate, simples: random.chance(0.3) });
      const monthly = random.money(20_000, 50_000, 500);
      for (let month = 1; month <= 12; month++) {
        add(b, "DIVIDENDOS", monthly, { month, payerCode: code, transition: false });
      }
    }
    invest(
      b,
      "RENDA_FIXA",
      random.money(20_000, 200_000),
      random.rate(1050, 1350),
      random.rate(1500, 2000),
    );
    if (random.chance(0.5)) invest(b, "LCI", random.money(10_000, 120_000), random.rate(900, 1100));
  },
  medicoSimples(b) {
    const { random } = b;
    add(b, "SALARIO", random.money(24_000, 90_000, 1000));
    const clinic = company(b, { effectiveRate: null, simples: true });
    const monthly = random.money(25_000, 95_000, 500);
    for (let month = 1; month <= 12; month++) {
      const factor = new D(random.int(70, 130)).dividedBy(100);
      add(b, "DIVIDENDOS", monthly.times(factor), { month, payerCode: clinic, transition: false });
    }
    if (random.chance(0.4)) {
      const second = company(b, { effectiveRate: random.rate(800, 1600) });
      dividends(b, second, random.money(60_000, 400_000, 1000), "quarterly");
    }
    invest(
      b,
      "RENDA_FIXA",
      random.money(10_000, 150_000),
      random.rate(1050, 1350),
      random.rate(1500, 2000),
    );
    if (random.chance(0.5)) invest(b, "CRA", random.money(8_000, 70_000), random.rate(1000, 1200));
  },
  rentista(b) {
    const { random } = b;
    add(b, "ALUGUEL", random.money(90_000, 850_000, 1000));
    invest(b, "FII_ISENTO", random.money(20_000, 320_000), random.rate(800, 1100));
    invest(b, "LCI", random.money(30_000, 280_000), random.rate(900, 1100));
    if (random.chance(0.5))
      invest(b, "CRI", random.money(20_000, 200_000), random.rate(1000, 1250));
    invest(
      b,
      "RENDA_FIXA",
      random.money(30_000, 320_000),
      random.rate(1050, 1350),
      random.rate(1500, 2000),
    );
    if (random.chance(0.4))
      invest(b, "DEBENTURE_INCENTIVADA", random.money(15_000, 150_000), random.rate(1000, 1250));
    if (random.chance(0.3))
      invest(b, "POUPANCA", random.money(1_000, 15_000), random.rate(600, 750));
  },
  investidor(b) {
    const { random } = b;
    add(b, "SALARIO", random.money(120_000, 480_000, 1000));
    const gain = random.money(40_000, 1_100_000);
    addTaxed(b, "GANHO_BOLSA", gain, random.rate(1500, 2000));
    if (random.chance(0.7)) add(b, "GANHO_BOLSA_ISENTO", random.money(5_000, 140_000));
    if (random.chance(0.6))
      invest(
        b,
        "EXTERIOR_14754",
        random.money(20_000, 480_000),
        random.rate(600, 1000),
        new D("0.15"),
      );
    // Dividends from listed companies, including a listed bank (45% limit).
    const bank = company(b, { effectiveRate: random.rate(3200, 4400), limitCategory: "BANCO" });
    dividends(b, bank, random.money(20_000, 260_000), "quarterly");
    if (random.chance(0.5)) {
      const listed = company(b, { effectiveRate: random.rate(1800, 3300) });
      dividends(b, listed, random.money(20_000, 300_000), "semiannual");
    }
    addTaxed(b, "JCP", random.money(5_000, 90_000), new D("0.175"));
    invest(b, "FUNDOS", random.money(10_000, 200_000), random.rate(1000, 1400), new D("0.15"));
  },
  aposentado(b) {
    const { random } = b;
    if (random.chance(0.35)) add(b, "MOLESTIA_GRAVE", random.money(90_000, 380_000, 1000));
    else add(b, "APOSENTADORIA", random.money(80_000, 320_000, 1000));
    invest(
      b,
      "RENDA_FIXA",
      random.money(40_000, 450_000),
      random.rate(1050, 1350),
      random.rate(1500, 2000),
    );
    invest(b, "LCA", random.money(20_000, 250_000), random.rate(900, 1100));
    if (random.chance(0.4))
      invest(b, "FII_ISENTO", random.money(10_000, 120_000), random.rate(800, 1100));
    if (random.chance(0.15)) add(b, "DOACAO_HERANCA", random.money(200_000, 2_000_000, 1000));
    if (random.chance(0.3)) add(b, "ALUGUEL", random.money(30_000, 240_000, 1000));
  },
  agroHerdeiro(b) {
    const { random } = b;
    add(b, "ATIVIDADE_RURAL", random.money(150_000, 2_200_000, 1000));
    if (random.chance(0.7)) add(b, "RURAL_ISENTA", random.money(50_000, 600_000, 1000));
    invest(b, "LCA", random.money(30_000, 400_000), random.rate(900, 1100));
    invest(b, "CRA", random.money(20_000, 300_000), random.rate(1000, 1250));
    if (random.chance(0.4))
      invest(b, "CPR", random.money(10_000, 120_000), random.rate(1100, 1400));
    if (random.chance(0.4))
      invest(b, "FIAGRO_ISENTO", random.money(10_000, 160_000), random.rate(900, 1200));
    if (random.chance(0.35)) {
      const farmCo = company(b, { effectiveRate: random.rate(800, 2400) });
      dividends(b, farmCo, random.money(80_000, 1_200_000, 1000), "semiannual");
    }
  },
};

function pickProfile(random: Random): ProfileKey {
  const total = PROFILES.reduce((sum, profile) => sum + profile.weight, 0);
  let roll = random.int(1, total);
  for (const profile of PROFILES) {
    roll -= profile.weight;
    if (roll <= 0) return profile.key;
  }
  return "executivo";
}

export interface SeedOptions {
  clients?: number;
  seed?: number;
  advisors?: number;
  calendarYear?: number;
}

export interface SeedClient extends ClientInput {
  /** Generator profile, for documentation and tests only (not exported to the template). */
  profile: ProfileKey;
}

export function generateClients(options: SeedOptions = {}): SeedClient[] {
  const count = options.clients ?? 200;
  const random = createRandom(options.seed ?? 42);
  const advisors = options.advisors ?? 8;
  const ruleSet = getRuleSet(options.calendarYear ?? DEFAULT_CALENDAR_YEAR);
  let companySequence = 0;

  return Array.from({ length: count }, (_, index): SeedClient => {
    const profile = pickProfile(random);
    const builder: Builder = {
      random,
      incomes: [],
      payers: new Map(),
      positions: [],
      nextCompany: () => `EMP-${String(++companySequence).padStart(4, "0")}`,
    };
    PROFILE_BUILDERS[profile](builder);

    const client: SeedClient = {
      profile,
      clientCode: `CLI-${String(index + 1).padStart(4, "0")}`,
      advisorCode: `ASS-${String(random.int(1, advisors)).padStart(2, "0")}`,
      incomes: builder.incomes,
      payers: [...builder.payers.values()],
      positions: builder.positions,
    };
    if (random.chance(0.85)) client.nickname = random.pick(NICKNAMES);

    // IRPF devido no ajuste: ~80% informed by the "accountant" (estimate with
    // real-life deductions of 0–8%), the rest left blank on purpose.
    if (random.chance(0.8)) {
      const taxable = builder.incomes
        .filter(
          (line) =>
            ruleSet.incomeTypes.find((type) => type.code === line.type)?.regime === "AJUSTE",
        )
        .reduce((sum, line) => sum.plus(line.amount), new D(0));
      const estimate = estimateIrpfAdjustment(taxable, ruleSet);
      const factor = new D(random.int(92, 100)).dividedBy(100);
      client.irpfAdjustmentDue = money(estimate.times(factor));
    }
    return client;
  });
}
