"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { brandingSchema } from "@/lib/premises";
import { type ActionResult, withContext } from "@/server/action";
import { db } from "@/server/db";
import { renameOffice } from "@/server/services/office";
import { updateBranding } from "@/server/services/settings";

export async function saveOfficeAction(input: {
  name: string;
  primaryColor: string | null;
}): Promise<ActionResult> {
  const result = await withContext(async (ctx) => {
    if (input.name.trim() !== ctx.orgName) {
      await renameOffice(db(), ctx, await headers(), input.name);
    }
    await updateBranding(db(), ctx, brandingSchema.parse({ primaryColor: input.primaryColor }));
    return undefined;
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
