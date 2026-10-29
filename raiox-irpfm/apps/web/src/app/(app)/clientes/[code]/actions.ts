"use server";

import { revalidatePath } from "next/cache";
import { scenarioFormSchema } from "@/lib/scenario-form";
import { type ActionResult, withContext } from "@/server/action";
import { assertManager } from "@/server/context";
import { db } from "@/server/db";
import { recalculate } from "@/server/services/calculation";
import { deleteClient } from "@/server/services/clients";
import {
  deleteScenario,
  type ScenarioView,
  saveScenario,
  simulateForm,
} from "@/server/services/scenarios";

export async function simulateAction(
  code: string,
  form: unknown,
): Promise<ActionResult<ScenarioView>> {
  return withContext((ctx) => simulateForm(db(), ctx, code, scenarioFormSchema.parse(form)));
}

export async function saveScenarioAction(
  code: string,
  form: unknown,
): Promise<ActionResult<{ id: string }>> {
  const result = await withContext(async (ctx) => ({
    id: await saveScenario(db(), ctx, code, scenarioFormSchema.parse(form)),
  }));
  if (result.ok) revalidatePath(`/clientes/${code}`);
  return result;
}

export async function deleteScenarioAction(code: string, id: string): Promise<ActionResult> {
  const result = await withContext(async (ctx) => {
    await deleteScenario(db(), ctx, id);
    return undefined;
  });
  if (result.ok) revalidatePath(`/clientes/${code}`);
  return result;
}

export async function deleteClientAction(code: string): Promise<ActionResult> {
  const result = await withContext(async (ctx) => {
    assertManager(ctx);
    await deleteClient(db(), ctx, code);
    await recalculate(db(), ctx);
    return undefined;
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
