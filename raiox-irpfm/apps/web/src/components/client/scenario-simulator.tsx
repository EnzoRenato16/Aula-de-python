"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { D, type IncomeTypeCode } from "@raiox/engine";
import { FlaskConical, Plus, Save, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  deleteScenarioAction,
  saveScenarioAction,
  simulateAction,
} from "@/app/(app)/clientes/[code]/actions";
import { Field, invalidProps } from "@/components/app/field";
import { CalculationTrail } from "@/components/client/calculation-trail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { brl, formatDate, pct, signedBrl, signedPoints } from "@/lib/format";
import {
  MAX_OPERATIONS,
  OPERATION_LABEL,
  type OperationForm,
  type OperationKind,
  type ScenarioForm,
  scenarioFormSchema,
} from "@/lib/scenario-form";
import { cn } from "@/lib/utils";
import type { ScenarioView } from "@/server/services/scenarios";

export interface ClassOption {
  code: IncomeTypeCode;
  label: string;
}

export interface PositionHint {
  assetClass: IncomeTypeCode;
  balance: string;
  expectedAnnualRate: string;
}

export interface SavedScenarioItem {
  id: string;
  name: string;
  operations: OperationForm[];
  netIncomeDelta: string;
  createdAt: string;
  canDelete: boolean;
}

interface SimulatorProps {
  clientCode: string;
  classes: ClassOption[];
  positions: PositionHint[];
  /** Companies with dividends outside the transition rule in the year. */
  payers: string[];
  /** Monthly withholding threshold, to explain the "up to the limit" schedule. */
  threshold: string;
  saved: SavedScenarioItem[];
}

function balanceText(value: string): string {
  const balance = new D(value);
  if (balance.isZero()) return brl("0.00");
  return balance.isNegative()
    ? `${brl(balance.abs().toFixed(2))} a restituir`
    : `${brl(value)} a pagar`;
}

const ROWS: {
  key: keyof ScenarioView["base"];
  label: string;
  format: (value: string) => string;
  delta: (value: string) => string;
  /** Whether an increase is good for the client (colors the difference). */
  upIsGood?: boolean;
  strong?: boolean;
}[] = [
  { key: "totalIncome", label: "Rendimentos do ano", format: brl, delta: signedBrl },
  { key: "totalTaxes", label: "Impostos do ano", format: brl, delta: signedBrl, upIsGood: false },
  {
    key: "netIncome",
    label: "Rendimento líquido",
    format: brl,
    delta: signedBrl,
    upIsGood: true,
    strong: true,
  },
  { key: "minimumTaxDue", label: "IRPFM devido", format: brl, delta: signedBrl, upIsGood: false },
  { key: "withholding", label: "Retenção sobre dividendos", format: brl, delta: signedBrl },
  { key: "finalBalance", label: "Saldo na declaração", format: balanceText, delta: signedBrl },
  {
    key: "effectiveTaxRate",
    label: "Carga efetiva",
    format: (value) => pct(value, 2),
    delta: signedPoints,
    upIsGood: false,
  },
];

function deltaTone(value: string, upIsGood: boolean | undefined): string {
  if (upIsGood === undefined) return "";
  const delta = new D(value);
  if (delta.isZero()) return "";
  return delta.greaterThan(0) === upIsGood ? "text-refund" : "text-pay";
}

export function ScenarioSimulator({
  clientCode,
  classes,
  positions,
  payers,
  threshold,
  saved,
}: SimulatorProps) {
  const [view, setView] = useState<ScenarioView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Field ids from useId: useFieldArray's random ids differ between server and browser.
  const uid = useId();

  const positionOf = (assetClass: IncomeTypeCode) =>
    positions.find((position) => position.assetClass === assetClass);
  const labelOf = (code: IncomeTypeCode) =>
    classes.find((option) => option.code === code)?.label ?? code;

  function defaults(kind: OperationKind): OperationForm {
    if (kind === "MOVE_ALLOCATION") {
      const from: IncomeTypeCode = positions[0]?.assetClass ?? classes[0]?.code ?? "RENDA_FIXA";
      const to = classes.find((option) => option.code !== from)?.code ?? from;
      return {
        kind,
        fromClass: from,
        toClass: to,
        amount: "",
        toAnnualRate: "",
        fromAnnualRate: "",
        toTaxRate: "",
      };
    }
    if (kind === "RESCHEDULE_DIVIDENDS") {
      return { kind, payerCode: payers[0] ?? "", schedule: "CAP_AT_THRESHOLD" };
    }
    return { kind, payerCode: payers[0] ?? "", direction: "RETAIN", amount: "" };
  }

  const form = useForm<ScenarioForm>({
    resolver: zodResolver(scenarioFormSchema),
    defaultValues: {
      name: "",
      operations: [defaults(payers.length > 0 ? "RESCHEDULE_DIVIDENDS" : "MOVE_ALLOCATION")],
    },
  });
  const operations = useFieldArray({ control: form.control, name: "operations" });
  const watched = form.watch("operations");
  const errors = form.formState.errors;

  function run(values: ScenarioForm) {
    setError(null);
    startTransition(async () => {
      const result = await simulateAction(clientCode, values);
      if (result.ok) setView(result.data);
      else {
        setView(null);
        setError(result.error);
      }
    });
  }

  function save(values: ScenarioForm) {
    startTransition(async () => {
      const result = await saveScenarioAction(clientCode, values);
      if (result.ok) toast.success("Cenário salvo.");
      else toast.error(result.error);
    });
  }

  function open(item: SavedScenarioItem) {
    const values = { name: item.name, operations: item.operations };
    form.reset(values);
    run(values);
  }

  function remove(item: SavedScenarioItem) {
    startTransition(async () => {
      const result = await deleteScenarioAction(clientCode, item.id);
      if (result.ok) toast.success("Cenário excluído.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <form onSubmit={form.handleSubmit(run)} className="grid content-start gap-4" noValidate>
        <Field id="cenario-nome" label="Nome do cenário (opcional)" error={errors.name?.message}>
          <Input
            id="cenario-nome"
            placeholder="ex.: Dividendos até o limite mensal"
            maxLength={60}
            {...invalidProps("cenario-nome", errors.name?.message)}
            {...form.register("name")}
          />
        </Field>

        <ol className="grid gap-3">
          {operations.fields.map((field, index) => {
            const current = watched[index] ?? field;
            const opErrors = errors.operations?.[index] as
              | Partial<Record<string, { message?: string }>>
              | undefined;
            const message = (name: string) => opErrors?.[name]?.message;
            const id = (name: string) => `${uid}-op${index}-${name}`;
            return (
              <li key={field.id} className="rounded-md border bg-background p-3">
                <div className="flex items-end gap-2">
                  <Field id={id("tipo")} label={`Operação ${index + 1}`} className="flex-1">
                    <NativeSelect
                      id={id("tipo")}
                      value={current.kind}
                      onChange={(event) =>
                        operations.update(index, defaults(event.target.value as OperationKind))
                      }
                    >
                      {(Object.keys(OPERATION_LABEL) as OperationKind[]).map((kind) => (
                        <option
                          key={kind}
                          value={kind}
                          disabled={kind !== "MOVE_ALLOCATION" && payers.length === 0}
                        >
                          {OPERATION_LABEL[kind]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {operations.fields.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover operação ${index + 1}`}
                      onClick={() => operations.remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>

                {current.kind === "MOVE_ALLOCATION" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field id={id("origem")} label="De" error={message("fromClass")}>
                      <NativeSelect
                        id={id("origem")}
                        {...form.register(`operations.${index}.fromClass`)}
                      >
                        {classes.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field id={id("destino")} label="Para" error={message("toClass")}>
                      <NativeSelect
                        id={id("destino")}
                        {...form.register(`operations.${index}.toClass`)}
                      >
                        {classes.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field
                      id={id("valor")}
                      label="Valor movido"
                      error={message("amount")}
                      hint={(() => {
                        const position = positionOf(current.fromClass);
                        return position
                          ? `Saldo em ${labelOf(current.fromClass)}: ${brl(position.balance)}`
                          : "ex.: 500.000,00";
                      })()}
                    >
                      <Input
                        id={id("valor")}
                        inputMode="decimal"
                        placeholder="500.000,00"
                        {...invalidProps(id("valor"), message("amount"))}
                        {...form.register(`operations.${index}.amount`)}
                      />
                    </Field>
                    <Field
                      id={id("taxa-destino")}
                      label="Rendimento esperado do destino (a.a.)"
                      error={message("toAnnualRate")}
                      hint="ex.: 11% ou 0,11"
                    >
                      <Input
                        id={id("taxa-destino")}
                        inputMode="decimal"
                        placeholder="11%"
                        {...invalidProps(id("taxa-destino"), message("toAnnualRate"))}
                        {...form.register(`operations.${index}.toAnnualRate`)}
                      />
                    </Field>
                    <Field
                      id={id("taxa-origem")}
                      label="Rendimento da origem (a.a.)"
                      error={message("fromAnnualRate")}
                      hint={(() => {
                        const position = positionOf(current.fromClass);
                        return position
                          ? `Em branco: ${pct(position.expectedAnnualRate, 2)}, da aba posições`
                          : "Obrigatório: o cliente não tem posição nessa classe";
                      })()}
                    >
                      <Input
                        id={id("taxa-origem")}
                        inputMode="decimal"
                        {...invalidProps(id("taxa-origem"), message("fromAnnualRate"))}
                        {...form.register(`operations.${index}.fromAnnualRate`)}
                      />
                    </Field>
                    <Field
                      id={id("aliquota")}
                      label="IR sobre o rendimento do destino"
                      error={message("toTaxRate")}
                      hint="Em branco: alíquota estimada da classe"
                    >
                      <Input
                        id={id("aliquota")}
                        inputMode="decimal"
                        {...invalidProps(id("aliquota"), message("toTaxRate"))}
                        {...form.register(`operations.${index}.toTaxRate`)}
                      />
                    </Field>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field id={id("empresa")} label="Empresa" error={message("payerCode")}>
                      <NativeSelect
                        id={id("empresa")}
                        {...form.register(`operations.${index}.payerCode`)}
                      >
                        {payers.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    {current.kind === "RESCHEDULE_DIVIDENDS" ? (
                      <Field
                        id={id("calendario")}
                        label="Novo calendário"
                        hint={
                          current.schedule === "EVEN"
                            ? "O total do ano dividido em 12 meses."
                            : "O que passar do limite vai para dezembro."
                        }
                      >
                        <NativeSelect
                          id={id("calendario")}
                          {...form.register(`operations.${index}.schedule`)}
                        >
                          <option value="CAP_AT_THRESHOLD">Até {brl(threshold)}/mês</option>
                          <option value="EVEN">12 parcelas iguais</option>
                        </NativeSelect>
                      </Field>
                    ) : (
                      <>
                        <Field id={id("direcao")} label="O que fazer">
                          <NativeSelect
                            id={id("direcao")}
                            {...form.register(`operations.${index}.direction`)}
                          >
                            <option value="RETAIN">Reter na empresa (receber menos no ano)</option>
                            <option value="DISTRIBUTE">Distribuir mais em dezembro</option>
                          </NativeSelect>
                        </Field>
                        <Field
                          id={id("valor")}
                          label="Valor"
                          error={message("amount")}
                          className="sm:col-span-2"
                        >
                          <Input
                            id={id("valor")}
                            inputMode="decimal"
                            placeholder="100.000,00"
                            {...invalidProps(id("valor"), message("amount"))}
                            {...form.register(`operations.${index}.amount`)}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {errors.operations?.root?.message || errors.operations?.message ? (
          <p className="text-xs text-destructive">
            {errors.operations?.root?.message ?? errors.operations?.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={operations.fields.length >= MAX_OPERATIONS}
            onClick={() => operations.append(defaults("MOVE_ALLOCATION"))}
          >
            <Plus className="size-4" /> Adicionar operação
          </Button>
          <Button type="submit" disabled={pending}>
            <FlaskConical className="size-4" /> {pending ? "Simulando…" : "Simular"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={form.handleSubmit(save)}
          >
            <Save className="size-4" /> Salvar cenário
          </Button>
        </div>
        {payers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            O cliente não recebe dividendos fora da transição: só a mudança de alocação está
            disponível.
          </p>
        ) : null}

        {saved.length > 0 ? (
          <div className="border-t pt-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">
              Cenários salvos
            </h3>
            <ul className="mt-2 divide-y text-sm">
              {saved.map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(item.createdAt)} · líquido {signedBrl(item.netIncomeDelta)} quando
                      salvo
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => open(item)}>
                    Abrir
                  </Button>
                  {item.canDelete ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Excluir cenário ${item.name}`}
                      onClick={() => remove(item)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>

      <div aria-live="polite" className={cn("min-w-0", pending && view ? "opacity-60" : "")}>
        {error ? (
          <p className="rounded-md border border-pay/30 bg-pay/8 px-3 py-2 text-sm text-pay">
            {error}
          </p>
        ) : null}
        {view ? (
          <ScenarioResult view={view} />
        ) : error ? null : (
          <div className="grid h-full min-h-40 place-items-center rounded-md border border-dashed px-6 text-center text-sm text-muted-foreground">
            Monte o cenário e clique em Simular. A comparação é sempre pelo rendimento líquido
            depois de todos os impostos.
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioResult({ view }: { view: ScenarioView }) {
  const deferred = new D(view.deferredDividends);
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="mb-2 text-left text-sm font-semibold">{view.name}</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-2 text-left font-normal" scope="col">
                <span className="sr-only">Indicador</span>
              </th>
              <th className="py-2 px-2 text-right font-normal" scope="col">
                Hoje
              </th>
              <th className="py-2 px-2 text-right font-normal" scope="col">
                Cenário
              </th>
              <th className="py-2 pl-2 text-right font-normal" scope="col">
                Diferença
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.key}
                className={cn("border-b last:border-0", row.strong && "bg-muted/50")}
              >
                <th
                  scope="row"
                  className={cn(
                    "py-2 pr-2 text-left",
                    row.strong ? "font-semibold" : "font-normal",
                  )}
                >
                  {row.label}
                </th>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {row.format(view.base[row.key])}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {row.format(view.scenario[row.key])}
                </td>
                <td
                  className={cn(
                    "py-2 pl-2 text-right whitespace-nowrap",
                    row.strong && "font-semibold",
                    deltaTone(view.delta[row.key], row.upIsGood),
                  )}
                >
                  {row.delta(view.delta[row.key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deferred.greaterThan(0) ? (
        <p className="rounded-md border bg-attention-bg px-3 py-2 text-xs text-attention">
          {brl(view.deferredDividends)} de dividendos deixam de ser recebidos no ano. Não somem:
          serão tributados quando forem distribuídos.
        </p>
      ) : null}
      <ul className="grid gap-1.5 text-sm">
        {[...new Set(view.notes)].map((note) => (
          <li key={note} className="text-muted-foreground">
            {note}
          </li>
        ))}
        {[...new Set(view.warnings)].map((warning) => (
          <li key={warning} className="text-attention">
            {warning}
          </li>
        ))}
      </ul>
      <details className="rounded-md border px-3">
        <summary className="cursor-pointer py-2 text-sm">Trilha de cálculo do cenário</summary>
        <CalculationTrail trail={view.scenarioTrail} />
      </details>
    </div>
  );
}
