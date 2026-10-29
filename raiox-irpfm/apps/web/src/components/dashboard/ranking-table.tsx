"use client";

import type { AlertCode } from "@raiox/engine";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  type SortFn,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ALERT_LABEL, ALERT_SEVERITY, BADGE_ALERTS, SEVERITY_CLASS } from "@/lib/alerts";
import { brl, compareDecimal, isPositive, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RankingRow {
  clientCode: string;
  nickname: string | null;
  advisorCode: string | null;
  position: number;
  score: string;
  base: string;
  rate: string;
  minimumTaxDue: string;
  withholding: string;
  amountToPay: string;
  amountToRefund: string;
  effectiveTaxRate: string;
  alertCodes: string[];
}

const sortingFeatures = tableFeatures({ rowSortingFeature });

/** Ascending decimal comparison (the table reverses it for descending). */
const decimalSort: SortFn<typeof sortingFeatures, RankingRow> = (a, b, id) =>
  compareDecimal(a.getValue<string>(id), b.getValue<string>(id));

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { decimal: decimalSort },
});
const helper = createColumnHelper<typeof features, RankingRow>();

function Balance({ row }: { row: RankingRow }) {
  if (isPositive(row.amountToPay))
    return <span className="font-medium text-pay">{brl(row.amountToPay)} a pagar</span>;
  if (isPositive(row.amountToRefund)) {
    return <span className="font-medium text-refund">{brl(row.amountToRefund)} a restituir</span>;
  }
  return <span className="text-muted-foreground">sem saldo</span>;
}

function AlertBadges({ codes, limit = 3 }: { codes: string[]; limit?: number }) {
  const shown = BADGE_ALERTS.filter((code) => codes.includes(code)).slice(0, limit);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((code: AlertCode) => (
        <Badge
          key={code}
          variant="outline"
          className={cn("font-normal", SEVERITY_CLASS[ALERT_SEVERITY[code]])}
        >
          {ALERT_LABEL[code]}
        </Badge>
      ))}
    </div>
  );
}

function ScoreBar({ score }: { score: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full bg-chart-2"
          style={{ width: `${Math.min(100, Number.parseFloat(score))}%` }}
        />
      </div>
      <span className="tabular-nums">{score.replace(".", ",")}</span>
    </div>
  );
}

const columns = helper.columns([
  helper.accessor("position", {
    header: "#",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  helper.accessor("clientCode", {
    header: "Cliente",
    cell: (info) => (
      <div className="min-w-0">
        <Link
          href={`/clientes/${encodeURIComponent(info.getValue())}`}
          className="font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
        {info.row.original.nickname ? (
          <p className="truncate text-xs text-muted-foreground">{info.row.original.nickname}</p>
        ) : null}
      </div>
    ),
  }),
  helper.accessor("advisorCode", { header: "Assessor", cell: (info) => info.getValue() ?? "—" }),
  helper.accessor("score", {
    header: "Score",
    sortFn: "decimal",
    cell: (info) => <ScoreBar score={info.getValue()} />,
  }),
  helper.accessor("base", {
    header: "Base IRPFM",
    sortFn: "decimal",
    cell: (info) => brl(info.getValue()),
  }),
  helper.accessor("rate", {
    header: "Alíquota",
    sortFn: "decimal",
    cell: (info) => pct(info.getValue()),
  }),
  helper.accessor("minimumTaxDue", {
    header: "IRPFM devido",
    sortFn: "decimal",
    cell: (info) => brl(info.getValue()),
  }),
  helper.accessor("withholding", {
    header: "Retenção no ano",
    sortFn: "decimal",
    cell: (info) => brl(info.getValue()),
  }),
  helper.display({
    id: "saldo",
    header: "Saldo na declaração",
    cell: (info) => <Balance row={info.row.original} />,
  }),
  helper.accessor("effectiveTaxRate", {
    header: "Carga efetiva",
    sortFn: "decimal",
    cell: (info) => pct(info.getValue()),
  }),
  helper.display({
    id: "alertas",
    header: "Alertas",
    cell: (info) => <AlertBadges codes={info.row.original.alertCodes} />,
  }),
]);

const NUMERIC = new Set([
  "score",
  "base",
  "rate",
  "minimumTaxDue",
  "withholding",
  "effectiveTaxRate",
]);

export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const router = useRouter();
  const table = useTable({ features, columns, data: rows, enableSortingRemoval: true });

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      className={cn(
                        "px-3 py-2.5 font-medium whitespace-nowrap",
                        NUMERIC.has(header.column.id) && "text-right",
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            NUMERIC.has(header.column.id) && "flex-row-reverse",
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a, button")) return;
                  router.push(`/clientes/${encodeURIComponent(row.original.clientCode)}`);
                }}
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "px-3 py-2.5 align-top whitespace-nowrap",
                      NUMERIC.has(cell.column.id) && "text-right tabular-nums",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <ul className="grid gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.clientCode}>
            <Link
              href={`/clientes/${encodeURIComponent(row.clientCode)}`}
              className="block rounded-lg border bg-card p-3.5 active:bg-accent/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-1.5 text-muted-foreground">{row.position}.</span>
                    {row.clientCode}
                  </p>
                  {row.nickname ? (
                    <p className="truncate text-xs text-muted-foreground">{row.nickname}</p>
                  ) : null}
                </div>
                <ScoreBar score={row.score} />
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Base</dt>
                <dd className="text-right tabular-nums">{brl(row.base)}</dd>
                <dt className="text-muted-foreground">IRPFM devido</dt>
                <dd className="text-right tabular-nums">{brl(row.minimumTaxDue)}</dd>
              </dl>
              <div className="mt-2 text-sm">
                <Balance row={row} />
              </div>
              <div className="mt-2">
                <AlertBadges codes={row.alertCodes} limit={2} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
