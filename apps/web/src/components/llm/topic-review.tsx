import { TOPIC_DRAFT_SECTIONS, type TopicDraftPayload, type TopicDraftSection } from "@ds/shared";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ListEditor } from "@/components/list-editor";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { es } from "@/i18n/es";
import { SectionCard } from "./section-card";
import type { Draft } from "./types";
import type { useDraftActions } from "./use-draft-actions";

interface Current {
  description: string;
  practicePoints: string[];
  successCriteria: string;
}

export function TopicReview({
  draft,
  actions,
  onRegenerate,
  regenerating,
}: {
  draft: Draft;
  actions: ReturnType<typeof useDraftActions>;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const payload = draft.payload as TopicDraftPayload;
  const current = draft.current as Current | null;
  const [values, setValues] = useState<TopicDraftPayload>(payload);
  const busy =
    actions.section.isPending ||
    actions.acceptAll.isPending ||
    actions.discard.isPending ||
    regenerating;
  const stateOf = (section: TopicDraftSection) => draft.review[section]?.state ?? "discarded";
  const set = <K extends TopicDraftSection>(key: K, value: TopicDraftPayload[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const editors: Record<TopicDraftSection, { editor: ReactNode; current: ReactNode }> = {
    description: {
      editor: (
        <Textarea
          aria-label={es.review.sections.description}
          className="min-h-40"
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
        />
      ),
      current: current?.description ? <Markdown>{current.description}</Markdown> : es.review.empty,
    },
    practicePoints: {
      editor: (
        <ListEditor
          value={values.practicePoints}
          onChange={(points) => set("practicePoints", points)}
        />
      ),
      current: current?.practicePoints.length ? (
        <ul className="list-disc space-y-1 pl-6">
          {current.practicePoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : (
        es.review.empty
      ),
    },
    successCriteria: {
      editor: (
        <Textarea
          aria-label={es.review.sections.successCriteria}
          value={values.successCriteria}
          onChange={(event) => set("successCriteria", event.target.value)}
        />
      ),
      current: current?.successCriteria || es.review.empty,
    },
  };

  const visible = TOPIC_DRAFT_SECTIONS.filter((section) => {
    const value = payload[section];
    const empty = Array.isArray(value) ? value.length === 0 : value.trim() === "";
    return !(empty && stateOf(section) === "discarded");
  });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="topic-draft-heading">
      <h2 id="topic-draft-heading" className="text-lg font-semibold">
        {es.review.heading}
      </h2>
      {visible.map((section) => (
        <SectionCard
          key={section}
          title={es.review.sections[section]}
          state={stateOf(section)}
          current={editors[section].current}
          busy={busy}
          onAccept={() =>
            actions.section.mutate({ section, action: "accept", value: values[section] })
          }
          onDiscard={() => actions.section.mutate({ section, action: "discard" })}
        >
          {editors[section].editor}
        </SectionCard>
      ))}
      <div className="sticky bottom-20 z-10 flex flex-wrap gap-2 rounded-xl border bg-background/95 p-3 backdrop-blur lg:bottom-4">
        <Button
          onClick={() =>
            actions.acceptAll.mutate(
              Object.fromEntries(
                TOPIC_DRAFT_SECTIONS.filter((section) => stateOf(section) === "pending").map(
                  (section) => [section, values[section]],
                ),
              ),
            )
          }
          disabled={busy}
        >
          {es.review.acceptAll}
        </Button>
        <Button variant="outline" onClick={onRegenerate} disabled={busy}>
          <RefreshCw aria-hidden />
          {es.review.regenerate}
        </Button>
        <Button variant="ghost" onClick={() => actions.discard.mutate()} disabled={busy}>
          {es.llm.discardDraft}
        </Button>
      </div>
    </section>
  );
}
