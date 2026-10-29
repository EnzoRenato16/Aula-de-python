import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth.ts";
import { isManager, loadContext, type OrgContext } from "./context.ts";
import { db } from "./db/index.ts";

/** Session of the current request (memoized per request). */
export const getSession = cache(async () => auth().api.getSession({ headers: await headers() }));

/** Organization context of the current request, or null. */
export const getCurrentContext = cache(async (): Promise<OrgContext | null> => {
  const session = await getSession();
  if (!session) return null;
  return loadContext(db(), session.user.id, session.session.activeOrganizationId ?? null);
});

/** For pages and actions of the app area: redirects when not signed in or without an office. */
export async function requireContext(): Promise<OrgContext> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/criar-escritorio");
  return ctx;
}

/** For manager-only pages: advisors are sent back to the dashboard. */
export async function requireManagerContext(): Promise<OrgContext> {
  const ctx = await requireContext();
  if (!isManager(ctx)) redirect("/painel");
  return ctx;
}
