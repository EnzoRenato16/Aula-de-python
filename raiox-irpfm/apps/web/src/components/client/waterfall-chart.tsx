"use client";

import { D } from "@raiox/engine";
import {
  Bar,
  BarChart,
  type BarShapeProps,
  LabelList,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CategoryTick, chartLayout, unbreakable } from "@/components/client/chart-parts";
import { brl } from "@/lib/format";
import { useElementWidth } from "@/lib/use-element-width";
import type { WaterfallStep } from "@/lib/waterfall";

interface Row {
  step: WaterfallStep;
  /** Bar extent in reais. Numbers are used for drawing only; values shown are the decimal strings. */
  range: [number, number];
  label: string;
  tip: string;
}

const ROW_HEIGHT = 38;

function color(step: WaterfallStep): string {
  if (step.kind === "deduction") return "var(--chart-neutral)";
  if (step.kind === "balance") {
    const balance = new D(step.to);
    if (balance.isNegative()) return "var(--refund)";
    if (balance.greaterThan(0)) return "var(--pay)";
  }
  return "var(--chart-1)";
}

/** What a step did to the running value, as shown at the tip of the bar. */
function tipLabel(step: WaterfallStep): string {
  if (step.kind !== "deduction") return brl(step.amount);
  const absorbed = new D(step.from).minus(new D(step.to));
  return `−${brl(absorbed.toFixed(2))}`;
}

function toRow(step: WaterfallStep): Row {
  const from = Number(step.from);
  const to = Number(step.to);
  return {
    step,
    range: [Math.min(from, to), Math.max(from, to)],
    label: step.label,
    tip: unbreakable(tipLabel(step)),
  };
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function StepTooltip({ active, payload }: { active?: boolean; payload?: { payload?: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const { step } = row;
  const absorbed = new D(step.from).minus(new D(step.to));
  const partial =
    step.kind === "deduction" && step.key !== "retencao" && absorbed.lessThan(new D(step.amount));
  return (
    <div className="max-w-64 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{step.label}</p>
      <p className="mt-1 tabular-nums">{brl(step.amount)}</p>
      {partial ? (
        <p className="mt-1 text-muted-foreground">
          Só {brl(absorbed.toFixed(2))} foram usados: a dedução não deixa o IRPFM negativo.
        </p>
      ) : null}
      {step.ruleIds.length > 0 ? (
        <p className="mt-1 text-muted-foreground">{step.ruleIds.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function StepBar(props: BarShapeProps) {
  const row = props.payload as Row | undefined;
  if (!row || props.width === undefined) return null;
  // Zero-length steps (e.g. IRPFM devido = 0) still get a visible tick.
  const width = Math.max(Math.abs(props.width), 2);
  const x = props.width < 0 ? props.x + props.width : props.x;
  return (
    <Rectangle
      x={x}
      y={props.y}
      width={width}
      height={props.height}
      radius={width > 8 ? 4 : 1}
      fill={color(row.step)}
    />
  );
}

export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { narrow, labelWidth, fontSize } = chartLayout(width);
  const rows = steps.map(toRow);
  const height = rows.length * ROW_HEIGHT + 36;
  return (
    <figure>
      <div
        ref={ref}
        style={{ height }}
        role="img"
        aria-label="Do IRPFM bruto ao saldo da declaração"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: narrow ? 84 : 96, bottom: 4, left: 0 }}
          >
            <XAxis
              type="number"
              tickFormatter={(value: number) => compact.format(value)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={labelWidth}
              tick={<CategoryTick labelWidth={labelWidth} fontSize={fontSize} />}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <ReferenceLine x={0} stroke="var(--border)" />
            <Tooltip
              content={<StepTooltip />}
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="range"
              maxBarSize={22}
              minPointSize={2}
              shape={StepBar}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="tip"
                position="right"
                fontSize={fontSize}
                fill="var(--foreground)"
                className="tabular-nums"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver os valores em tabela</summary>
        <table className="mt-2 w-full tabular-nums">
          <tbody>
            {steps.map((step) => (
              <tr key={step.key} className="border-b last:border-0">
                <td className="py-1 pr-2">{step.label}</td>
                <td className="py-1 text-right">{brl(step.amount)}</td>
                <td className="py-1 pl-2 text-right text-muted-foreground">
                  {step.kind === "deduction" ? `→ ${brl(step.to)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
