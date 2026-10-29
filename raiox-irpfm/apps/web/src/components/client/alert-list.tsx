import type { Alert, Serialized, Severity } from "@raiox/engine";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { ALERT_LABEL } from "@/lib/alerts";
import { cn } from "@/lib/utils";

const ORDER: Record<Severity, number> = { critico: 0, atencao: 1, info: 2 };

const ICON = {
  critico: { icon: CircleAlert, className: "text-pay", label: "Crítico" },
  atencao: { icon: TriangleAlert, className: "text-attention", label: "Atenção" },
  info: { icon: Info, className: "text-muted-foreground", label: "Informação" },
} as const;

export function AlertList({ alerts }: { alerts: Serialized<Alert>[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum alerta para este cliente.</p>;
  }
  const sorted = [...alerts].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return (
    <ul className="grid gap-3">
      {sorted.map((alert) => {
        const { icon: Icon, className, label } = ICON[alert.severity];
        return (
          <li key={alert.code} className="flex gap-2.5">
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", className)} />
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                <span className="sr-only">{label}: </span>
                {ALERT_LABEL[alert.code]}
              </p>
              <p className="mt-0.5 text-muted-foreground">{alert.message}</p>
              {alert.ruleIds.length > 0 ? (
                <p className="mt-1 flex flex-wrap gap-1">
                  {alert.ruleIds.map((id) => (
                    <Link
                      key={id}
                      href={`/premissas#${id}`}
                      className="rounded border px-1 py-px font-mono text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
                    >
                      {id}
                    </Link>
                  ))}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
