"use server";

import { revalidatePath } from "next/cache";
import { type ClientFormOutcome, clientFormSchema } from "@/lib/client-form";
import { type ActionResult, withContext } from "@/server/action";
import { db } from "@/server/db";
import { saveClientForm } from "@/server/services/client-form";

/** Creates (`existingCode` null) or updates a client from the manual form. */
export async function saveClientAction(
  existingCode: string | null,
  form: unknown,
): Promise<ActionResult<ClientFormOutcome>> {
  const result = await withContext((ctx) =>
    saveClientForm(db(), ctx, clientFormSchema.parse(form), existingCode),
  );
  if (result.ok && result.data.saved) revalidatePath("/", "layout");
  return result;
}
