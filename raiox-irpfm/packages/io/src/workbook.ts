import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import { normalizeHeader, SHEET_ORDER, type SheetKey } from "./schema.ts";
import type { Cell } from "./values.ts";

/** One data row; `rowNumber` is the spreadsheet row (header = 1). */
export interface RawRow {
  rowNumber: number;
  cells: Map<string, Cell>;
}

export interface RawSheet {
  name: string;
  headers: string[];
  rows: RawRow[];
}

export type RawWorkbook = Map<string, RawSheet>;

/** Upper bound of data rows per file (protects memory; phase 5 adds upload limits). */
export const MAX_ROWS = 200_000;

/** Wraps the raw XML text of a numeric cell so it never becomes a JS float. */
class NumericText {
  constructor(readonly text: string) {}
}

function toCell(value: unknown): Cell | null {
  if (value === null || value === undefined) return null;
  if (value instanceof NumericText) return { text: value.text, numeric: true };
  if (typeof value === "boolean") return { text: value ? "S" : "N", numeric: false };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), numeric: false };
  const text = String(value);
  return text.trim() === "" ? null : { text, numeric: false };
}

/** Maps a sheet/file name to a known sheet key ("Rendimentos" → "rendimentos"). */
export function sheetKeyOf(name: string): SheetKey | null {
  const normalized = normalizeHeader(name.replace(/\.csv$/i, ""));
  return SHEET_ORDER.find((key) => normalized === key || normalized.endsWith(`_${key}`)) ?? null;
}

function buildSheet(name: string, data: readonly (readonly unknown[])[]): RawSheet {
  const [headerRow = [], ...body] = data;
  const headers = headerRow.map((value) => normalizeHeader(toCell(value)?.text ?? ""));
  if (body.length > MAX_ROWS) {
    throw new Error(`A aba "${name}" tem ${body.length} linhas; o limite é ${MAX_ROWS}.`);
  }
  const rows: RawRow[] = [];
  body.forEach((values, index) => {
    const cells = new Map<string, Cell>();
    headers.forEach((header, column) => {
      if (!header) return;
      const cell = toCell(values[column]);
      if (cell) cells.set(header, cell);
    });
    if (cells.size > 0) rows.push({ rowNumber: index + 2, cells });
  });
  return { name, headers: headers.filter(Boolean), rows };
}

/** Reads an .xlsx file. Numeric cells keep their exact stored text. */
export async function readXlsxWorkbook(input: Buffer | string): Promise<RawWorkbook> {
  const sheets = await readXlsxFile<NumericText>(input, {
    parseNumber: (text: string) => new NumericText(text),
  });
  const workbook: RawWorkbook = new Map();
  for (const { sheet, data } of sheets) {
    const key = sheetKeyOf(sheet);
    if (key) workbook.set(key, buildSheet(sheet, data));
  }
  return workbook;
}

function detectDelimiter(content: string): ";" | "," | "\t" {
  const firstLine = content.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 } as Record<";" | "," | "\t", number>;
  for (const char of firstLine) if (char in counts) counts[char as ";" | "," | "\t"]++;
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  return counts["\t"] > counts[","] ? "\t" : ",";
}

/**
 * Reads one or more CSV files. A single CSV with an unknown name is treated
 * as the `rendimentos` sheet. Delimiter (; , or tab) is detected per file.
 */
export function readCsvWorkbook(files: readonly { name: string; content: string }[]): RawWorkbook {
  const workbook: RawWorkbook = new Map();
  for (const file of files) {
    const key = sheetKeyOf(file.name) ?? (files.length === 1 ? "rendimentos" : null);
    if (!key) continue;
    const records = parseCsv(file.content, {
      delimiter: detectDelimiter(file.content),
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];
    workbook.set(key, buildSheet(file.name, records));
  }
  return workbook;
}
