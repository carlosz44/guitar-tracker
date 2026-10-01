import type { ParseKind } from "./types";

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const GP3_TO_5 = "FICHIER GUITAR PRO";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(text: string) {
  return [...text].map((char) => char.charCodeAt(0));
}

export function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function hasExpectedSignature(kind: ParseKind, fileName: string, bytes: Uint8Array) {
  if (kind === "docx") return startsWith(bytes, ZIP);
  switch (extensionOf(fileName)) {
    case ".gp":
      return startsWith(bytes, ZIP);
    case ".gpx":
      return startsWith(bytes, ascii("BCFZ")) || startsWith(bytes, ascii("BCFS"));
    case ".gp3":
    case ".gp4":
    case ".gp5":
      return startsWith(bytes, ascii(GP3_TO_5), 1);
    default:
      return false;
  }
}
