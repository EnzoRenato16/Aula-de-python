import { cn } from "@/lib/utils";

export interface Kpi {
  label: string;
  value: string;
  note?: string;
  tone?: "pay" | "refund" | "attention" | "default";
}

const TONE: Record<NonNullable<Kpi["tone"]>, string> = {
  pay: "text-pay",
  refund: "text-refund",
  attention: "text-attention",
  default: "text-foreground",
};

export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-3.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn("mt-1 text-lg font-semibold tabular-nums", TONE[item.tone ?? "default"])}
          >
            {item.value}
          </dd>
          {item.note ? <dd className="mt-0.5 text-xs text-muted-foreground">{item.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
