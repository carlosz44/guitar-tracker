import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCirclePlus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { es, validationMessage } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { topicsQuery } from "@/lib/queries";

export function QuestionDialog({ topicId, trigger }: { topicId?: string; trigger?: ReactNode }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState(topicId ?? "");
  const [missingText, setMissingText] = useState(false);
  const { data } = useQuery({ ...topicsQuery(), enabled: open });

  const save = useMutation({
    mutationFn: async () =>
      (
        await ensureOk(
          await api.questions.$post({ json: { text: text.trim(), topicId: topic || null } }),
        )
      ).json(),
    onSuccess: async () => {
      setOpen(false);
      setText("");
      toast.success(es.questions.saved);
      await Promise.all(
        ["questions", "lessons", "topics"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
    onError: (error) => toast.error(errorMessage(error, es.questions.saveError)),
  });

  const submit = () => {
    if (!text.trim()) {
      setMissingText(true);
      return;
    }
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTopic(topicId ?? "");
          setMissingText(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" aria-label={es.questions.addLabel}>
            <MessageCirclePlus aria-hidden />
            {es.questions.add}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.questions.dialogTitle}</DialogTitle>
        </DialogHeader>
        <Field data-invalid={missingText ? true : undefined}>
          <FieldLabel htmlFor="question-text">{es.questions.text}</FieldLabel>
          <Textarea
            id="question-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {missingText && <FieldError>{validationMessage("question.text")}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="question-topic">{es.questions.topic}</FieldLabel>
          <NativeSelect
            id="question-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            <option value="">{es.questions.noTopic}</option>
            {(data?.topics ?? [])
              .filter((option) => option.status !== "archived" || option.id === topicId)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button onClick={submit} disabled={save.isPending}>
            {es.questions.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
