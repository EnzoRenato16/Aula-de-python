"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, withContext } from "@/server/action";
import { db } from "@/server/db";
import { recalculate } from "@/server/services/calculation";
import {
  confirmImport,
  discardImport,
  ImportError,
  type ImportMode,
  previewImport,
} from "@/server/services/imports";

export async function uploadAction(
  _previous: ActionResult<string> | null,
  formData: FormData,
): Promise<ActionResult<string>> {
  const result = await withContext(async (ctx) => {
    const file = formData.get("arquivo");
    if (!(file instanceof File) || file.size === 0)
      throw new ImportError("Escolha um arquivo .xlsx ou .csv.");
    return previewImport(db(), ctx, {
      name: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  });
  if (result.ok) redirect(`/importar/${result.data}`);
  return result;
}

export async function confirmAction(
  id: string,
  mode: ImportMode,
  acceptErrors: boolean,
): Promise<ActionResult<{ clients: number; removed: number }>> {
  const result = await withContext(async (ctx) => {
    const applied = await confirmImport(db(), ctx, id, { mode, acceptErrors });
    await recalculate(db(), ctx);
    return applied;
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function discardAction(id: string): Promise<ActionResult<undefined>> {
  const result = await withContext(async (ctx) => {
    await discardImport(db(), ctx, id);
    return undefined;
  });
  if (result.ok) revalidatePath("/importar");
  return result;
}
