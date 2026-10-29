/** @jsxRuntime automatic */
/** @jsxImportSource react */

import type { ClientResult } from "@raiox/engine";
import { renderToBuffer } from "@react-pdf/renderer";
import { type Brand, ClientReport } from "./ClientReport.tsx";
import { registerFonts } from "./fonts.ts";

/** Renders the one-page PDF of a client. */
export async function renderClientReport(
  result: ClientResult,
  options: { brand: Brand; generatedAt?: Date },
): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(
    <ClientReport
      result={result}
      brand={options.brand}
      generatedAt={options.generatedAt ?? new Date()}
    />,
  );
}
