/** @jsxRuntime automatic */
/** @jsxImportSource react */

import type { ClientResult } from "@raiox/engine";
import { renderToBuffer } from "@react-pdf/renderer";
import { type Brand, ClientReport } from "./ClientReport.tsx";
import { registerFonts } from "./fonts.ts";

/**
 * Renders the one-page PDF of a client. `fontsDir` is only needed when this
 * package is bundled (see registerFonts).
 */
export async function renderClientReport(
  result: ClientResult,
  options: { brand: Brand; generatedAt?: Date; fontsDir?: string },
): Promise<Buffer> {
  registerFonts(options.fontsDir);
  return renderToBuffer(
    <ClientReport
      result={result}
      brand={options.brand}
      generatedAt={options.generatedAt ?? new Date()}
    />,
  );
}
