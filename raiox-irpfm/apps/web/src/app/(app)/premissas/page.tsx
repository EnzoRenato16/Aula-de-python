import { formatBRL, formatPercent, getRuleSet } from "@raiox/engine";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { PremisesForm } from "@/components/settings/premises-form";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isManager } from "@/server/context";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { requireContext } from "@/server/session";

export const metadata: Metadata = { title: "Premissas" };

export default async function PremisesPage() {
  const ctx = await requireContext();
  const settings = await getSettings(db(), ctx.orgId);
  const ruleSet = getRuleSet(settings.calendarYear);
  const { monthlyWithholding, minimumTax, reducer } = ruleSet;
  const pending = ruleSet.rules.filter((rule) => rule.status === "PENDENTE").length;

  const parameters: { label: string; value: string; rules: string }[] = [
    {
      label: "Retenção mensal sobre dividendos",
      value: `${formatPercent(monthlyWithholding.rate, 0)} do total pago pela empresa no mês, se passar de ${formatBRL(monthlyWithholding.threshold)}`,
      rules: "R-6A-01 · R-6A-03",
    },
    {
      label: "Tributação mínima: quem está sujeito",
      value: `Rendimentos do ano acima de ${formatBRL(minimumTax.threshold)}`,
      rules: "R-16A-01",
    },
    {
      label: "Alíquota mínima",
      value: `De 0% a ${formatPercent(minimumTax.maxRate, 0)}, linear entre ${formatBRL(minimumTax.threshold)} e ${formatBRL(minimumTax.fullRateFrom)}`,
      rules: "R-16A-10 · R-16A-11 · R-16A-12",
    },
    {
      label: "Limite do redutor (alíquota da PJ + IRPFM)",
      value: `Geral ${formatPercent(reducer.limits.GERAL, 0)} · seguradoras e financeiras ${formatPercent(reducer.limits.FINANCEIRA, 0)} · bancos ${formatPercent(reducer.limits.BANCO, 0)}`,
      rules: "R-16B-02",
    },
  ];

  return (
    <>
      <PageHeader
        title="Premissas"
        description={`Regras do ano-calendário ${ruleSet.calendarYear}, versão ${ruleSet.version} de ${formatDate(`${ruleSet.publishedAt}T12:00:00Z`)}. Toda regra tem fonte; ${pending} dependem de regulamentação e seguem as escolhas abaixo.`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title="Como o escritório calcula"
          description="Vale para o painel, as fichas, os cenários e os PDFs."
        >
          <PremisesForm
            conservative={settings.conservative}
            choices={settings.choices}
            editable={isManager(ctx)}
          />
        </Panel>
        <Panel title={`Parâmetros de ${ruleSet.calendarYear}`}>
          <dl className="grid gap-4 text-sm">
            {parameters.map((parameter) => (
              <div key={parameter.label}>
                <dt className="text-xs text-muted-foreground">{parameter.label}</dt>
                <dd className="mt-0.5">{parameter.value}</dd>
                <dd className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {parameter.rules}
                </dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-6 text-xs font-semibold text-muted-foreground uppercase">Fontes</h3>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {ruleSet.sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-6" title="Regras" description="Mesmo conteúdo de docs/REGRAS.md.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-normal">ID</th>
                <th className="px-3 py-2 text-left font-normal">Regra</th>
                <th className="px-3 py-2 text-left font-normal">Base legal</th>
                <th className="py-2 pl-3 text-left font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {ruleSet.rules.map((rule) => (
                <tr
                  key={rule.id}
                  id={rule.id}
                  className={cn(
                    "scroll-mt-20 border-b align-top last:border-0 target:bg-attention-bg",
                    rule.status === "PENDENTE" && "bg-muted/40",
                  )}
                >
                  <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{rule.id}</td>
                  <td className="px-3 py-2">
                    {rule.title}
                    {rule.pendingNote ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{rule.pendingNote}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{rule.legalRef}</td>
                  <td className="py-2 pl-3 text-xs whitespace-nowrap">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5",
                        rule.status === "PENDENTE"
                          ? "border-attention/40 text-attention"
                          : "border-refund/30 text-refund",
                      )}
                    >
                      {rule.status === "PENDENTE" ? "Pendente" : "Confirmada"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
