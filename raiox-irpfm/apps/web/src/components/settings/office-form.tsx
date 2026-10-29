"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveOfficeAction } from "@/app/(app)/escritorio/actions";
import { Field } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Office name and the accent color of its PDFs, with a preview of the PDF header. */
export function OfficeForm({
  name: initialName,
  primaryColor,
  defaultColor,
}: {
  name: string;
  primaryColor: string | null;
  defaultColor: string;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(primaryColor ?? "");
  const [pending, startTransition] = useTransition();
  const validColor = color === "" || HEX.test(color);
  const preview = HEX.test(color) ? color : defaultColor;

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveOfficeAction({
            name,
            primaryColor: color === "" ? null : color.toUpperCase(),
          });
          if (result.ok) toast.success("Escritório atualizado.");
          else toast.error(result.error);
        });
      }}
    >
      <Field id="escritorio-nome" label="Nome do escritório" hint="Aparece nas telas e no PDF.">
        <Input
          id="escritorio-nome"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field
        id="escritorio-cor"
        label="Cor do PDF"
        error={validColor ? undefined : "Use uma cor hexadecimal, ex.: #12343B"}
        hint="Em branco: a cor padrão do Raio-X."
      >
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Escolher cor"
            value={preview}
            onChange={(event) => setColor(event.target.value.toUpperCase())}
            className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <Input
            id="escritorio-cor"
            value={color}
            placeholder={defaultColor}
            maxLength={7}
            onChange={(event) => setColor(event.target.value.trim())}
            className="w-32 font-mono uppercase"
            aria-invalid={!validColor}
          />
          {color !== "" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setColor("")}>
              Usar padrão
            </Button>
          ) : null}
        </div>
      </Field>
      <div aria-hidden className="overflow-hidden rounded-md border bg-white text-[#1b1f23]">
        <div className="h-1.5" style={{ backgroundColor: preview }} />
        <div className="flex items-baseline justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: preview }}>
              {name || "Nome do escritório"}
            </p>
            <p className="text-xs text-[#5b6670]">Raio-X IRPFM · simulação por cliente</p>
          </div>
          <p className="text-xs text-[#5b6670]">prévia do cabeçalho do PDF</p>
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending || !validColor || name.trim().length < 2}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
