import { useQuery } from "@tanstack/react-query";
import { es } from "@/i18n/es";
import { draftQuery } from "@/lib/queries";
import { DraftFailed, DraftWaiting } from "./draft-status";
import { TopicReview } from "./topic-review";
import type { DraftRef } from "./types";
import { useDraftActions } from "./use-draft-actions";
import { useStartDraft } from "./use-start-draft";

export function TopicDraft({
  topicId,
  draft: ref,
}: {
  topicId: string;
  draft: NonNullable<DraftRef>;
}) {
  const { data: draft } = useQuery(draftQuery(ref.id));
  const start = useStartDraft({ type: "topic", id: topicId });
  const actions = useDraftActions(ref.id, ["topics", "detail", topicId]);

  if (!draft || draft.status === "queued" || draft.status === "running") {
    return <DraftWaiting message={es.llm.readingTopic} />;
  }
  if (draft.status === "failed") {
    return (
      <DraftFailed
        draft={draft}
        onRetry={() => start.mutate(undefined)}
        onDiscard={() => actions.discard.mutate()}
        pending={start.isPending || actions.discard.isPending}
      />
    );
  }
  if (draft.status !== "pending") return null;
  return (
    <TopicReview
      draft={draft}
      actions={actions}
      onRegenerate={() => start.mutate(undefined)}
      regenerating={start.isPending}
    />
  );
}
