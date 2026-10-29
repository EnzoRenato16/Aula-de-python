import { stringify } from "csv-stringify/sync";
import type { ImportIssue } from "./import.ts";

/**
 * CSV for Brazilian Excel: semicolon separator, decimal comma, UTF-8 with BOM
 * (so accents open correctly), CRLF line endings.
 */
export function toBrazilianCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const body = stringify(
    [header as string[], ...rows.map((row) => row.map((cell) => cell ?? ""))],
    {
      delimiter: ";",
      record_delimiter: "\r\n",
      quoted_match: /[;"\r\n]/,
    },
  );
  return `﻿${body}`;
}

/** "1234.56" → "1234,56" (no thousands separator, so Excel reads it as a number). */
export function decimalComma(canonical: string): string {
  return canonical.replace(".", ",");
}

export function issuesToCsv(issues: readonly ImportIssue[]): string {
  return toBrazilianCsv(
    ["gravidade", "aba", "linha", "coluna", "valor", "mensagem"],
    issues.map((issue) => [
      issue.severity,
      issue.sheet,
      issue.row === null ? null : String(issue.row),
      issue.column,
      issue.value,
      issue.message,
    ]),
  );
}
