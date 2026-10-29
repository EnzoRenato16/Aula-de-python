import { getAuthTables } from "better-auth/db";
import { organization } from "better-auth/plugins";
import { getTableColumns, type Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "./db/schema.ts";

describe("esquema do Better Auth", () => {
  it("toda tabela e todo campo que o Better Auth espera existem no esquema Drizzle", () => {
    const advisorCode = { advisorCode: { type: "string", required: false } } as const;
    const tables = getAuthTables({
      emailAndPassword: { enabled: true },
      plugins: [
        organization({
          schema: {
            member: { additionalFields: advisorCode },
            invitation: { additionalFields: advisorCode },
          },
        }),
      ],
    } as never);
    const missing: string[] = [];
    for (const definition of Object.values(tables)) {
      const table = (schema as Record<string, unknown>)[definition.modelName] as Table | undefined;
      if (!table) {
        missing.push(`tabela ${definition.modelName}`);
        continue;
      }
      const columns = getTableColumns(table);
      for (const field of [...Object.keys(definition.fields), "id"]) {
        if (!(field in columns)) missing.push(`${definition.modelName}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
