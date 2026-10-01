import { describe, expect, it } from "vitest";
import { backupKey, backupKeyDate, lessonFileKey, safeFileName } from "./keys";

describe("backup keys", () => {
  it("names backups by calendar date", () => {
    expect(backupKey("2026-10-01")).toBe("db-backups/guitartracker-2026-10-01.dump");
  });

  it("reads the date back and ignores other objects", () => {
    expect(backupKeyDate("db-backups/guitartracker-2026-10-01.dump")).toBe("2026-10-01");
    expect(backupKeyDate("db-backups/notes.txt")).toBeNull();
    expect(backupKeyDate("lesson-files/x/guitartracker-2026-10-01.dump")).toBeNull();
  });
});

describe("lesson file keys", () => {
  it("nests files under their lesson", () => {
    expect(lessonFileKey("lesson-1", "file-1", "Tríadas dórico.gp")).toBe(
      "lesson-files/lesson-1/file-1-Triadas-dorico.gp",
    );
  });
});

describe("safeFileName", () => {
  it.each([
    ["Tríadas dórico.gp", "Triadas-dorico.gp"],
    ["Ejercicio #3 (corcheas).PDF", "Ejercicio-3-corcheas.pdf"],
    ["../../etc/passwd", "etc-passwd"],
    ["   .gp5", "file.gp5"],
    ["ñandú", "nandu"],
    ["", "file"],
    ["my.file.v2.gp", "my-file-v2.gp"],
  ])("%s → %s", (input, expected) => {
    expect(safeFileName(input)).toBe(expected);
  });

  it("caps the length and keeps the extension", () => {
    const name = safeFileName(`${"a".repeat(300)}.docx`);
    expect(name).toHaveLength(100);
    expect(name.endsWith(".docx")).toBe(true);
  });
});
