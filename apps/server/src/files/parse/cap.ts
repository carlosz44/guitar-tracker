export const MAX_EXTRACTED_CHARS = 40_000;
export const TRUNCATION_MARK = "\n… (truncated)";

export function capText(text: string, limit = MAX_EXTRACTED_CHARS) {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit) + TRUNCATION_MARK, truncated: true };
}
