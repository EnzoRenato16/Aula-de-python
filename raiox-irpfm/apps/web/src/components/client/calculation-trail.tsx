import { D, type Serialized, type TrailStep } from "@raiox/engine";
import Link from "next/link";
import { brl, pct } from "@/lib/format";

function formatValue(step: Serialized<TrailStep>): string {
  if (step.unit === "BRL") return brl(step.value);
  if (step.unit === "RATE") return pct(step.value, 4);
  return new D(step.value).isZero() ? "não" : "sim";
}

function RuleLinks({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <Link
          key={id}
          href={`/premissas#${id}`}
          className="rounded border px-1 py-px font-mono text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
        >
          {id}
        </Link>
      ))}
    </span>
  );
}

function Step({ step, nested }: { step: Serialized<TrailStep>; nested?: boolean }) {
  const children = step.children ?? [];
  return (
    <li className={nested ? "py-2" : "py-3"}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={nested ? "text-xs" : "text-sm font-medium"}>{step.label}</p>
        <p
          className={
            nested ? "shrink-0 text-xs tabular-nums" : "shrink-0 text-sm font-semibold tabular-nums"
          }
        >
          {formatValue(step)}
        </p>
      </div>
      <p className="mt-0.5 break-words text-xs text-muted-foreground tabular-nums">
        {step.formula}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <RuleLinks ids={step.ruleIds} />
        <span>{step.legalRef}</span>
      </div>
      {children.length > 0 ? (
        <details className="mt-2 rounded-md border bg-muted/40 px-3 [&[open]>summary]:mb-1">
          <summary className="cursor-pointer py-1.5 text-xs text-muted-foreground">
            Detalhar ({children.length} {children.length === 1 ? "item" : "itens"})
          </summary>
          <ul className="divide-y">
            {children.map((child) => (
              <Step key={child.id} step={child} nested />
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/** The engine's calculation trail: every step with its formula, rules and legal reference. */
export function CalculationTrail({ trail }: { trail: Serialized<TrailStep>[] }) {
  return (
    <ol className="divide-y">
      {trail.map((step) => (
        <Step key={step.id} step={step} />
      ))}
    </ol>
  );
}
