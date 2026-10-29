import { Client } from "pg";
import { runMigrations } from "../db/migrate.ts";

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://raiox:raiox_dev_only@localhost:5432/raiox_test";

/**
 * Recreates the test schema from the versioned migrations before the run, so
 * the tests also prove the migrations apply on an empty database.
 */
export default async function setup(): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Banco de teste indisponível em ${TEST_DATABASE_URL}. Rode "docker compose up -d" (ou defina DATABASE_URL_TEST).\n${String(error)}`,
    );
  }
  await client.query(
    "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
  );
  await client.end();
  await runMigrations(TEST_DATABASE_URL);
  process.env.DATABASE_URL_TEST = TEST_DATABASE_URL;
}
