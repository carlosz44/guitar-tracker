import { describe, expect, it } from "vitest";
import { corruptBytes, docxFixture, guitarProFixture } from "../../test/fixtures";
import { capText, MAX_EXTRACTED_CHARS, TRUNCATION_MARK } from "./cap";
import { hasExpectedSignature } from "./detect";
import { noteName } from "./guitar-pro";
import { parseFile } from "./parse";

const ascii = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)));

describe("parseFile", () => {
  it("AC-6: turns a Guitar Pro file into compact text and meta", async () => {
    const result = await parseFile({
      kind: "guitar_pro",
      fileName: "triadas.gp",
      bytes: guitarProFixture(),
    });
    expect(result).toEqual({
      status: "done",
      truncated: false,
      meta: {
        title: "Tríadas dórico",
        artist: "Profe",
        tempo: 90,
        timeSignatures: ["4/4"],
        tunings: ["E2 A2 D3 G3 B3 E4"],
        tracks: ["Guitarra"],
        barCount: 2,
      },
      text: [
        "Title: Tríadas dórico | Artist: Profe | Tempo: 90 | Time: 4/4 | Bars: 2",
        'Track 1 "Guitarra" tuning E2 A2 D3 G3 B3 E4',
        "Section A",
        "Bar 1: 8th [s3:7 s2:6 s1:5] [s3:9 s2:7 s1:7] quarter r s6:5",
        "Bar 2: s5:3 s4:2 s3:0 s2:0",
      ].join("\n"),
    });
  });

  it("AC-6: extracts plain text from a docx", async () => {
    const result = await parseFile({ kind: "docx", fileName: "notas.docx", bytes: docxFixture() });
    expect(result).toEqual({
      status: "done",
      meta: null,
      truncated: false,
      text: "Tríadas de dórico\n\nCuerdas 1 a 3, corcheas a 90 BPM.",
    });
  });

  it("AC-7: reports a file whose content doesn't match its extension as unsupported", async () => {
    expect(
      await parseFile({ kind: "guitar_pro", fileName: "x.gp5", bytes: guitarProFixture() }),
    ).toEqual({
      status: "failed",
      error: "unsupported_format",
    });
  });

  it("AC-7: reports a corrupt file as a parse error", async () => {
    expect(await parseFile({ kind: "guitar_pro", fileName: "x.gp", bytes: corruptBytes })).toEqual({
      status: "failed",
      error: "parse_error",
    });
    expect(await parseFile({ kind: "docx", fileName: "x.docx", bytes: corruptBytes })).toEqual({
      status: "failed",
      error: "parse_error",
    });
  });
});

describe("hasExpectedSignature", () => {
  it.each([
    ["song.gp", new Uint8Array([0x50, 0x4b, 0x03, 0x04]), true],
    ["song.gpx", ascii("BCFZ...."), true],
    ["song.gpx", ascii("BCFS...."), true],
    ["song.gp5", ascii("\x18FICHIER GUITAR PRO v5.00"), true],
    ["song.gp3", ascii("\x18FICHIER GUITAR PRO v3.00"), true],
    ["song.gp5", ascii("%PDF-1.7"), false],
    ["song.gpx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]), false],
  ])("%s", (fileName, bytes, expected) => {
    expect(hasExpectedSignature("guitar_pro", fileName, bytes)).toBe(expected);
  });
});

describe("capText", () => {
  it("caps extracted text at 40,000 characters and marks it", () => {
    const { text, truncated } = capText("a".repeat(MAX_EXTRACTED_CHARS + 10));
    expect(truncated).toBe(true);
    expect(text).toBe("a".repeat(MAX_EXTRACTED_CHARS) + TRUNCATION_MARK);
    expect(capText("short")).toEqual({ text: "short", truncated: false });
  });
});

describe("noteName", () => {
  it("names MIDI notes with scientific pitch", () => {
    expect([40, 45, 50, 55, 59, 64].map(noteName)).toEqual(["E2", "A2", "D3", "G3", "B3", "E4"]);
  });
});
