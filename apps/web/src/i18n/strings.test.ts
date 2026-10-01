// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { es } from "./es";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const webSrc = fileURLToPath(new URL("../", import.meta.url));
const biome = join(repoRoot, "node_modules/.bin/biome");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : tsxFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

function lintJsxLiterals(args: string[], input?: string) {
  return spawnSync(biome, ["lint", "--only=style/noJsxLiterals", ...args], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
  });
}

describe("visible strings", () => {
  it("AC-6: no JSX text is written inline; it all comes from i18n/es.ts", () => {
    const result = lintJsxLiterals([relative(repoRoot, webSrc)]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("AC-6: the lint rule catches inline text (control)", () => {
    const result = lintJsxLiterals(
      ["--stdin-file-path=apps/web/src/control.tsx"],
      "export const A = () => <p>Hola</p>;\n",
    );
    expect(result.status).not.toBe(0);
  });

  it("AC-6: user-facing attributes are never hard-coded text", () => {
    const attribute = /\b(aria-label|placeholder|title|alt)="([^"]+)"/g;
    const offenders = tsxFiles(webSrc).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(attribute)].map(
        (match) => `${relative(webSrc, file)}: ${match[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("AC-6: navigation labels are Spanish", () => {
    expect(Object.values(es.nav).slice(1)).toEqual([
      "Hoy",
      "Clases",
      "Temas",
      "Historial",
      "Ajustes",
    ]);
  });
});
