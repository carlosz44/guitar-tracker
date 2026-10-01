import { TOPIC_STATUSES, type TopicStatus } from "@ds/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";
import { NativeSelect } from "@/components/native-select";
import { QuestionDialog } from "@/components/questions/question-dialog";
import { Section } from "@/components/section";
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
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { topicQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/topics/$topicId/")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(topicQuery(params.topicId)),
  component: TopicPage,
});

function TopicPage() {
  const { topicId } = Route.useParams();
  const { data } = useSuspenseQuery(topicQuery(topicId));
  const queryClient = useQueryClient();
  const { topic, parent, children, lessons, openQuestions } = data;

  const setStatus = useMutation({
    mutationFn: async (status: TopicStatus) =>
      (
        await ensureOk(await api.topics[":id"].$patch({ param: { id: topicId }, json: { status } }))
      ).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["topics"] }),
    onError: (error) => toast.error(errorMessage(error, es.common.genericError)),
  });

  const facts = [
    [es.topicPage.priority, es.priorities[topic.priority]],
    [es.topicPage.targetBpm, topic.targetBpm ? String(topic.targetBpm) : null],
  ].filter((fact): fact is [string, string] => fact[1] !== null);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{es.categories[topic.category]}</p>
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">{topic.title}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="topic-status" className="text-muted-foreground">
              {es.topicPage.status}
            </label>
            <NativeSelect
              id="topic-status"
              className="w-48"
              value={topic.status}
              onChange={(event) => setStatus.mutate(event.target.value as TopicStatus)}
            >
              {TOPIC_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {es.topicStatus[status]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button asChild variant="outline">
            <Link to="/topics/$topicId/edit" params={{ topicId }}>
              <Pencil aria-hidden />
              {es.topicPage.edit}
            </Link>
          </Button>
          <DeleteTopic
            topicId={topicId}
            linked={lessons.length > 0}
            onArchive={() => setStatus.mutate("archived")}
          />
          <QuestionDialog topicId={topicId} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="sr-only">{es.topicForm.defaultBlockMinutes}</dt>
          <dd className="font-medium">{es.topicPage.blockMinutes(topic.defaultBlockMinutes)}</dd>
        </div>
      </dl>

      {topic.description && <Markdown>{topic.description}</Markdown>}

      {topic.successCriteria && (
        <Section title={es.topicPage.successCriteria}>
          <p>{topic.successCriteria}</p>
        </Section>
      )}

      {topic.practicePoints.length > 0 && (
        <Section title={es.topicPage.practicePoints}>
          <ul className="list-disc space-y-1 pl-6">
            {topic.practicePoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </Section>
      )}

      {parent && (
        <Section title={es.topicPage.parent}>
          <Link
            to="/topics/$topicId"
            params={{ topicId: parent.id }}
            className="text-brand underline"
          >
            {parent.title}
          </Link>
        </Section>
      )}

      {children.length > 0 && (
        <Section title={es.topicPage.children}>
          <ul className="flex flex-col gap-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  to="/topics/$topicId"
                  params={{ topicId: child.id }}
                  className="text-brand underline"
                >
                  {child.title}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={es.topicPage.lessons}>
        {lessons.length === 0 ? (
          <p className="text-muted-foreground">{es.topicPage.noLessons}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: lesson.id }}
                  className="flex flex-col rounded-xl border p-3 hover:bg-muted"
                >
                  <span className="font-medium">{lesson.title}</span>
                  <span className="text-sm text-muted-foreground first-letter:uppercase">
                    {`${formatDate(lesson.date)} · ${es.relations[lesson.relation]}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {openQuestions.length > 0 && (
        <Section title={es.topicPage.questions}>
          <ul className="list-disc space-y-1 pl-6">
            {openQuestions.map((question) => (
              <li key={question.id}>{question.text}</li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function DeleteTopic({
  topicId,
  linked,
  onArchive,
}: {
  topicId: string;
  linked: boolean;
  onArchive: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.topics[":id"].$delete({ param: { id: topicId } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["topics", "detail", topicId] });
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      await navigate({ to: "/topics" });
    },
    onError: (error) => toast.error(errorMessage(error, es.common.genericError)),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 aria-hidden />
          {es.topicPage.delete}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{es.topicPage.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {linked ? es.validation["topic.hasLessons"] : es.topicPage.deleteBody}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{es.topicPage.cancel}</AlertDialogCancel>
          {linked ? (
            <AlertDialogAction onClick={onArchive}>
              <Archive aria-hidden />
              {es.topicPage.archiveInstead}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
              {es.topicPage.deleteConfirm}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
