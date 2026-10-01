import { readFileSync } from "node:fs";
import * as alphaTab from "@coderline/alphatab";

export const TRIADS_TEX = `\\title "Tríadas dórico" \\artist "Profe" \\tempo 90
.
\\track "Guitarra"
\\staff {tabs}
\\section "A" :8 (7.3 6.2 5.1) (9.3 7.2 7.1) r.4 5.6.4 |
:4 3.5 2.4 0.3 0.2`;

export function guitarProFixture(tex = TRIADS_TEX) {
  const settings = new alphaTab.Settings();
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString(tex, settings);
  return new alphaTab.exporter.Gp7Exporter().export(importer.readScore(), settings);
}

export function docxFixture() {
  return new Uint8Array(readFileSync(new URL("./fixtures/notes.docx", import.meta.url)));
}

export const corruptBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
