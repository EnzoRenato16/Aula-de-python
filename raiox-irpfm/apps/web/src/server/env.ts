import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres"),
  BETTER_AUTH_URL: z.string().url(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Validated environment, read lazily so `next build` does not need secrets.
 * Fails fast with a readable message on the first request otherwise.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Variáveis de ambiente inválidas:\n${problems.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
