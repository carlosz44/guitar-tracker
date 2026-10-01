import { capText } from "./cap";
import { hasExpectedSignature } from "./detect";
import { docxText } from "./docx";
import { guitarProText, loadGuitarPro } from "./guitar-pro";
import type { ParseInput, ParseResult } from "./types";

export async function parseFile({ kind, fileName, bytes }: ParseInput): Promise<ParseResult> {
  if (!hasExpectedSignature(kind, fileName, bytes))
    return { status: "failed", error: "unsupported_format" };
  try {
    if (kind === "docx") {
      return { status: "done", meta: null, ...capText(await docxText(bytes)) };
    }
    const { text, meta } = guitarProText(loadGuitarPro(bytes));
    return { status: "done", meta, ...capText(text) };
  } catch {
    return { status: "failed", error: "parse_error" };
  }
}
