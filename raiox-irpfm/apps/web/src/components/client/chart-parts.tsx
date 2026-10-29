"use client";

import { Text } from "recharts";

/** Horizontal bar charts: category labels on the left, narrower on phones. */
export function chartLayout(width: number) {
  const narrow = width > 0 && width < 420;
  return { narrow, labelWidth: narrow ? 112 : 168, fontSize: narrow ? 11 : 12 };
}

/** Keeps "R$ 1.234,56" on one line at the tip of a bar (SVG text wraps at spaces). */
export function unbreakable(text: string): string {
  return text.replace(/ /g, "\u00a0");
}

/** Y-axis label that wraps inside the label column instead of overflowing it. */
export function CategoryTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  labelWidth: number;
  fontSize: number;
}) {
  return (
    <Text
      x={props.x ?? 0}
      y={props.y ?? 0}
      width={props.labelWidth - 10}
      textAnchor="end"
      verticalAnchor="middle"
      fontSize={props.fontSize}
      fill="var(--foreground)"
    >
      {props.payload?.value ?? ""}
    </Text>
  );
}
