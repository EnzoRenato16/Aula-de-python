import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Database schema. Column names are snake_case in Postgres (drizzle `casing`)
 * and camelCase in TypeScript. Money is numeric(16,2) and rates numeric(12,10):
 * the pg driver returns them as strings, so they never become floats.
 */

const money = (name?: string) =>
  name ? numeric(name, { precision: 16, scale: 2 }) : numeric({ precision: 16, scale: 2 });
const rate = () => numeric({ precision: 12, scale: 10 });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Better Auth (fields must match better-auth's expected schema; see test)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text(),
  },
  (table) => [index().on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  createdAt: createdAt(),
  metadata: text(),
});

export const member = pgTable(
  "member",
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().notNull(),
    createdAt: createdAt(),
    /** Links an advisor (role "member") to the clients with this codigo_assessor. */
    advisorCode: text(),
  },
  (table) => [uniqueIndex().on(table.organizationId, table.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text(),
    status: text().notNull().default("pending"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    inviterId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    advisorCode: text(),
  },
  (table) => [index().on(table.organizationId)],
);

// ---------------------------------------------------------------------------
// Product tables (every one carries org_id)
// ---------------------------------------------------------------------------

const orgId = () =>
  text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const orgSettings = pgTable("org_settings", {
  orgId: orgId().primaryKey(),
  calendarYear: integer().notNull().default(2026),
  conservative: boolean().notNull().default(false),
  /** Partial<PendingChoices> of the engine. */
  choices: jsonb().notNull().default(sql`'{}'::jsonb`),
  primaryColor: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const company = pgTable(
  "company",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgId(),
    code: text().notNull(),
    effectiveRate: rate(),
    limitCategory: text().notNull().default("GERAL"),
    simplesNacional: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex().on(table.orgId, table.code)],
);

export const client = pgTable(
  "client",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgId(),
    calendarYear: integer().notNull(),
    code: text().notNull(),
    nickname: text(),
    advisorCode: text(),
    irpfAdjustmentDue: money(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex().on(table.orgId, table.calendarYear, table.code),
    index().on(table.orgId, table.advisorCode),
  ],
);

export const incomeLine = pgTable(
  "income_line",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgId(),
    clientId: uuid()
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    type: text().notNull(),
    month: smallint(),
    amount: money().notNull(),
    taxWithheld: money(),
    companyCode: text(),
    transition: boolean().notNull().default(false),
    /** IMPORT | MANUAL (future: PDF_IA, CONTADOR, CORRETORA). */
    source: text().notNull().default("IMPORT"),
    importBatchId: uuid(),
  },
  (table) => [index().on(table.clientId)],
);

export const position = pgTable(
  "position",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgId(),
    clientId: uuid()
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    assetClass: text().notNull(),
    balance: money().notNull(),
    expectedAnnualRate: rate().notNull(),
    taxRate: rate(),
  },
  (table) => [uniqueIndex().on(table.clientId, table.assetClass)],
);

export const importBatch = pgTable(
  "import_batch",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgId(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    fileName: text().notNull(),
    fileSha256: text().notNull(),
    calendarYear: integer().notNull(),
    /** PREVIEW | CONFIRMED | DISCARDED */
    status: text().notNull().default("PREVIEW"),
    /** MERGE (replace only the clients in the file) | REPLACE (whole base) */
    mode: text(),
    stats: jsonb().notNull(),
    issues: jsonb().notNull(),
    /** Parsed ClientInput[]; cleared once the batch is confirmed or discarded. */
    payload: jsonb(),
    createdAt: createdAt(),
    decidedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index().on(table.orgId, table.createdAt)],
);

export const calculationRun = pgTable(
  "calculation_run",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgId(),
    calendarYear: integer().notNull(),
    ruleSetVersion: text().notNull(),
    conservative: boolean().notNull(),
    choices: jsonb().notNull(),
    clientCount: integer().notNull(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.orgId, table.calendarYear, table.createdAt)],
);

export const clientResult = pgTable(
  "client_result",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => calculationRun.id, { onDelete: "cascade" }),
    orgId: orgId(),
    clientId: uuid()
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    clientCode: text().notNull(),
    nickname: text(),
    advisorCode: text(),
    position: integer().notNull(),
    score: numeric({ precision: 5, scale: 1 }).notNull(),
    totalIncome: money().notNull(),
    base: money().notNull(),
    rate: rate().notNull(),
    grossMinimumTax: money().notNull(),
    minimumTaxDue: money().notNull(),
    withholding: money().notNull(),
    finalBalance: money().notNull(),
    amountToPay: money().notNull(),
    amountToRefund: money().notNull(),
    effectiveTaxRate: rate().notNull(),
    band: text().notNull(),
    alertCodes: text().array().notNull(),
    /** Full serialized ClientResult (trail, alerts, marginal rates). */
    result: jsonb().notNull(),
  },
  (table) => [
    index().on(table.orgId, table.runId, table.position),
    uniqueIndex().on(table.runId, table.clientId),
  ],
);

export const scenario = pgTable(
  "scenario",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: orgId(),
    clientId: uuid()
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    name: text().notNull(),
    operations: jsonb().notNull(),
    comparison: jsonb().notNull(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.clientId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    orgId: orgId(),
    actorUserId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    /** Never personal data: codes, counts and ids only. */
    metadata: jsonb().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.orgId, table.createdAt)],
);
