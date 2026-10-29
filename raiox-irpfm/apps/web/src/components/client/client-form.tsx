"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { TAXED_REGIMES } from "@raiox/engine";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { type FieldPath, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveClientAction } from "@/app/(app)/clientes/actions";
import { Field, invalidProps } from "@/components/app/field";
import { Panel } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type ClientForm,
  clientFormSchema,
  type IncomeForm,
  type IncomeTypeOption,
  LIMIT_CATEGORIES,
  REGIME_GROUP,
} from "@/lib/client-form";
import { MONTHS } from "@/lib/format";

const newIncome = (type: IncomeForm["type"]): IncomeForm => ({
  type,
  amount: "",
  month: "",
  payerCode: "",
  taxWithheld: "",
  transition: false,
});

function Checkbox({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <label htmlFor={id} className="flex h-9 items-center gap-2 text-sm">
      <input id={id} type="checkbox" className="size-4 accent-primary" {...props} />
      {label}
    </label>
  );
}

export function ClientFormView({
  mode,
  defaultValues,
  incomeTypes,
  advisorCodes,
  limitLabels,
}: {
  mode: "create" | "edit";
  defaultValues: ClientForm;
  incomeTypes: IncomeTypeOption[];
  advisorCodes: string[];
  /** Category labels with the reducer limit of the rule set ("Geral (34%)"). */
  limitLabels: Record<(typeof LIMIT_CATEGORIES)[number], string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formErrors, setFormErrors] = useState<string[]>([]);
  // Field ids from useId: useFieldArray's random ids differ between server and browser.
  const uid = useId();
  const form = useForm<ClientForm>({ resolver: zodResolver(clientFormSchema), defaultValues });
  const incomes = useFieldArray({ control: form.control, name: "incomes" });
  const companies = useFieldArray({ control: form.control, name: "companies" });
  const positions = useFieldArray({ control: form.control, name: "positions" });
  const watchedIncomes = form.watch("incomes");
  const watchedCompanies = form.watch("companies");

  const typeOf = (code: string) => incomeTypes.find((type) => type.code === code);
  const errorAt = (path: string) =>
    form.getFieldState(path as FieldPath<ClientForm>, form.formState).error?.message;
  const groups = Object.entries(REGIME_GROUP)
    .map(([regime, label]) => ({
      label,
      types: incomeTypes.filter((type) => type.regime === regime),
    }))
    .filter((group) => group.types.length > 0);

  const citedCompanies = [
    ...new Set(
      watchedIncomes
        .filter((line) => typeOf(line.type)?.requiresPayer && line.payerCode.trim() !== "")
        .map((line) => line.payerCode.trim().toUpperCase()),
    ),
  ].filter((code) => !watchedCompanies.some((entry) => entry.code.trim().toUpperCase() === code));

  function submit(values: ClientForm) {
    // Fields hidden for a type are not sent, so a type change never leaves stale values.
    const cleaned: ClientForm = {
      ...values,
      incomes: values.incomes.map((line) => {
        const type = typeOf(line.type);
        return {
          ...line,
          payerCode: type?.requiresPayer ? line.payerCode : "",
          taxWithheld: type && TAXED_REGIMES.has(type.regime) ? line.taxWithheld : "",
          transition: line.type === "DIVIDENDOS" && line.transition,
        };
      }),
    };
    setFormErrors([]);
    startTransition(async () => {
      const result = await saveClientAction(mode === "edit" ? defaultValues.code : null, cleaned);
      if (!result.ok) {
        setFormErrors([result.error]);
        return;
      }
      const outcome = result.data;
      if (!outcome.saved) {
        for (const [path, message] of Object.entries(outcome.fieldErrors)) {
          form.setError(path as FieldPath<ClientForm>, { type: "server", message });
        }
        setFormErrors(outcome.formErrors);
        toast.error("Confira os campos marcados.");
        return;
      }
      toast.success(mode === "create" ? "Cliente cadastrado." : "Cliente atualizado.");
      for (const warning of outcome.warnings) toast.warning(warning);
      router.push(`/clientes/${encodeURIComponent(outcome.code)}`);
    });
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="grid gap-6" noValidate>
      {formErrors.length > 0 ? (
        <ul
          role="alert"
          className="grid gap-1 rounded-md border border-pay/30 bg-pay/8 px-4 py-3 text-sm text-pay"
        >
          {formErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      <Panel
        title="Identificação"
        description="Código pseudônimo e apelido: o sistema não aceita CPF, CNPJ, e-mail ou nome completo."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field id="codigo" label="Código do cliente *" error={errorAt("code")}>
            <Input
              id="codigo"
              autoComplete="off"
              readOnly={mode === "edit"}
              placeholder="CLI-0001"
              className="uppercase read-only:bg-muted"
              {...invalidProps("codigo", errorAt("code"))}
              {...form.register("code")}
            />
          </Field>
          <Field id="apelido" label="Apelido" error={errorAt("nickname")} hint="ex.: Dr. R.">
            <Input
              id="apelido"
              autoComplete="off"
              maxLength={40}
              {...invalidProps("apelido", errorAt("nickname"))}
              {...form.register("nickname")}
            />
          </Field>
          <Field id="assessor" label="Código do assessor" error={errorAt("advisorCode")}>
            <Input
              id="assessor"
              autoComplete="off"
              list="assessores"
              className="uppercase"
              {...invalidProps("assessor", errorAt("advisorCode"))}
              {...form.register("advisorCode")}
            />
            <datalist id="assessores">
              {advisorCodes.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </Field>
          <Field
            id="irpf"
            label="IRPF devido no ajuste"
            error={errorAt("irpfAdjustmentDue")}
            hint="Do contador. Em branco: o sistema estima e sinaliza."
          >
            <Input
              id="irpf"
              inputMode="decimal"
              placeholder="0,00"
              {...invalidProps("irpf", errorAt("irpfAdjustmentDue"))}
              {...form.register("irpfAdjustmentDue")}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Rendimentos do ano"
        description="Valores brutos recebidos no ano-calendário. Dividendos: uma linha por empresa e mês."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => incomes.append(newIncome("SALARIO"))}
          >
            <Plus className="size-4" /> Rendimento
          </Button>
        }
      >
        {incomes.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum rendimento. Adicione o primeiro.</p>
        ) : (
          <ol className="grid gap-3">
            {incomes.fields.map((field, index) => {
              const line = watchedIncomes[index] ?? field;
              const type = typeOf(line.type);
              const path = (name: keyof IncomeForm) => `incomes.${index}.${name}`;
              const id = (name: string) => `${uid}-rend${index}-${name}`;
              return (
                <li
                  key={field.id}
                  className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto]"
                >
                  <Field id={id("tipo")} label={`Tipo ${index + 1}`} error={errorAt(path("type"))}>
                    <NativeSelect id={id("tipo")} {...form.register(`incomes.${index}.type`)}>
                      {groups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.types.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field id={id("valor")} label="Valor *" error={errorAt(path("amount"))}>
                    <Input
                      id={id("valor")}
                      inputMode="decimal"
                      placeholder="60.000,00"
                      {...invalidProps(id("valor"), errorAt(path("amount")))}
                      {...form.register(`incomes.${index}.amount`)}
                    />
                  </Field>
                  <Field
                    id={id("mes")}
                    label={type?.requiresMonth ? "Mês *" : "Mês"}
                    error={errorAt(path("month"))}
                  >
                    <NativeSelect
                      id={id("mes")}
                      {...invalidProps(id("mes"), errorAt(path("month")))}
                      {...form.register(`incomes.${index}.month`)}
                    >
                      <option value="">{type?.requiresMonth ? "Escolha" : "Ano todo"}</option>
                      {MONTHS.map((month, monthIndex) => (
                        <option key={month} value={String(monthIndex + 1)}>
                          {month}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {type?.requiresPayer ? (
                    <Field id={id("empresa")} label="Empresa *" error={errorAt(path("payerCode"))}>
                      <Input
                        id={id("empresa")}
                        autoComplete="off"
                        className="uppercase"
                        placeholder="EMP-A"
                        {...invalidProps(id("empresa"), errorAt(path("payerCode")))}
                        {...form.register(`incomes.${index}.payerCode`)}
                      />
                    </Field>
                  ) : (
                    <div className="hidden lg:block" />
                  )}
                  {type && TAXED_REGIMES.has(type.regime) ? (
                    <Field
                      id={id("ir")}
                      label="IR retido ou pago"
                      error={errorAt(path("taxWithheld"))}
                    >
                      <Input
                        id={id("ir")}
                        inputMode="decimal"
                        placeholder="Em branco: estimado"
                        {...invalidProps(id("ir"), errorAt(path("taxWithheld")))}
                        {...form.register(`incomes.${index}.taxWithheld`)}
                      />
                    </Field>
                  ) : line.type === "DIVIDENDOS" ? (
                    <div className="grid content-start gap-1.5">
                      <span className="text-xs font-medium">Lucros até 2025</span>
                      <Checkbox
                        id={id("transicao")}
                        label="Regra de transição"
                        {...form.register(`incomes.${index}.transition`)}
                      />
                    </div>
                  ) : (
                    <div className="hidden lg:block" />
                  )}
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover rendimento ${index + 1}`}
                      onClick={() => incomes.remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <Panel
        title="Empresas pagadoras"
        description="Atributos do redutor (art. 16-B). Valem para todos os clientes que recebem da empresa; empresa sem alíquota efetiva fica com redutor zero."
        actions={
          <>
            {citedCompanies.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  companies.append(
                    citedCompanies.map((code) => ({
                      code,
                      effectiveRate: "",
                      limitCategory: "GERAL" as const,
                      simplesNacional: false,
                    })),
                  )
                }
              >
                Trazer {citedCompanies.join(", ")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                companies.append({
                  code: "",
                  effectiveRate: "",
                  limitCategory: "GERAL",
                  simplesNacional: false,
                })
              }
            >
              <Plus className="size-4" /> Empresa
            </Button>
          </>
        }
      >
        {companies.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma empresa nesta ficha. Empresas já cadastradas no escritório mantêm os dados
            salvos.
          </p>
        ) : (
          <ol className="grid gap-3">
            {companies.fields.map((field, index) => {
              const path = (name: string) => `companies.${index}.${name}`;
              const id = (name: string) => `${uid}-emp${index}-${name}`;
              return (
                <li
                  key={field.id}
                  className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]"
                >
                  <Field id={id("codigo")} label="Código *" error={errorAt(path("code"))}>
                    <Input
                      id={id("codigo")}
                      autoComplete="off"
                      className="uppercase"
                      {...invalidProps(id("codigo"), errorAt(path("code")))}
                      {...form.register(`companies.${index}.code`)}
                    />
                  </Field>
                  <Field
                    id={id("aliquota")}
                    label="Alíquota efetiva da PJ"
                    hint="(IRPJ + CSLL) ÷ lucro contábil, ex.: 34%"
                    error={errorAt(path("effectiveRate"))}
                  >
                    <Input
                      id={id("aliquota")}
                      inputMode="decimal"
                      {...invalidProps(id("aliquota"), errorAt(path("effectiveRate")))}
                      {...form.register(`companies.${index}.effectiveRate`)}
                    />
                  </Field>
                  <Field id={id("categoria")} label="Limite do redutor">
                    <NativeSelect
                      id={id("categoria")}
                      {...form.register(`companies.${index}.limitCategory`)}
                    >
                      {LIMIT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {limitLabels[category]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <div className="grid content-start gap-1.5">
                    <span className="text-xs font-medium">Regime</span>
                    <Checkbox
                      id={id("simples")}
                      label="Simples Nacional"
                      {...form.register(`companies.${index}.simplesNacional`)}
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover empresa ${index + 1}`}
                      onClick={() => companies.remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <Panel
        title="Posições (opcional)"
        description="Saldos por classe, usados só nos cenários de mudança de alocação."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              positions.append({
                assetClass: incomeTypes.find((type) => type.investable)?.code ?? "RENDA_FIXA",
                balance: "",
                expectedAnnualRate: "",
                taxRate: "",
              })
            }
          >
            <Plus className="size-4" /> Posição
          </Button>
        }
      >
        {positions.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma posição.</p>
        ) : (
          <ol className="grid gap-3">
            {positions.fields.map((field, index) => {
              const path = (name: string) => `positions.${index}.${name}`;
              const id = (name: string) => `${uid}-pos${index}-${name}`;
              return (
                <li
                  key={field.id}
                  className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <Field id={id("classe")} label="Classe" error={errorAt(path("assetClass"))}>
                    <NativeSelect
                      id={id("classe")}
                      {...form.register(`positions.${index}.assetClass`)}
                    >
                      {incomeTypes
                        .filter((type) => type.investable)
                        .map((type) => (
                          <option key={type.code} value={type.code}>
                            {type.label}
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field id={id("saldo")} label="Saldo *" error={errorAt(path("balance"))}>
                    <Input
                      id={id("saldo")}
                      inputMode="decimal"
                      {...invalidProps(id("saldo"), errorAt(path("balance")))}
                      {...form.register(`positions.${index}.balance`)}
                    />
                  </Field>
                  <Field
                    id={id("taxa")}
                    label="Taxa esperada a.a. *"
                    error={errorAt(path("expectedAnnualRate"))}
                  >
                    <Input
                      id={id("taxa")}
                      inputMode="decimal"
                      placeholder="12%"
                      {...invalidProps(id("taxa"), errorAt(path("expectedAnnualRate")))}
                      {...form.register(`positions.${index}.expectedAnnualRate`)}
                    />
                  </Field>
                  <Field
                    id={id("ir")}
                    label="Alíquota de IR"
                    hint="Em branco: a da classe"
                    error={errorAt(path("taxRate"))}
                  >
                    <Input
                      id={id("ir")}
                      inputMode="decimal"
                      {...invalidProps(id("ir"), errorAt(path("taxRate")))}
                      {...form.register(`positions.${index}.taxRate`)}
                    />
                  </Field>
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover posição ${index + 1}`}
                      onClick={() => positions.remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Salvando e recalculando…"
            : mode === "create"
              ? "Cadastrar cliente"
              : "Salvar"}
        </Button>
        <Button asChild variant="outline">
          <Link
            href={
              mode === "edit" ? `/clientes/${encodeURIComponent(defaultValues.code)}` : "/painel"
            }
          >
            Cancelar
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Ao salvar, todo o escritório é recalculado com as premissas atuais.
        </p>
      </div>
    </form>
  );
}
