import {
  LESSON_DRAFT_SECTIONS,
  LESSON_RELATIONS,
  type LessonDraftPayload,
  type LessonDraftSection,
  type LessonRelation,
  type SuggestedTopic,
  TOPIC_CATEGORIES,
  type TopicCategory,
} from "@ds/shared";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { ListEditor } from "@/components/list-editor";
import { Markdown } from "@/components/markdown";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { es } from "@/i18n/es";
import { SkippedFiles } from "./draft-status";
import { SectionCard } from "./section-card";
import type { Draft } from "./types";
import type { useDraftActions } from "./use-draft-actions";

type Checked<T> = T & { checked: boolean };
interface Values {
  title: string;
  summary: string;
  practicePoints: string[];
  homework: string;
  topics: Checked<SuggestedTopic>[];
  answers: Checked<LessonDraftPayload["answers"][number]>[];
  questions: Checked<LessonDraftPayload["questions"][number]>[];
}
interface Current {
  title: string;
  summary: string;
  practicePoints: string[];
  homework: string;
  questions: { id: string; text: string; status: string }[];
  topics: { id: string; title: string }[];
}

const checkedAll = <T,>(items: T[]) => items.map((item) => ({ ...item, checked: true }));

function initialValues(payload: LessonDraftPayload): Values {
  return {
    title: payload.title,
    summary: payload.summary,
    practicePoints: payload.practicePoints,
    homework: payload.homework,
    topics: checkedAll(payload.topics),
    answers: checkedAll(payload.answers),
    questions: checkedAll(payload.questions),
  };
}

const orEmpty = (text: string) => text || es.review.empty;

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        className="size-5 accent-[var(--color-brand)]"
        aria-label={es.review.include(label)}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}

export function LessonReview({
  draft,
  actions,
  onRegenerate,
  regenerating,
}: {
  draft: Draft;
  actions: ReturnType<typeof useDraftActions>;
  onRegenerate: (instruction: string) => void;
  regenerating: boolean;
}) {
  const payload = draft.payload as LessonDraftPayload;
  const current = draft.current as Current | null;
  const [values, setValues] = useState(() => initialValues(payload));
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [instruction, setInstruction] = useState(draft.instruction);
  const busy =
    actions.section.isPending ||
    actions.acceptAll.isPending ||
    actions.discard.isPending ||
    regenerating;
  const stateOf = (section: LessonDraftSection) => draft.review[section]?.state ?? "discarded";
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const updateItem = <K extends "topics" | "answers" | "questions">(
    key: K,
    index: number,
    change: Partial<Values[K][number]>,
  ) =>
    set(
      key,
      values[key].map((item, i) => (i === index ? { ...item, ...change } : item)) as Values[K],
    );

  const topicTitle = (ref: string | null) =>
    ref
      ? (values.topics.find((topic) => topic.ref === ref)?.title ??
        current?.topics.find((topic) => topic.id === ref)?.title ??
        null)
      : null;
  const questionOf = (id: string) => current?.questions.find((question) => question.id === id);

  const visible = LESSON_DRAFT_SECTIONS.filter((section) => {
    const value = payload[section];
    const empty = Array.isArray(value) ? value.length === 0 : value.trim() === "";
    return !(empty && stateOf(section) === "discarded");
  });

  const card = (
    section: LessonDraftSection,
    editor: React.ReactNode,
    currentNode?: React.ReactNode,
  ) => (
    <SectionCard
      key={section}
      title={es.review.sections[section]}
      state={stateOf(section)}
      current={currentNode}
      busy={busy}
      onAccept={() => actions.section.mutate({ section, action: "accept", value: values[section] })}
      onDiscard={() => actions.section.mutate({ section, action: "discard" })}
    >
      {editor}
    </SectionCard>
  );

  const editors: Record<LessonDraftSection, () => React.ReactNode> = {
    title: () =>
      card(
        "title",
        <Input
          aria-label={es.review.sections.title}
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
        />,
        current ? orEmpty(current.title) : undefined,
      ),
    summary: () =>
      card(
        "summary",
        <Textarea
          aria-label={es.review.sections.summary}
          className="min-h-40"
          value={values.summary}
          onChange={(event) => set("summary", event.target.value)}
        />,
        current ? (
          current.summary ? (
            <Markdown>{current.summary}</Markdown>
          ) : (
            es.review.empty
          )
        ) : undefined,
      ),
    practicePoints: () =>
      card(
        "practicePoints",
        <ListEditor
          value={values.practicePoints}
          onChange={(points) => set("practicePoints", points)}
        />,
        current ? (
          current.practicePoints.length ? (
            <ul className="list-disc space-y-1 pl-6">
              {current.practicePoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : (
            es.review.empty
          )
        ) : undefined,
      ),
    homework: () =>
      card(
        "homework",
        <Textarea
          aria-label={es.review.sections.homework}
          value={values.homework}
          onChange={(event) => set("homework", event.target.value)}
        />,
        current ? orEmpty(current.homework) : undefined,
      ),
    topics: () =>
      card(
        "topics",
        <ul className="flex flex-col gap-4">
          {values.topics.map((topic, index) => {
            const n = index + 1;
            const parent = topic.kind === "new" ? topicTitle(topic.parentRef) : null;
            return (
              <li key={topic.ref} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
                <CheckRow
                  label={topic.title}
                  checked={topic.checked}
                  onChange={(checked) => updateItem("topics", index, { checked })}
                >
                  <span className="font-medium">{topic.title}</span>
                  <Badge variant="secondary">
                    {topic.kind === "new" ? es.review.newTopic : es.review.existingTopic}
                  </Badge>
                </CheckRow>
                {parent && (
                  <p className="text-sm text-muted-foreground">{es.review.parent(parent)}</p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {topic.kind === "new" && (
                    <Input
                      aria-label={es.review.topicTitle(n)}
                      value={topic.title}
                      onChange={(event) =>
                        updateItem("topics", index, { title: event.target.value })
                      }
                    />
                  )}
                  <NativeSelect
                    aria-label={es.review.relation(n)}
                    value={topic.relation}
                    onChange={(event) =>
                      updateItem("topics", index, {
                        relation: event.target.value as LessonRelation,
                      })
                    }
                  >
                    {LESSON_RELATIONS.map((relation) => (
                      <option key={relation} value={relation}>
                        {es.relations[relation]}
                      </option>
                    ))}
                  </NativeSelect>
                  {topic.kind === "new" && (
                    <>
                      <NativeSelect
                        aria-label={es.review.category(n)}
                        value={topic.category ?? "other"}
                        onChange={(event) =>
                          updateItem("topics", index, {
                            category: event.target.value as TopicCategory,
                          })
                        }
                      >
                        {TOPIC_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {es.categories[category]}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input
                        aria-label={es.review.targetBpm(n)}
                        type="number"
                        inputMode="numeric"
                        value={topic.targetBpm ?? ""}
                        onChange={(event) =>
                          updateItem("topics", index, {
                            targetBpm:
                              event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                      <Textarea
                        aria-label={es.review.description(n)}
                        className="sm:col-span-2"
                        value={topic.description}
                        onChange={(event) =>
                          updateItem("topics", index, { description: event.target.value })
                        }
                      />
                      <Input
                        aria-label={es.review.successCriteria(n)}
                        className="sm:col-span-2"
                        value={topic.successCriteria}
                        onChange={(event) =>
                          updateItem("topics", index, { successCriteria: event.target.value })
                        }
                      />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>,
      ),
    answers: () =>
      card(
        "answers",
        <ul className="flex flex-col gap-4">
          {values.answers.map((answer, index) => {
            const question = questionOf(answer.questionId);
            const resolved = question?.status !== "open";
            return (
              <li key={answer.questionId} className="flex flex-col gap-2">
                <CheckRow
                  label={question?.text ?? ""}
                  checked={answer.checked && !resolved}
                  disabled={resolved}
                  onChange={(checked) => updateItem("answers", index, { checked })}
                >
                  <span className="font-medium">{question?.text}</span>
                  {resolved && <Badge variant="secondary">{es.review.resolved}</Badge>}
                </CheckRow>
                <Textarea
                  aria-label={es.review.answer(index + 1)}
                  value={answer.answer}
                  disabled={resolved}
                  onChange={(event) => updateItem("answers", index, { answer: event.target.value })}
                />
              </li>
            );
          })}
        </ul>,
      ),
    questions: () =>
      card(
        "questions",
        <ul className="flex flex-col gap-3">
          {values.questions.map((question, index) => {
            const topic = topicTitle(question.topicRef);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: suggestions have no id and are edited in place.
              <li key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <CheckRow
                    label={question.text}
                    checked={question.checked}
                    onChange={(checked) => updateItem("questions", index, { checked })}
                  />
                  <Input
                    aria-label={es.review.questionText(index + 1)}
                    value={question.text}
                    onChange={(event) =>
                      updateItem("questions", index, { text: event.target.value })
                    }
                  />
                </div>
                {topic && (
                  <p className="pl-8 text-sm text-muted-foreground">
                    {es.review.questionTopic(topic)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>,
      ),
  };

  const pendingValues = () =>
    Object.fromEntries(
      LESSON_DRAFT_SECTIONS.filter((section) => stateOf(section) === "pending").map((section) => [
        section,
        values[section],
      ]),
    );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="draft-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="draft-heading" className="text-lg font-semibold">
          {es.review.heading}
        </h2>
        <Button variant="ghost" onClick={() => actions.discard.mutate()} disabled={busy}>
          {es.llm.discardDraft}
        </Button>
      </div>
      <SkippedFiles draft={draft} />
      {visible.map((section) => editors[section]())}
      <div className="sticky bottom-20 z-10 flex gap-2 rounded-xl border bg-background/95 p-3 pr-20 backdrop-blur lg:bottom-4 lg:pr-3">
        <Button onClick={() => actions.acceptAll.mutate(pendingValues())} disabled={busy}>
          {es.review.acceptAll}
        </Button>
        <Button variant="outline" onClick={() => setRegenerateOpen(true)} disabled={busy}>
          <RefreshCw aria-hidden />
          {es.review.regenerate}
        </Button>
      </div>
      <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.review.regenerateTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 text-sm">
            <label htmlFor="regenerate-instruction">{es.review.instruction}</label>
            <Textarea
              id="regenerate-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <span className="text-muted-foreground">{es.review.instructionHint}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateOpen(false)}>
              {es.review.cancel}
            </Button>
            <Button
              onClick={() => {
                setRegenerateOpen(false);
                onRegenerate(instruction.trim());
              }}
            >
              {es.review.regenerate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
