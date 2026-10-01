import { describe, expect, it } from "vitest";
import { wouldCreateCycle } from "./cycle";

const parents = new Map<string, string | null>([
  ["dorian", null],
  ["dorian-triads", "dorian"],
  ["dorian-triads-inversions", "dorian-triads"],
  ["phrygian", null],
]);

describe("wouldCreateCycle", () => {
  it("AC-14: a topic can't be its own parent", () => {
    expect(wouldCreateCycle("dorian", "dorian", parents)).toBe(true);
  });

  it("AC-14: a topic can't become a child of its own descendant", () => {
    expect(wouldCreateCycle("dorian", "dorian-triads-inversions", parents)).toBe(true);
  });

  it("allows unrelated parents, clearing the parent, and re-parenting along the chain", () => {
    expect(wouldCreateCycle("dorian", "phrygian", parents)).toBe(false);
    expect(wouldCreateCycle("dorian-triads", null, parents)).toBe(false);
    expect(wouldCreateCycle("dorian-triads-inversions", "dorian", parents)).toBe(false);
  });

  it("stops on a cycle already in the data", () => {
    const broken = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(wouldCreateCycle("c", "a", broken)).toBe(true);
  });
});
