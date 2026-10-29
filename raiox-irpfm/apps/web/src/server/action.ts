import { ScenarioError } from "@raiox/engine";
import { ZodError } from "zod";
import { ForbiddenError, NotFoundError, type OrgContext } from "./context.ts";
import { ImportError } from "./services/imports.ts";
import { TeamError } from "./services/team.ts";
import { requireContext } from "./session.ts";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Errors whose message is written for the user and can be shown as is. */
function userMessage(error: unknown): string | null {
  if (
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ImportError ||
    error instanceof ScenarioError ||
    error instanceof TeamError
  ) {
    return error.message;
  }
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Dados inválidos.";
  return null;
}

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

/**
 * Runs a server action with the caller's organization context and turns
 * expected errors into messages. Unexpected errors are logged without
 * request data (LGPD) and shown as a generic message.
 */
export async function withContext<T>(
  fn: (ctx: OrgContext) => Promise<T>,
): Promise<ActionResult<T>> {
  const ctx = await requireContext();
  try {
    return { ok: true, data: await fn(ctx) };
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    const message = userMessage(error);
    if (message) return { ok: false, error: message };
    console.error(
      JSON.stringify({
        level: "error",
        event: "action_failed",
        org: ctx.orgId,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return {
      ok: false,
      error: "Algo deu errado. Tente de novo; se persistir, fale com o suporte.",
    };
  }
}
