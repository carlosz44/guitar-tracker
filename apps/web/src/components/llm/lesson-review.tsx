import type { Draft } from "./types";
import type { useDraftActions } from "./use-draft-actions";

export function LessonReview(_props: {
  draft: Draft;
  actions: ReturnType<typeof useDraftActions>;
  onRegenerate: (instruction: string) => void;
  regenerating: boolean;
}) {
  return null;
}
