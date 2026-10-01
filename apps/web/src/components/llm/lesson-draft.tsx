import { useQuery } from "@tanstack/react-query";
import { es } from "@/i18n/es";
import { draftQuery } from "@/lib/queries";
import { DraftFailed, DraftWaiting } from "./draft-status";
import { LessonReview } from "./lesson-review";
import type { DraftRef } from "./types";
import { useDraftActions } from "./use-draft-actions";
import { useStartDraft } from "./use-start-draft";

export function LessonDraft({
  lessonId,
  draft: ref,
}: {
  lessonId: string;
  draft: NonNullable<DraftRef>;
}) {
  const { data: draft } = useQuery(draftQuery(ref.id));
  const start = useStartDraft({ type: "lesson", id: lessonId });
  const actions = useDraftActions(ref.id, ["lessons", lessonId]);

  if (!draft || draft.status === "queued" || draft.status === "running") {
    return <DraftWaiting message={es.llm.readingLesson} />;
  }
  if (draft.status === "failed") {
    return (
      <DraftFailed
        draft={draft}
        onRetry={() => start.mutate(draft.instruction)}
        onDiscard={() => actions.discard.mutate()}
        pending={start.isPending || actions.discard.isPending}
      />
    );
  }
  if (draft.status !== "pending") return null;
  return (
    <LessonReview
      draft={draft}
      actions={actions}
      onRegenerate={(instruction) => start.mutate(instruction)}
      regenerating={start.isPending}
    />
  );
}
