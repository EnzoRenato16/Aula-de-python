import { writeTemplate } from "@raiox/io";
import { getCurrentContext } from "@/server/session";

export async function GET() {
  const ctx = await getCurrentContext();
  if (!ctx) return new Response("Não autorizado", { status: 401 });
  const bytes = await writeTemplate(ctx.calendarYear);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-raiox-irpfm-${ctx.calendarYear}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
