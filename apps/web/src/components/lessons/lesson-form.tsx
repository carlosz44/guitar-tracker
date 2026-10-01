import { type CreateLesson, createLessonSchema } from "@ds/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ListEditor } from "@/components/list-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { es, validationMessage } from "@/i18n/es";

export function LessonForm({
  defaultValues,
  onSubmit,
  onCancel,
  pending,
}: {
  defaultValues: CreateLesson;
  onSubmit: (values: CreateLesson) => void;
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
      <Field data-invalid={errors.rawNotes ? true : undefined} className="lg:row-span-5">
        <FieldLabel htmlFor="lesson-notes">{es.lessonForm.notes}</FieldLabel>
        <Textarea
          id="lesson-notes"
          className="min-h-48 lg:min-h-96"
          {...form.register("rawNotes")}
        />
        <FieldDescription>{es.lessonForm.notesHelp}</FieldDescription>
      </Field>

      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field data-invalid={errors.date ? true : undefined}>
          <FieldLabel htmlFor="lesson-date">{es.lessonForm.date}</FieldLabel>
          <Input id="lesson-date" type="date" {...form.register("date")} />
          {errors.date && <FieldError>{validationMessage(errors.date.message)}</FieldError>}
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
      </div>

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

      <div className="flex gap-3 lg:col-start-2">
        <Button type="submit" disabled={pending}>
          {pending ? es.lessonForm.saving : es.lessonForm.save}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {es.lessonForm.cancel}
        </Button>
      </div>
    </form>
  );
}
