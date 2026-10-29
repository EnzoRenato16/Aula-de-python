import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { Font } from "@react-pdf/renderer";

export const FONT_FAMILY = "IBM Plex Sans";

/**
 * Converts a WOFF 1.0 font into a plain TrueType/OpenType (sfnt) buffer.
 * WOFF is just sfnt with zlib-compressed tables; fontkit re-inflates them on
 * every glyph lookup, which made each PDF ~3.5× slower. Converting once at
 * startup removes that cost. Spec: https://www.w3.org/TR/WOFF/
 */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString("latin1", 0, 4) !== "wOFF") throw new Error("Not a WOFF 1.0 font");
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = Array.from({ length: numTables }, (_, index) => {
    const entry = 44 + index * 20;
    const offset = woff.readUInt32BE(entry + 4);
    const compLength = woff.readUInt32BE(entry + 8);
    const origLength = woff.readUInt32BE(entry + 12);
    const raw = woff.subarray(offset, offset + compLength);
    return {
      tag: woff.subarray(entry, entry + 4),
      checksum: woff.readUInt32BE(entry + 16),
      data: compLength < origLength ? inflateSync(raw) : raw,
    };
  });

  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const headerSize = 12 + numTables * 16;
  const padded = (length: number) => (length + 3) & ~3;
  const total = tables.reduce((size, table) => size + padded(table.data.length), headerSize);
  const out = Buffer.alloc(total);

  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange, 10);
  let offset = headerSize;
  tables.forEach((table, index) => {
    const record = 12 + index * 16;
    table.tag.copy(out, record);
    out.writeUInt32BE(table.checksum, record + 4);
    out.writeUInt32BE(offset, record + 8);
    out.writeUInt32BE(table.data.length, record + 12);
    table.data.copy(out, offset);
    offset += padded(table.data.length);
  });
  return out;
}

let registered = false;

/**
 * Registers IBM Plex Sans (OFL-1.1, from the official @ibm/plex-sans package).
 * The full ("complete") cuts include every symbol the trail uses: − ≤ → × ÷ §.
 */
export function registerFonts(): void {
  if (registered) return;
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("@ibm/plex-sans/package.json"));
  const src = (name: string) => {
    const woff = readFileSync(join(root, "fonts", "complete", "woff", `IBMPlexSans-${name}.woff`));
    return `data:font/ttf;base64,${woffToSfnt(woff).toString("base64")}`;
  };
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: src("Regular"), fontWeight: 400 },
      { src: src("Italic"), fontWeight: 400, fontStyle: "italic" },
      { src: src("Medium"), fontWeight: 500 },
      { src: src("SemiBold"), fontWeight: 600 },
      { src: src("Bold"), fontWeight: 700 },
    ],
  });
  // Tables of numbers and legal references must never be hyphenated.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
