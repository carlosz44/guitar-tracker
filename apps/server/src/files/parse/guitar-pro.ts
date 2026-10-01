import * as alphaTab from "@coderline/alphatab";
import type { GuitarProMeta } from "./types";

type Score = ReturnType<typeof alphaTab.importer.ScoreLoader.loadScoreFromBytes>;

alphaTab.Logger.logLevel = alphaTab.LogLevel.None;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DURATION_NAMES: Record<number, string> = {
  [-4]: "quadruple-whole",
  [-2]: "double-whole",
  1: "whole",
  2: "half",
  4: "quarter",
  8: "8th",
  16: "16th",
  32: "32nd",
  64: "64th",
  128: "128th",
  256: "256th",
};

export function noteName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function loadGuitarPro(bytes: Uint8Array): Score {
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings());
}

function tuningOf(score: Score, trackIndex: number) {
  const staff = score.tracks[trackIndex]?.staves[0];
  if (!staff || staff.isPercussion) return "";
  return [...staff.tuning].reverse().map(noteName).join(" ");
}

export function guitarProMeta(score: Score): GuitarProMeta {
  const timeSignatures = [
    ...new Set(
      score.masterBars.map(
        (bar) => `${bar.timeSignatureNumerator}/${bar.timeSignatureDenominator}`,
      ),
    ),
  ];
  return {
    title: score.title,
    artist: score.artist,
    tempo: score.tempo,
    timeSignatures,
    tunings: score.tracks.map((_, index) => tuningOf(score, index)),
    tracks: score.tracks.map((track) => track.name),
    barCount: score.masterBars.length,
  };
}

export function guitarProText(score: Score) {
  const meta = guitarProMeta(score);
  const lines = [
    `Title: ${meta.title || "—"} | Artist: ${meta.artist || "—"} | Tempo: ${meta.tempo} | Time: ${meta.timeSignatures.join(", ")} | Bars: ${meta.barCount}`,
  ];

  score.tracks.forEach((track, trackIndex) => {
    const staff = track.staves[0];
    if (!staff) return;
    if (staff.isPercussion) {
      lines.push(`Track ${trackIndex + 1} "${track.name}" percussion`);
      return;
    }
    lines.push(`Track ${trackIndex + 1} "${track.name}" tuning ${tuningOf(score, trackIndex)}`);
    const stringCount = staff.tuning.length;
    let lastDuration: number | undefined;

    staff.bars.forEach((bar, barIndex) => {
      const section = score.masterBars[barIndex]?.section;
      if (section) lines.push(`Section ${section.text || section.marker}`);
      const tokens: string[] = [];
      for (const beat of bar.voices[0]?.beats ?? []) {
        if (beat.duration !== lastDuration) {
          tokens.push(DURATION_NAMES[beat.duration] ?? String(beat.duration));
          lastDuration = beat.duration;
        }
        if (beat.isRest || beat.notes.length === 0) {
          tokens.push("r");
          continue;
        }
        const notes = beat.notes
          .map((note) => ({
            string: stringCount - note.string + 1,
            fret: note.isDead ? "x" : String(note.fret),
          }))
          .sort((a, b) => b.string - a.string)
          .map((note) => `s${note.string}:${note.fret}`);
        tokens.push(notes.length === 1 ? (notes[0] ?? "") : `[${notes.join(" ")}]`);
      }
      lines.push(`Bar ${barIndex + 1}: ${tokens.join(" ")}`);
    });
  });

  return { text: lines.join("\n"), meta };
}
