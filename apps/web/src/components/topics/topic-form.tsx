import {
  type CreateTopic,
  createTopicSchema,
  TOPIC_CATEGORIES,
  TOPIC_PRIORITIES,
} from "@ds/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ListEditor } from "@/components/list-editor";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { es, validationMessage } from "@/i18n/es";

const emptyToNull = (value: unknown) => (value === "" || value === null ? null : Number(value));

export function TopicForm({
  defaultValues,
  parentOptions,
  onSubmit,
  onCancel,
  pending,
  serverError,
}: {
  defaultValues: CreateTopic;
  parentOptions: { id: string; title: string }[];
  onSubmit: (values: CreateTopic) => void;
  onCancel: () => void;
  pending: boolean;
  serverError?: { field: "parentId" | null; message: string } | null;
}) {
  const form = useForm({ resolver: zodResolver(createTopicSchema), defaultValues });
  const { errors } = form.formState;
  const parentError = errors.parentId?.message
    ? validationMessage(errors.parentId.message)
    : serverError?.field === "parentId"
      ? serverError.message
      : null;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor="topic-title">{es.topicForm.title}</FieldLabel>
          <Input
            id="topic-title"
            aria-invalid={errors.title ? true : undefined}
            {...form.register("title")}
          />
          {errors.title && <FieldError>{validationMessage(errors.title.message)}</FieldError>}
        </Field>
        <Field data-invalid={errors.category ? true : undefined}>
          <FieldLabel htmlFor="topic-category">{es.topicForm.category}</FieldLabel>
          <NativeSelect id="topic-category" {...form.register("category")}>
            {TOPIC_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {es.categories[category]}
              </option>
            ))}
          </NativeSelect>
          {errors.category && <FieldError>{validationMessage(errors.category.message)}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="topic-description">{es.topicForm.description}</FieldLabel>
          <Textarea id="topic-description" className="min-h-32" {...form.register("description")} />
          <FieldDescription>{es.topicForm.descriptionHelp}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="topic-points">{es.topicForm.practicePoints}</FieldLabel>
          <Controller
            control={form.control}
            name="practicePoints"
            render={({ field }) => (
              <ListEditor id="topic-points" value={field.value ?? []} onChange={field.onChange} />
            )}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-6">
        <Field>
          <FieldLabel htmlFor="topic-criteria">{es.topicForm.successCriteria}</FieldLabel>
          <Textarea id="topic-criteria" {...form.register("successCriteria")} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field data-invalid={errors.targetBpm ? true : undefined}>
            <FieldLabel htmlFor="topic-bpm">{es.topicForm.targetBpm}</FieldLabel>
            <Input
              id="topic-bpm"
              type="number"
              inputMode="numeric"
              {...form.register("targetBpm", { setValueAs: emptyToNull })}
            />
            {errors.targetBpm && (
              <FieldError>{validationMessage(errors.targetBpm.message)}</FieldError>
            )}
          </Field>
          <Field data-invalid={errors.defaultBlockMinutes ? true : undefined}>
            <FieldLabel htmlFor="topic-minutes">{es.topicForm.defaultBlockMinutes}</FieldLabel>
            <Input
              id="topic-minutes"
              type="number"
              inputMode="numeric"
              {...form.register("defaultBlockMinutes", { valueAsNumber: true })}
            />
            {errors.defaultBlockMinutes && (
              <FieldError>{validationMessage(errors.defaultBlockMinutes.message)}</FieldError>
            )}
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="topic-priority">{es.topicForm.priority}</FieldLabel>
          <NativeSelect id="topic-priority" {...form.register("priority", { valueAsNumber: true })}>
            {TOPIC_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {es.priorities[priority]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field data-invalid={parentError ? true : undefined}>
          <FieldLabel htmlFor="topic-parent">{es.topicForm.parent}</FieldLabel>
          <NativeSelect
            id="topic-parent"
            {...form.register("parentId", { setValueAs: (v) => v || null })}
          >
            <option value="">{es.topicForm.noParent}</option>
            {parentOptions.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </NativeSelect>
          {parentError && <FieldError>{parentError}</FieldError>}
        </Field>
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? es.topicForm.saving : es.topicForm.save}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {es.topicForm.cancel}
          </Button>
        </div>
      </div>
    </form>
  );
}
