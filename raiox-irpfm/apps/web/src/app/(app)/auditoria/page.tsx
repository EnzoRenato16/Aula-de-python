import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { formatDateTime } from "@/lib/format";
import { db } from "@/server/db";
import { type AuditAction, listAudit } from "@/server/services/audit";
import { requireManagerContext } from "@/server/session";

export const metadata: Metadata = { title: "Auditoria" };

const LIMIT = 300;

const ACTION_LABEL: Record<AuditAction, string> = {
  "import.preview": "Pré-visualizou importação",
  "import.confirm": "Confirmou importação",
  "import.discard": "Descartou importação",
  "client.create": "Cadastrou cliente",
  "client.update": "Editou cliente",
  "client.delete": "Excluiu cliente",
  "calculation.run": "Recalculou a base",
  "settings.update": "Mudou premissas ou cor do PDF",
  "scenario.save": "Salvou cenário",
  "scenario.delete": "Excluiu cenário",
  "team.invite": "Convidou membro",
  "team.cancel_invite": "Cancelou convite",
  "team.role": "Mudou papel de membro",
  "team.advisor_code": "Mudou código de assessor",
  "team.remove": "Removeu membro",
  "pdf.download": "Baixou PDF",
  "export.ranking": "Exportou ranking",
  "office.update": "Renomeou o escritório",
};

const KEY_LABEL: Record<string, string> = {
  clientCode: "cliente",
  clients: "clientes",
  skipped: "não calculados",
  removed: "removidos",
  mode: "modo",
  acceptedErrors: "aceitou linhas com erro",
  conservative: "modo conservador",
  choices: "escolhas alteradas",
  primaryColor: "cor",
  errors: "erros",
  warnings: "avisos",
  operations: "operações",
  incomeLines: "linhas de rendimento",
  role: "papel",
  advisorCode: "código de assessor",
  rows: "linhas",
  name: "nome alterado",
};

const ROLE_TEXT: Record<string, string> = { owner: "dono", admin: "admin", member: "assessor" };

function describe(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => {
      const label = KEY_LABEL[key] ?? key;
      if (typeof value === "boolean") return `${label}: ${value ? "sim" : "não"}`;
      if (key === "role" && typeof value === "string")
        return `${label}: ${ROLE_TEXT[value] ?? value}`;
      if (key === "mode") return `${label}: ${value === "REPLACE" ? "substituir" : "mesclar"}`;
      return `${label}: ${String(value)}`;
    })
    .join(" · ");
}

export default async function AuditPage() {
  const ctx = await requireManagerContext();
  const entries = await listAudit(db(), ctx, LIMIT);
  return (
    <>
      <PageHeader
        title="Auditoria"
        description={`Quem fez o quê, em ordem do mais recente. Registra códigos e contagens, nunca dados pessoais de clientes. Mostrando até ${LIMIT} registros.`}
      />
      {entries.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum registro ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 text-left font-normal">Quando</th>
                <th className="px-4 py-2 text-left font-normal">Quem</th>
                <th className="px-4 py-2 text-left font-normal">O quê</th>
                <th className="px-4 py-2 text-left font-normal">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b align-top last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-2">{entry.actorName ?? "usuário removido"}</td>
                  <td className="px-4 py-2">
                    {ACTION_LABEL[entry.action as AuditAction] ?? entry.action}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {describe(entry.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
