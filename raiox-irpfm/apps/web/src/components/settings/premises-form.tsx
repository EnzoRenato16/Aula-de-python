"use client";

import {
  CONSERVATIVE_CHOICES,
  DEFAULT_CHOICES,
  type PendingChoices,
  type ReducerStrategy,
} from "@raiox/engine";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePremisesAction } from "@/app/(app)/premissas/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { CHOICE_TEXT, type EditableChoice, STRATEGY_TEXT } from "@/lib/premises";

type Choices = Pick<PendingChoices, EditableChoice>;
type BooleanChoice = Exclude<EditableChoice, "reducerStrategy">;

const STRATEGIES = Object.keys(STRATEGY_TEXT) as ReducerStrategy[];

function RuleLink({ id }: { id: string }) {
  return (
    <Link
      href={`#${id}`}
      className="rounded border px-1 py-px font-mono text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
    >
      {id}
    </Link>
  );
}

/**
 * Conservative mode and the PENDENTE choices. Only choices that differ from
 * the engine defaults are stored, so a default changed in a new rule version
 * reaches every office that never touched it.
 */
export function PremisesForm({
  conservative: initialConservative,
  choices: stored,
  editable,
}: {
  conservative: boolean;
  choices: Partial<PendingChoices>;
  editable: boolean;
}) {
  const [conservative, setConservative] = useState(initialConservative);
  const [choices, setChoices] = useState<Choices>({
    simplesNacionalWithholding:
      stored.simplesNacionalWithholding ?? DEFAULT_CHOICES.simplesNacionalWithholding,
    exemptStockGainsInBase: stored.exemptStockGainsInBase ?? DEFAULT_CHOICES.exemptStockGainsInBase,
    reducerStrategy:
      stored.reducerStrategy && stored.reducerStrategy !== "MIN_OF_ALL"
        ? stored.reducerStrategy
        : (DEFAULT_CHOICES.reducerStrategy as ReducerStrategy),
    estimateIrpfWhenMissing:
      stored.estimateIrpfWhenMissing ?? DEFAULT_CHOICES.estimateIrpfWhenMissing,
    estimateTaxWhenMissing: stored.estimateTaxWhenMissing ?? DEFAULT_CHOICES.estimateTaxWhenMissing,
  });
  const [pending, startTransition] = useTransition();
  const locked = !editable || conservative;
  const shown = (key: BooleanChoice) => (conservative ? CONSERVATIVE_CHOICES[key] : choices[key]);

  function save() {
    const changed = Object.fromEntries(
      Object.entries(choices).filter(
        ([key, value]) => value !== DEFAULT_CHOICES[key as EditableChoice],
      ),
    );
    startTransition(async () => {
      const result = await savePremisesAction({ conservative, choices: changed });
      if (result.ok)
        toast.success(`Premissas salvas. ${result.data.clients} clientes recalculados.`);
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3 rounded-md border bg-background p-4">
        <Switch
          id="conservador"
          checked={conservative}
          disabled={!editable}
          onCheckedChange={setConservative}
          className="mt-0.5"
        />
        <div className="grid gap-1">
          <label htmlFor="conservador" className="text-sm font-medium">
            Modo conservador
          </label>
          <p className="text-xs text-muted-foreground">
            Cada regra PENDENTE assume a opção que nunca subestima o imposto: o redutor fica com o
            menor valor entre as estratégias e o que faltar informar vale zero. Com o modo ligado,
            as escolhas abaixo não valem.
          </p>
        </div>
      </div>

      <fieldset disabled={locked} className="grid gap-4 disabled:opacity-60">
        <legend className="sr-only">Escolhas para regras pendentes</legend>
        {(Object.keys(CHOICE_TEXT) as BooleanChoice[]).map((key) => {
          const text = CHOICE_TEXT[key];
          const id = `escolha-${key}`;
          return (
            <div key={key} className="flex items-start gap-3">
              <Switch
                id={id}
                checked={shown(key)}
                onCheckedChange={(checked) =>
                  setChoices((current) => ({ ...current, [key]: checked }))
                }
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <label htmlFor={id} className="text-sm">
                  {text.label}
                </label>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {text.help}
                  <RuleLink id={text.ruleId} />
                  {DEFAULT_CHOICES[key] === choices[key] || conservative ? null : (
                    <span className="text-attention">diferente do padrão</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        <div className="grid max-w-xl gap-1.5">
          <label htmlFor="estrategia" className="text-sm">
            Alíquota efetiva do IRPFM no redutor
          </label>
          <NativeSelect
            id="estrategia"
            value={conservative ? "MIN_OF_ALL" : choices.reducerStrategy}
            onChange={(event) =>
              setChoices((current) => ({
                ...current,
                reducerStrategy: event.target.value as ReducerStrategy,
              }))
            }
          >
            {conservative ? (
              <option value="MIN_OF_ALL">Menor redutor entre as estratégias</option>
            ) : null}
            {STRATEGIES.map((strategy) => (
              <option key={strategy} value={strategy}>
                {STRATEGY_TEXT[strategy]}
                {strategy === DEFAULT_CHOICES.reducerStrategy ? " (padrão)" : ""}
              </option>
            ))}
          </NativeSelect>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            A lei não define a conta; a regulamentação ainda não saiu.
            <RuleLink id="R-16B-04" />
          </p>
        </div>
      </fieldset>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={save} disabled={pending}>
            {pending ? "Salvando e recalculando…" : "Salvar e recalcular"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Todos os clientes do escritório são recalculados; a auditoria registra a mudança.
          </p>
        </div>
      ) : (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Só o dono ou um admin do escritório muda as premissas.
        </p>
      )}
    </div>
  );
}
