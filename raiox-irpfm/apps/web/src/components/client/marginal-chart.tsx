"use client";

import type { MarginalRate, Serialized } from "@raiox/engine";
import {
  Bar,
  BarChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CategoryTick, chartLayout } from "@/components/client/chart-parts";
import { brl, pct } from "@/lib/format";
import { useElementWidth } from "@/lib/use-element-width";

interface Row {
  rate: Serialized<MarginalRate>;
  label: string;
  /** Percentage used for drawing only; the label is formatted from the decimal string. */
  value: number;
  tip: string;
}

const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Axis from a round number below zero (if any) to a round number above the largest rate. */
function axisTicks(values: number[]): number[] {
  const step = 10;
  const low = Math.min(0, Math.floor(Math.min(...values) / step) * step);
  const high = Math.max(step, Math.ceil(Math.max(...values) / step) * step);
  const ticks: number[] = [];
  for (let tick = low; tick <= high; tick += step) ticks.push(tick);
  return ticks;
}

function RateTooltip({
  active,
  payload,
  step,
}: {
  active?: boolean;
  payload?: { payload?: Row }[];
  step: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const { components } = row.rate;
  return (
    <div className="max-w-64 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">
        +{brl(step)} de {row.label}
      </p>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 tabular-nums">
        <dt className="text-muted-foreground">IR do próprio rendimento</dt>
        <dd className="text-right">{brl(components.ownTax)}</dd>
        <dt className="text-muted-foreground">IRPF do ajuste</dt>
        <dd className="text-right">{brl(components.irpfAdjustment)}</dd>
        <dt className="text-muted-foreground">IRPFM</dt>
        <dd className="text-right">{brl(components.minimumTax)}</dd>
      </dl>
    </div>
  );
}

/**
 * Effective marginal rate per income class: how much of an extra amount of
 * each class goes to taxes (own tax + IRPF + IRPFM), computed by the engine.
 */
export function MarginalChart({
  rates,
  step,
}: {
  rates: Serialized<MarginalRate>[];
  step: string;
}) {
  const rows: Row[] = rates.map((rate) => ({
    rate,
    label: rate.label,
    value: Number(rate.rate) * 100,
    tip: pct(rate.rate, 1),
  }));
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { narrow, labelWidth, fontSize } = chartLayout(width);
  // Class names wrap to up to three lines in the narrow label column.
  const height = rows.length * (narrow ? 42 : 34) + 32;
  const ticks = axisTicks(rows.map((row) => row.value));
  return (
    <figure>
      <div
        ref={ref}
        style={{ height }}
        role="img"
        aria-label="Alíquota marginal efetiva por classe de rendimento"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 52, bottom: 4, left: 0 }}
          >
            <XAxis
              type="number"
              ticks={ticks}
              domain={[ticks[0] ?? 0, ticks.at(-1) ?? 10]}
              tickFormatter={(value: number) => `${percent.format(value)}%`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
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
              content={<RateTooltip step={step} />}
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="value"
              fill="var(--chart-2)"
              maxBarSize={16}
              minPointSize={2}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="tip"
                position="right"
                fontSize={fontSize}
                fill="var(--foreground)"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver os valores em tabela</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1 pr-2 text-left font-normal">Classe</th>
              <th className="py-1 text-right font-normal">Alíquota</th>
              <th className="py-1 pl-2 text-right font-normal">IRPFM em +{brl(step)}</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.type} className="border-b last:border-0">
                <td className="py-1 pr-2">{rate.label}</td>
                <td className="py-1 text-right">{pct(rate.rate, 2)}</td>
                <td className="py-1 pl-2 text-right">{brl(rate.components.minimumTax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
