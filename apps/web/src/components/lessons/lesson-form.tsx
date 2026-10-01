import { type CreateLesson, createLessonSchema, validateUpload } from "@ds/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FileDropzone } from "@/components/files/file-dropzone";
import { ListEditor } from "@/components/list-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { es, validationMessage } from "@/i18n/es";
import { formatBytes, formatDayMonth } from "@/lib/format";

export function LessonForm({
  defaultValues,
  onSubmit,
  onSubmitAndEnrich,
  onCancel,
  pending,
  files,
}: {
  files?: { chosen: File[]; onChange: (files: File[]) => void };
  defaultValues: CreateLesson;
  onSubmit: (values: CreateLesson) => void;
  onSubmitAndEnrich?: (values: CreateLesson) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const form = useForm({ resolver: zodResolver(createLessonSchema), defaultValues });
  const { errors } = form.formState;
  const pointError = Array.isArray(errors.practicePoints)
    ? errors.practicePoints.find((error) => error?.message)?.message
    : errors.practicePoints?.message;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-2">
      <Field data-invalid={errors.rawNotes ? true : undefined} className="lg:row-span-6">
        <FieldLabel htmlFor="lesson-notes">{es.lessonForm.notes}</FieldLabel>
        <Textarea
          id="lesson-notes"
          className="min-h-48 lg:min-h-96"
          {...form.register("rawNotes")}
        />
        <FieldDescription>{es.lessonForm.notesHelp}</FieldDescription>
      </Field>

      <Field data-invalid={errors.title ? true : undefined}>
        <FieldLabel htmlFor="lesson-title">{es.lessonForm.title}</FieldLabel>
        <Input
          id="lesson-title"
          aria-invalid={errors.title ? true : undefined}
          {...form.register("title")}
        />
        {errors.title && <FieldError>{validationMessage(errors.title.message)}</FieldError>}
      </Field>

      <Field data-invalid={errors.date ? true : undefined} className="max-w-48">
        <FieldLabel htmlFor="lesson-date">{es.lessonForm.date}</FieldLabel>
        <Input id="lesson-date" type="date" {...form.register("date")} />
        {errors.date && <FieldError>{validationMessage(errors.date.message)}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="lesson-summary">{es.lessonForm.summary}</FieldLabel>
        <Textarea id="lesson-summary" {...form.register("summary")} />
      </Field>

      <Field data-invalid={pointError ? true : undefined}>
        <FieldLabel htmlFor="lesson-points">{es.lessonForm.practicePoints}</FieldLabel>
        <Controller
          control={form.control}
          name="practicePoints"
          render={({ field }) => (
            <ListEditor id="lesson-points" value={field.value ?? []} onChange={field.onChange} />
          )}
        />
        {pointError && <FieldError>{validationMessage(pointError)}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="lesson-homework">{es.lessonForm.homework}</FieldLabel>
        <Textarea id="lesson-homework" {...form.register("homework")} />
      </Field>

      {files && <FilePicker chosen={files.chosen} onChange={files.onChange} />}

      <div className="flex flex-wrap gap-3 lg:col-start-2">
        <Button type="submit" disabled={pending}>
          {pending ? es.lessonForm.saving : es.lessonForm.save}
        </Button>
        {onSubmitAndEnrich && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!form.getValues("title").trim()) {
                form.setValue("title", es.llm.defaultTitle(formatDayMonth(form.getValues("date"))));
              }
              void form.handleSubmit(onSubmitAndEnrich)();
            }}
          >
            <Sparkles aria-hidden />
            {es.llm.saveAndEnrich}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          {es.lessonForm.cancel}
        </Button>
      </div>
    </form>
  );
}

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

function FilePicker({ chosen, onChange }: { chosen: File[]; onChange: (files: File[]) => void }) {
  const [rejected, setRejected] = useState<string[]>([]);
  const add = (picked: File[]) => {
    const reasons: string[] = [];
    const accepted = picked.filter((file) => {
      const check = validateUpload({ name: file.name, size: file.size });
      if (!check.ok) reasons.push(es.files.rejected(file.name, validationMessage(check.error)));
      return check.ok;
    });
    setRejected(reasons);
    const seen = new Set(chosen.map(fileKey));
    onChange([...chosen, ...accepted.filter((file) => !seen.has(fileKey(file)))]);
  };
  return (
    <Field className="lg:col-start-2">
      <FieldLabel>{es.lessonForm.files}</FieldLabel>
      {chosen.length > 0 && (
        <ul className="flex flex-col gap-2">
          {chosen.map((file, index) => (
            <li key={fileKey(file)} className="flex items-center gap-3 rounded-xl border px-4 py-2">
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-sm text-muted-foreground">{formatBytes(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={es.lessonForm.removeFile(file.name)}
                onClick={() => onChange(chosen.filter((_, i) => i !== index))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {rejected.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {rejected.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <FileDropzone onFiles={add} />
    </Field>
  );
}
