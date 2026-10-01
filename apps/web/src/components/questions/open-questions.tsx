import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { es, validationMessage } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { lessonsQuery } from "@/lib/queries";

type OpenQuestion = { id: string; text: string; topic: { id: string; title: string } | null };
type Change = {
  status: "answered" | "dismissed";
  answer?: string;
  answeredInLessonId?: string | null;
};

export function OpenQuestions({
  questions,
  lessonId,
}: {
  questions: OpenQuestion[];
  lessonId: string;
}) {
  const queryClient = useQueryClient();
  const [answering, setAnswering] = useState<OpenQuestion | null>(null);
  const update = useMutation({
    mutationFn: async ({ id, change }: { id: string; change: Change }) =>
      (await ensureOk(await api.questions[":id"].$patch({ param: { id }, json: change }))).json(),
    onSuccess: async () => {
      setAnswering(null);
      await Promise.all(
        ["questions", "lessons", "topics"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
    onError: (error) => toast.error(errorMessage(error, es.common.genericError)),
  });

  if (questions.length === 0) return <p className="text-muted-foreground">{es.questions.none}</p>;

  return (
    <>
      <ul className="flex flex-col gap-3">
        {questions.map((question) => (
          <li key={question.id} className="flex flex-col gap-3 rounded-xl border p-4">
            <p>{question.text}</p>
            {question.topic && (
              <p className="text-sm text-muted-foreground">{question.topic.title}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setAnswering(question)}>
                <Check aria-hidden />
                {es.questions.answer}
              </Button>
              <Button
                variant="ghost"
                onClick={() => update.mutate({ id: question.id, change: { status: "dismissed" } })}
              >
                <X aria-hidden />
                {es.questions.dismiss}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {answering && (
        <AnswerDialog
          question={answering}
          defaultLessonId={lessonId}
          onClose={() => setAnswering(null)}
          onSave={(answer, answeredInLessonId) =>
            update.mutate({
              id: answering.id,
              change: { status: "answered", answer, answeredInLessonId },
            })
          }
          pending={update.isPending}
        />
      )}
    </>
  );
}

function AnswerDialog({
  question,
  defaultLessonId,
  onClose,
  onSave,
  pending,
}: {
  question: OpenQuestion;
  defaultLessonId: string;
  onClose: () => void;
  onSave: (answer: string, lessonId: string | null) => void;
  pending: boolean;
}) {
  const { data } = useQuery(lessonsQuery);
  const [answer, setAnswer] = useState("");
  const [lessonId, setLessonId] = useState(defaultLessonId);
  const [missing, setMissing] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.questions.answerTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">{question.text}</p>
        <Field data-invalid={missing ? true : undefined}>
          <FieldLabel htmlFor="answer-text">{es.questions.answerText}</FieldLabel>
          <Textarea
            id="answer-text"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
          {missing && <FieldError>{validationMessage("question.answer")}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="answer-lesson">{es.questions.answeredIn}</FieldLabel>
          <NativeSelect
            id="answer-lesson"
            value={lessonId}
            onChange={(event) => setLessonId(event.target.value)}
          >
            <option value="">{es.questions.noLesson}</option>
            {(data?.lessons ?? []).map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {`${lesson.title} · ${formatDate(lesson.date)}`}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {es.questions.cancel}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              answer.trim() ? onSave(answer.trim(), lessonId || null) : setMissing(true)
            }
          >
            {es.questions.markAnswered}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
