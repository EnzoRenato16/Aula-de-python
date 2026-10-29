import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./index.ts";

/** Applies the versioned SQL migrations in ./drizzle. Usage: pnpm db:migrate */
export async function runMigrations(url: string): Promise<void> {
  const { pool, db } = createDatabase(url);
  try {
    await migrate(db, { migrationsFolder: new URL("../../../drizzle", import.meta.url).pathname });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL.");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("Migrações aplicadas.");
}
