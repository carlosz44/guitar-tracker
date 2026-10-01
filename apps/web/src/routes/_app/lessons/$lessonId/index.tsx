import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageCircleQuestion, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LessonFiles } from "@/components/files/lesson-files";
import { LessonTopics } from "@/components/lessons/lesson-topics";
import { Markdown } from "@/components/markdown";
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
import { lessonQuery, lessonsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/lessons/$lessonId/")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(lessonQuery(params.lessonId)),
      context.queryClient.ensureQueryData(lessonsQuery),
    ]),
  component: LessonPage,
});

function LessonPage() {
  const { lessonId } = Route.useParams();
  const { data } = useSuspenseQuery(lessonQuery(lessonId));
  const { data: list } = useSuspenseQuery(lessonsQuery);
  const { lesson, files, topics, openQuestionsCount, isLatest } = data;
  const latestId = list.lessons[0]?.id;

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {formatDate(lesson.date)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">{lesson.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/lessons/$lessonId/edit" params={{ lessonId }}>
              <Pencil aria-hidden />
              {es.lessonPage.edit}
            </Link>
          </Button>
          <DeleteLessonButton lessonId={lessonId} fileCount={files.length} />
          {openQuestionsCount > 0 && latestId && (
            <Button asChild variant="ghost">
              <Link to="/lessons/$lessonId" params={{ lessonId: latestId }} hash="next-class">
                <MessageCircleQuestion aria-hidden />
                {es.lessonPage.openQuestions(openQuestionsCount)}
              </Link>
            </Button>
          )}
        </div>
      </header>

      {lesson.summary && (
        <Section title={es.lessonPage.summary}>
          <Markdown>{lesson.summary}</Markdown>
        </Section>
      )}

      <Section title={es.lessonPage.files}>
        <LessonFiles lessonId={lessonId} files={files} />
      </Section>

      {lesson.practicePoints.length > 0 && (
        <Section title={es.lessonPage.practicePoints}>
          <ul className="list-disc space-y-1 pl-6">
            {lesson.practicePoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={es.lessonPage.topics}>
        <LessonTopics lessonId={lessonId} topics={topics} />
      </Section>

      {lesson.homework && (
        <Section title={es.lessonPage.homework}>
          <Markdown>{lesson.homework}</Markdown>
        </Section>
      )}

      {lesson.rawNotes && (
        <Section title={es.lessonPage.notes}>
          <Markdown>{lesson.rawNotes}</Markdown>
        </Section>
      )}

      {isLatest && <span id="next-class" />}
    </article>
  );
}

function DeleteLessonButton({ lessonId, fileCount }: { lessonId: string; fileCount: number }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.lessons[":id"].$delete({ param: { id: lessonId } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["lessons", lessonId] });
      await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      await navigate({ to: "/lessons" });
    },
    onError: (error) => toast.error(errorMessage(error, es.lessonPage.deleteError)),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 aria-hidden />
          {es.lessonPage.delete}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{es.lessonPage.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>{es.lessonPage.deleteBody(fileCount)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{es.lessonPage.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
            {es.lessonPage.deleteConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
