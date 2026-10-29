"use server";

import { revalidatePath } from "next/cache";
import { premisesSchema } from "@/lib/premises";
import { type ActionResult, withContext } from "@/server/action";
import { db } from "@/server/db";
import { recalculate } from "@/server/services/calculation";
import { updatePremises } from "@/server/services/settings";

/** Saves the premises and recalculates the office with them. */
export async function savePremisesAction(
  input: unknown,
): Promise<ActionResult<{ clients: number }>> {
  const result = await withContext(async (ctx) => {
    await updatePremises(db(), ctx, premisesSchema.parse(input));
    const summary = await recalculate(db(), ctx);
    return { clients: summary.clientCount };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
