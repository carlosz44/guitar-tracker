import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { sessionQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/history/$sessionId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(sessionQuery(params.sessionId)),
  component: SessionEditPage,
});

interface BlockDraft {
  id: string;
  title: string;
  minutes: string;
  cleanBpm: string;
  rating: string;
  notes: string;
}

const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));

function SessionEditPage() {
  const { sessionId } = Route.useParams();
  const { data } = useSuspenseQuery(sessionQuery(sessionId));
  const { session } = data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [notes, setNotes] = useState(session.notes);
  const [blocks, setBlocks] = useState<BlockDraft[]>(() =>
    session.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      minutes: String(Math.round((block.actualSeconds ?? 0) / 60)),
      cleanBpm: block.cleanBpm === null ? "" : String(block.cleanBpm),
      rating: block.rating === null ? "" : String(block.rating),
      notes: block.notes,
    })),
  );
  const refresh = () =>
    Promise.all(
      ["today", "sessions", "topics"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );

  const save = useMutation({
    mutationFn: async () =>
      (
        await ensureOk(
          await api.sessions[":id"].$patch({
            param: { id: sessionId },
            json: {
              notes,
              blocks: blocks.map((block) => ({
                id: block.id,
                actualMinutes: Number(block.minutes) || 0,
                cleanBpm: toNumber(block.cleanBpm),
                rating: toNumber(block.rating),
                notes: block.notes,
              })),
            },
          }),
        )
      ).json(),
    onSuccess: async () => {
      toast.success(es.sessionEdit.saved);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error, es.sessionEdit.saveError)),
  });

  const remove = useMutation({
    mutationFn: async () =>
      ensureOk(await api.sessions[":id"].$delete({ param: { id: sessionId } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["sessions", "detail", sessionId] });
      await refresh();
      await navigate({ to: "/history" });
    },
    onError: (error) => toast.error(errorMessage(error, es.common.genericError)),
  });

  const update = (index: number, change: Partial<BlockDraft>) =>
    setBlocks((current) =>
      current.map((block, i) => (i === index ? { ...block, ...change } : block)),
    );

  if (session.status === "in_progress") {
    return (
      <>
        <PageHeader title={es.sessionEdit.title} />
        <p className="mb-4">{es.sessionEdit.running}</p>
        <Button asChild>
          <Link to="/practice/$sessionId" params={{ sessionId }}>
            {es.sessionEdit.open}
          </Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader title={es.sessionEdit.title} />
      <p className="mb-6 text-muted-foreground first-letter:uppercase">
        {formatDate(session.practiceDate)}
      </p>
      <div className="flex flex-col gap-4">
        {blocks.map((block, index) => (
          <fieldset key={block.id} className="flex min-w-0 flex-col gap-3 rounded-xl border p-3">
            <legend className="px-1 font-medium">{block.title}</legend>
            <div className="grid grid-cols-3 gap-3">
              <Field className="min-w-0">
                <FieldLabel htmlFor={`edit-minutes-${index}`} className="text-muted-foreground">
                  {es.sessionEdit.minutesLabel}
                </FieldLabel>
                <Input
                  id={`edit-minutes-${index}`}
                  aria-label={es.sessionEdit.minutes(block.title)}
                  type="number"
                  inputMode="numeric"
                  value={block.minutes}
                  onChange={(event) => update(index, { minutes: event.target.value })}
                />
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`edit-bpm-${index}`} className="text-muted-foreground">
                  {es.sessionEdit.bpmLabel}
                </FieldLabel>
                <Input
                  id={`edit-bpm-${index}`}
                  aria-label={es.sessionEdit.bpm(block.title)}
                  type="number"
                  inputMode="numeric"
                  value={block.cleanBpm}
                  onChange={(event) => update(index, { cleanBpm: event.target.value })}
                />
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`edit-rating-${index}`} className="text-muted-foreground">
                  {es.sessionEdit.ratingLabel}
                </FieldLabel>
                <NativeSelect
                  id={`edit-rating-${index}`}
                  aria-label={es.sessionEdit.rating(block.title)}
                  value={block.rating}
                  onChange={(event) => update(index, { rating: event.target.value })}
                >
                  <option value="">{es.sessionEdit.noRating}</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {es.blockLog.rate(value)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field className="min-w-0">
              <FieldLabel htmlFor={`edit-notes-${index}`} className="text-muted-foreground">
                {es.sessionEdit.notesLabel}
              </FieldLabel>
              <Input
                id={`edit-notes-${index}`}
                aria-label={es.sessionEdit.notes(block.title)}
                value={block.notes}
                onChange={(event) => update(index, { notes: event.target.value })}
              />
            </Field>
          </fieldset>
        ))}
        <Field className="min-w-0">
          <FieldLabel htmlFor="edit-session-notes">{es.sessionEdit.sessionNotes}</FieldLabel>
          <Textarea
            id="edit-session-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {es.sessionEdit.save}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <Trash2 aria-hidden />
                {es.sessionEdit.delete}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{es.sessionEdit.deleteTitle}</AlertDialogTitle>
                <AlertDialogDescription>{es.sessionEdit.deleteBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{es.sessionEdit.cancel}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                  {es.sessionEdit.deleteConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
}
