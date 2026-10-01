import mammoth from "mammoth";

export async function docxText(bytes: Uint8Array) {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value.replace(/\n{3,}/g, "\n\n").trim();
}
