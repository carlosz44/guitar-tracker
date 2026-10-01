export type ParseKind = "guitar_pro" | "docx";

export type ExtractionError = "unsupported_format" | "parse_error" | "timeout" | "out_of_memory";

export interface GuitarProMeta {
  title: string;
  artist: string;
  tempo: number;
  timeSignatures: string[];
  tunings: string[];
  tracks: string[];
  barCount: number;
}

export type ParseResult =
  | { status: "done"; text: string; meta: GuitarProMeta | null; truncated: boolean }
  | { status: "failed"; error: ExtractionError };

export interface ParseInput {
  kind: ParseKind;
  fileName: string;
  bytes: Uint8Array;
}
