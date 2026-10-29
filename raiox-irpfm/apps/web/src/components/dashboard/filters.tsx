"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALERT_LABEL, BADGE_ALERTS, BAND_LABEL } from "@/lib/alerts";

const ALL = "__todos__";

export function DashboardFilters({
  advisors,
  showAdvisor,
}: {
  advisors: string[];
  showAdvisor: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("busca") ?? "");

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Debounced search.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the debounce reacts only to the typed text
  useEffect(() => {
    const current = params.get("busca") ?? "";
    if (search === current) return;
    const timer = setTimeout(() => update("busca", search.trim() || null), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const hasFilters = ["busca", "assessor", "alerta", "faixa"].some((key) => params.get(key));
  return (
    <div
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      aria-busy={pending}
    >
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar código ou apelido"
          aria-label="Buscar cliente"
          className="pl-8"
        />
      </div>
      {showAdvisor ? (
        <Select
          value={params.get("assessor") ?? ALL}
          onValueChange={(value) => update("assessor", value)}
        >
          <SelectTrigger className="sm:w-44" aria-label="Filtrar por assessor">
            <SelectValue placeholder="Assessor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os assessores</SelectItem>
            {advisors.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Select
        value={params.get("alerta") ?? ALL}
        onValueChange={(value) => update("alerta", value)}
      >
        <SelectTrigger className="sm:w-48" aria-label="Filtrar por alerta">
          <SelectValue placeholder="Alerta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os alertas</SelectItem>
          {BADGE_ALERTS.map((code) => (
            <SelectItem key={code} value={code}>
              {ALERT_LABEL[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("faixa") ?? ALL} onValueChange={(value) => update("faixa", value)}>
        <SelectTrigger className="sm:w-48" aria-label="Filtrar por faixa">
          <SelectValue placeholder="Faixa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as faixas</SelectItem>
          {Object.entries(BAND_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <X className="size-4" /> Limpar
        </Button>
      ) : null}
    </div>
  );
}
