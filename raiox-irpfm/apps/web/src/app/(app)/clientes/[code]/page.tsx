import { D, getRuleSet, monthName, serializeResult } from "@raiox/engine";
import { DISCLAIMER, summarySentences } from "@raiox/report";
import { FileDown, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { AlertList } from "@/components/client/alert-list";
import { CalculationTrail } from "@/components/client/calculation-trail";
import { DeleteClientButton } from "@/components/client/delete-client-button";
import { MarginalChart } from "@/components/client/marginal-chart";
import { ScenarioSimulator } from "@/components/client/scenario-simulator";
import { WaterfallChart } from "@/components/client/waterfall-chart";
import { KpiStrip } from "@/components/dashboard/kpis";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BAND_LABEL } from "@/lib/alerts";
import { brl, pct } from "@/lib/format";
import { waterfallSteps } from "@/lib/waterfall";
import { isManager, NotFoundError } from "@/server/context";
import { db } from "@/server/db";
import { bandOf } from "@/server/services/calculation";
import { type ClientDetail, getClientDetail } from "@/server/services/client-detail";
import { listScenarios } from "@/server/services/scenarios";
import { requireContext } from "@/server/session";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  return { title: `Cliente ${decodeURIComponent(code)}` };
}

const IRPF_SOURCE = {
  INFORMADO: "informado pelo contador",
  ESTIMADO: "estimado (tabela com desconto simplificado)",
  AUSENTE: "não informado, considerado zero",
} as const;

const REDUCER_STATUS = {
  CALCULADO: "calculado",
  SEM_ALIQUOTA_PJ: "sem alíquota da PJ: redutor zero",
  NAO_SE_APLICA: "não se aplica",
} as const;

export default async function ClientPage({ params }: Params) {
  const ctx = await requireContext();
  const code = decodeURIComponent((await params).code);
  let detail: ClientDetail;
  try {
    detail = await getClientDetail(db(), ctx, code);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const manager = isManager(ctx);
  const ruleSet = getRuleSet(detail.settings.calendarYear);
  const { input, result, ranking } = detail;
  const saved = await listScenarios(db(), ctx, detail.id);

  const description = [
    input.nickname,
    input.advisorCode ? `assessor ${input.advisorCode}` : "sem assessor",
    ranking ? `nº ${ranking.position} de ${ranking.of} no ranking (score ${ranking.score})` : null,
    `regras ${ruleSet.version}`,
    detail.settings.conservative ? "modo conservador" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const header = (
    <PageHeader
      title={`Cliente ${code}`}
      description={description}
      actions={
        <>
          {result ? (
            <Button asChild variant="outline">
              <a href={`/api/clientes/${encodeURIComponent(code)}/pdf`}>
                <FileDown className="size-4" /> PDF
              </a>
            </Button>
          ) : null}
          {manager ? (
            <Button asChild variant="outline">
              <Link href={`/clientes/${encodeURIComponent(code)}/editar`}>
                <Pencil className="size-4" /> Editar
              </Link>
            </Button>
          ) : null}
          {manager ? <DeleteClientButton code={code} /> : null}
        </>
      }
    />
  );

  if (!result) {
    return (
      <>
        {header}
        <div className="rounded-lg border border-pay/30 bg-pay/8 px-5 py-4 text-sm text-pay">
          <p className="font-medium">Não foi possível calcular este cliente.</p>
          <p className="mt-1">{detail.calculationError}</p>
          {manager ? <p className="mt-1">Corrija os dados em Editar.</p> : null}
        </div>
      </>
    );
  }

  const serialized = serializeResult(result);
  const steps = waterfallSteps(serialized);
  const band = bandOf(result);
  const balance = result.finalBalance;
  const classes = ruleSet.incomeTypes
    .filter((type) => type.investable)
    .map((type) => ({ code: type.code, label: type.label }));
  const payers = [
    ...new Set(
      input.incomes
        .filter((line) => line.type === "DIVIDENDOS" && line.transition !== true && line.payerCode)
        .map((line) => line.payerCode as string),
    ),
  ].sort();
  const positions = (input.positions ?? []).map((position) => ({
    assetClass: position.assetClass,
    balance: new D(position.balance).toFixed(2),
    expectedAnnualRate: new D(position.expectedAnnualRate).toString(),
  }));
  const withholdingEntries = serialized.withholding.entries.filter(
    (entry) =>
      new D(entry.subjectAmount).greaterThan(0) || new D(entry.transitionAmount).greaterThan(0),
  );

  return (
    <>
      {header}
      <KpiStrip
        items={[
          { label: "Rendimentos do ano", value: brl(serialized.totalIncome) },
          { label: "Base do IRPFM", value: brl(serialized.base), note: BAND_LABEL[band] },
          {
            label: "IRPFM devido",
            value: brl(serialized.minimumTaxDue),
            note: `alíquota ${pct(serialized.rate, 2)} · bruto ${brl(serialized.grossMinimumTax)}`,
          },
          {
            label: "Retenção no ano",
            value: brl(serialized.withholding.total),
            note: "antecipação do IRPFM",
          },
          {
            label: "Saldo na declaração",
            value: brl(balance.abs().toFixed(2)),
            note: balance.isNegative() ? "a restituir" : balance.isZero() ? "sem saldo" : "a pagar",
            tone: balance.isNegative() ? "refund" : balance.isZero() ? "default" : "pay",
          },
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Resumo da simulação">
          <div className="grid gap-2 text-sm">
            {summarySentences(result).map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
            <p className="text-muted-foreground">
              Carga efetiva total sobre os rendimentos: {pct(serialized.effectiveTaxRate, 2)}. IRPF
              do ajuste {IRPF_SOURCE[result.deductions.irpfSource]}.
            </p>
          </div>
        </Panel>
        <Panel title="Alertas">
          <AlertList alerts={serialized.alerts} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Do IRPFM bruto ao saldo"
          description="Cada dedução reduz o IRPFM até zero; a retenção sobre dividendos é antecipação e pode gerar restituição."
        >
          {steps.length > 0 ? (
            <WaterfallChart steps={steps} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem IRPFM e sem retenção: não há saldo a pagar nem a restituir.
            </p>
          )}
        </Panel>
        <Panel
          title="Alíquota marginal por classe"
          description={`Quanto de imposto a mais (IR próprio, IRPF e IRPFM) para cada ${brl(ruleSet.marginalStep.toFixed(2))} a mais de rendimento da classe.`}
        >
          {serialized.marginalRates.length > 0 ? (
            <MarginalChart
              rates={serialized.marginalRates}
              step={ruleSet.marginalStep.toFixed(2)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sem classes para comparar.</p>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-6"
        title="Cenários"
        description="Simulação com as premissas do escritório. Nada é alterado na base do cliente."
      >
        <ScenarioSimulator
          clientCode={code}
          classes={classes}
          positions={positions}
          payers={payers}
          threshold={ruleSet.monthlyWithholding.threshold.toFixed(2)}
          saved={saved.map((item) => ({
            id: item.id,
            name: item.name,
            operations: item.operations,
            netIncomeDelta: item.netIncomeDelta,
            createdAt: item.createdAt.toISOString(),
            canDelete: manager || item.mine,
          }))}
        />
      </Panel>

      <Tabs defaultValue="trilha" className="mt-6">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="trilha">Trilha de cálculo</TabsTrigger>
          <TabsTrigger value="rendimentos">Rendimentos</TabsTrigger>
          <TabsTrigger value="retencao">Retenção mensal</TabsTrigger>
          <TabsTrigger value="redutor">Redutor</TabsTrigger>
        </TabsList>
        <TabsContent value="trilha">
          <Panel
            title="Trilha de cálculo"
            description="Cada passo com a fórmula, as regras de docs/REGRAS.md e o artigo da lei."
          >
            <CalculationTrail trail={serialized.trail} />
          </Panel>
        </TabsContent>
        <TabsContent value="rendimentos">
          <Panel title="Rendimentos por tipo">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-2 text-left font-normal">Tipo</th>
                    <th className="px-2 py-2 text-right font-normal">Valor</th>
                    <th className="px-2 py-2 text-right font-normal">IR da linha</th>
                    <th className="py-2 pl-2 text-left font-normal">Na base do IRPFM</th>
                  </tr>
                </thead>
                <tbody>
                  {serialized.byType.map((type) => (
                    <tr key={type.type} className="border-b last:border-0">
                      <td className="py-2 pr-2">{type.label}</td>
                      <td className="px-2 py-2 text-right">{brl(type.amount)}</td>
                      <td className="px-2 py-2 text-right">
                        {brl(type.tax)}
                        {new D(type.taxEstimated).greaterThan(0) ? (
                          <span className="block text-xs text-attention">
                            {brl(type.taxEstimated)} estimado
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pl-2">
                        {type.inBase ? (
                          "sim"
                        ) : (
                          <>
                            não{" "}
                            {type.exclusionRuleId ? (
                              <Link
                                href={`/premissas#${type.exclusionRuleId}`}
                                className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                              >
                                {type.exclusionRuleId}
                              </Link>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="retencao">
          <Panel
            title="Retenção mês a mês"
            description={`${pct(ruleSet.monthlyWithholding.rate.toString(), 0)} sobre o total pago pela empresa no mês, quando passa de ${brl(ruleSet.monthlyWithholding.threshold.toFixed(2))}; os lucros da transição ficam fora.`}
          >
            {withholdingEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dividendos no ano.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-2 text-left font-normal">Empresa</th>
                      <th className="px-2 py-2 text-left font-normal">Mês</th>
                      <th className="px-2 py-2 text-right font-normal">Sujeito à retenção</th>
                      <th className="px-2 py-2 text-right font-normal">Transição</th>
                      <th className="py-2 pl-2 text-right font-normal">Retido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withholdingEntries.map((entry) => (
                      <tr
                        key={`${entry.payerCode}-${entry.month}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-2 font-mono text-xs">{entry.payerCode}</td>
                        <td className="px-2 py-2">{monthName(entry.month)}</td>
                        <td className="px-2 py-2 text-right">{brl(entry.subjectAmount)}</td>
                        <td className="px-2 py-2 text-right">{brl(entry.transitionAmount)}</td>
                        <td className="py-2 pl-2 text-right">{brl(entry.withheld)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="redutor">
          <Panel title="Redutor por empresa (art. 16-B)">
            {serialized.reducerByPayer.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem lucros e dividendos na base.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-2 text-left font-normal">Empresa</th>
                      <th className="px-2 py-2 text-right font-normal">Dividendos</th>
                      <th className="px-2 py-2 text-right font-normal">Alíquota da PJ</th>
                      <th className="px-2 py-2 text-right font-normal">Limite</th>
                      <th className="px-2 py-2 text-right font-normal">Redutor</th>
                      <th className="py-2 pl-2 text-left font-normal">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serialized.reducerByPayer.map((entry) => (
                      <tr key={entry.payerCode} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-mono text-xs">{entry.payerCode}</td>
                        <td className="px-2 py-2 text-right">{brl(entry.dividends)}</td>
                        <td className="px-2 py-2 text-right">{pct(entry.pjEffectiveRate, 2)}</td>
                        <td className="px-2 py-2 text-right">{pct(entry.limit, 0)}</td>
                        <td className="px-2 py-2 text-right">{brl(entry.value)}</td>
                        <td className="py-2 pl-2 text-xs text-muted-foreground">
                          {REDUCER_STATUS[entry.status]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-xs text-muted-foreground">{DISCLAIMER}</p>
    </>
  );
}
