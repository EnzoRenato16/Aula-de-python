"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type ActionResult, withContext } from "@/server/action";
import { db } from "@/server/db";
import { env } from "@/server/env";
import {
  cancelInvitation,
  changeRole,
  inviteMember,
  removeMember,
  roleSchema,
  setAdvisorCode,
} from "@/server/services/team";

async function done<T>(result: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const settled = await result;
  if (settled.ok) revalidatePath("/equipe");
  return settled;
}

export async function inviteAction(input: unknown): Promise<ActionResult<{ link: string }>> {
  return done(
    withContext(async (ctx) => {
      const id = await inviteMember(db(), ctx, await headers(), input);
      return { link: `${env().BETTER_AUTH_URL.replace(/\/+$/, "")}/convite/${id}` };
    }),
  );
}

export async function cancelInvitationAction(id: string): Promise<ActionResult> {
  return done(
    withContext(async (ctx) => {
      await cancelInvitation(db(), ctx, await headers(), id);
      return undefined;
    }),
  );
}

export async function removeMemberAction(memberId: string): Promise<ActionResult> {
  return done(
    withContext(async (ctx) => {
      await removeMember(db(), ctx, await headers(), memberId);
      return undefined;
    }),
  );
}

export async function changeRoleAction(memberId: string, role: string): Promise<ActionResult> {
  return done(
    withContext(async (ctx) => {
      await changeRole(db(), ctx, await headers(), memberId, roleSchema.parse(role));
      return undefined;
    }),
  );
}

export async function setAdvisorCodeAction(memberId: string, code: string): Promise<ActionResult> {
  return done(
    withContext(async (ctx) => {
      await setAdvisorCode(db(), ctx, memberId, code.trim() === "" ? null : code);
      return undefined;
    }),
  );
}
