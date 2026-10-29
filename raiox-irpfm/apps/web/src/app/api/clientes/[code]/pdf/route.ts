import { join } from "node:path";
import { calculateClient, EngineInputError } from "@raiox/engine";
import { renderClientReport } from "@raiox/report";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { organization } from "@/server/db/schema";
import { audit } from "@/server/services/audit";
import { calculationOptions } from "@/server/services/calculation";
import { loadClientInputs } from "@/server/services/clients";
import { getSettings } from "@/server/services/settings";
import { getCurrentContext } from "@/server/session";

/**
 * WOFF files of IBM Plex Sans, a dependency of this app. Resolved from the app
 * folder at runtime: the bundler rewrites module resolution inside packages.
 */
const FONTS_DIR = join(
  process.cwd(),
  "node_modules",
  "@ibm",
  "plex-sans",
  "fonts",
  "complete",
  "woff",
);

/** One-page PDF of a client, recalculated with the office's current premises. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const ctx = await getCurrentContext();
  if (!ctx) return new Response("Não autorizado", { status: 401 });
  const { code } = await params;
  const [stored] = await loadClientInputs(db(), ctx, { scope: "visible", codes: [code] });
  if (!stored) return new Response("Cliente não encontrado", { status: 404 });

  const settings = await getSettings(db(), ctx.orgId);
  const [org] = await db()
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, ctx.orgId));
  let result: ReturnType<typeof calculateClient>;
  try {
    result = calculateClient(stored.input, calculationOptions(settings));
  } catch (error) {
    if (!(error instanceof EngineInputError)) throw error;
    return new Response(`Dados do cliente incompletos: ${error.message}`, { status: 422 });
  }
  const pdf = await renderClientReport(result, {
    fontsDir: FONTS_DIR,
    brand: {
      officeName: org?.name ?? ctx.orgName,
      ...(settings.primaryColor ? { primaryColor: settings.primaryColor } : {}),
    },
  });
  await audit(db(), ctx, "pdf.download", "client", stored.id, { clientCode: code });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="raiox-${code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
