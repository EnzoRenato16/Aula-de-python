"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, withContext } from "@/server/action";
import { assertManager } from "@/server/context";
import { db } from "@/server/db";
import { recalculate } from "@/server/services/calculation";

export async function recalculateAction(): Promise<ActionResult<{ clients: number }>> {
  const result = await withContext(async (ctx) => {
    assertManager(ctx);
    const summary = await recalculate(db(), ctx);
    return { clients: summary.clientCount };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
