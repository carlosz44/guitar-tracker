import { type ManualSession, manualSessionSchema, todayIn } from "@ds/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { es, validationMessage } from "@/i18n/es";
import { api, ensureOk, meQuery } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { topicsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/log")({ component: LogPage });

const numberOrNull = (value: unknown) => (value === "" || value === null ? null : Number(value));
const textOrNull = (value: unknown) => (value === "" ? null : value);

function LogPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: topicsData } = useQuery(topicsQuery());
  const topics = (topicsData?.topics ?? []).filter((topic) => topic.status !== "archived");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    resolver: zodResolver(manualSessionSchema),
    defaultValues: {
      date: todayIn(me.settings.timezone),
      minutes: 30,
      items: [{ topicId: null, label: "", minutes: null, cleanBpm: null }],
      notes: "",
    } as ManualSession,
  });
  const items = useFieldArray({ control: form.control, name: "items" });
  const { errors } = form.formState;
  const itemTopics = form.watch("items");

  const save = useMutation({
    mutationFn: async (values: ManualSession) => {
      const json = {
        ...values,
        items: values.items.map((item) =>
          item.topicId
            ? { ...item, label: undefined }
            : { ...item, topicId: null, label: item.label ?? "" },
        ),
      };
      return (await ensureOk(await api.sessions.manual.$post({ json }))).json();
    },
    onSuccess: async () => {
      toast.success(es.log.saved);
      await Promise.all(
        ["today", "sessions", "topics"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      await navigate({ to: "/history" });
    },
    onError: (error) => toast.error(errorMessage(error, es.log.saveError)),
  });

  return (
    <>
      <PageHeader title={es.log.title} />
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="flex flex-col gap-6"
      >
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Field data-invalid={errors.date ? true : undefined}>
            <FieldLabel htmlFor="log-date">{es.log.date}</FieldLabel>
            <Input id="log-date" type="date" {...form.register("date")} />
          </Field>
          <Field data-invalid={errors.minutes ? true : undefined}>
            <FieldLabel htmlFor="log-minutes">{es.log.duration}</FieldLabel>
            <Input
              id="log-minutes"
              type="number"
              inputMode="numeric"
              {...form.register("minutes", { valueAsNumber: true })}
            />
            {errors.minutes && <FieldError>{validationMessage(errors.minutes.message)}</FieldError>}
          </Field>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-medium">{es.log.items}</legend>
          {items.fields.map((field, index) => {
            const n = index + 1;
            const itemError = errors.items?.[index];
            return (
              <div key={field.id} className="flex flex-col gap-3 rounded-xl border p-3">
                <div className="flex items-end gap-2">
                  <Field className="flex-1">
                    <FieldLabel htmlFor={`log-topic-${n}`}>{es.log.topic(n)}</FieldLabel>
                    <NativeSelect
                      id={`log-topic-${n}`}
                      {...form.register(`items.${index}.topicId`, { setValueAs: textOrNull })}
                    >
                      <option value="">{es.log.freeBlock}</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.title}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {items.fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={es.log.remove(n)}
                      onClick={() => items.remove(index)}
                    >
                      <X aria-hidden />
                    </Button>
                  )}
                </div>
                {!itemTopics?.[index]?.topicId && (
                  <Field data-invalid={itemError ? true : undefined}>
                    <FieldLabel htmlFor={`log-label-${n}`}>{es.log.label(n)}</FieldLabel>
                    <Input id={`log-label-${n}`} {...form.register(`items.${index}.label`)} />
                    {itemError?.message && (
                      <FieldError>{validationMessage(itemError.message)}</FieldError>
                    )}
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor={`log-item-minutes-${n}`}>{es.log.minutes(n)}</FieldLabel>
                    <Input
                      id={`log-item-minutes-${n}`}
                      type="number"
                      inputMode="numeric"
                      {...form.register(`items.${index}.minutes`, { setValueAs: numberOrNull })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`log-bpm-${n}`}>{es.log.bpm(n)}</FieldLabel>
                    <Input
                      id={`log-bpm-${n}`}
                      type="number"
                      inputMode="numeric"
                      {...form.register(`items.${index}.cleanBpm`, { setValueAs: numberOrNull })}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          {errors.items?.message && (
            <FieldError>{validationMessage(errors.items.message)}</FieldError>
          )}
          {errors.items?.root?.message && (
            <FieldError>{validationMessage(errors.items.root.message)}</FieldError>
          )}
          <FieldDescription>{es.log.minutesHelp}</FieldDescription>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              items.append({ topicId: null, label: "", minutes: null, cleanBpm: null })
            }
          >
            <Plus aria-hidden />
            {es.log.add}
          </Button>
        </fieldset>

        <Field>
          <FieldLabel htmlFor="log-notes">{es.log.notes}</FieldLabel>
          <Textarea id="log-notes" {...form.register("notes")} />
        </Field>

        <div className="flex gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? es.log.saving : es.log.save}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/today" })}>
            {es.log.cancel}
          </Button>
        </div>
      </form>
    </>
  );
}
