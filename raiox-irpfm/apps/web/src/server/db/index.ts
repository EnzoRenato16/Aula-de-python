import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "../env.ts";
import * as schema from "./schema.ts";

export type Database = NodePgDatabase<typeof schema>;
/** A database or an open transaction: what services receive. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { raioxPool?: Pool; raioxDb?: Database };

export function createDatabase(url: string): { pool: Pool; db: Database } {
  const pool = new Pool({ connectionString: url, max: 10 });
  return { pool, db: drizzle(pool, { schema, casing: "snake_case" }) };
}

/** Process-wide database (reused across hot reloads in development). */
export function db(): Database {
  if (!globalForDb.raioxDb) {
    const created = createDatabase(env().DATABASE_URL);
    globalForDb.raioxPool = created.pool;
    globalForDb.raioxDb = created.db;
  }
  return globalForDb.raioxDb;
}

export { schema };
