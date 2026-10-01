import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { BookOpen, Flame, MessageCircleQuestion, NotebookPen, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { BlockPlanner, type DraftBlock, draftKey } from "@/components/today/block-planner";
import { ProgressRing } from "@/components/today/progress-ring";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { ApiError, api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { isLaunching, markLaunched } from "@/lib/launch";
import { practiceStore } from "@/lib/practice";
import { syncClock } from "@/lib/practice/clock";
import { todayQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/today")({
  loader: async ({ context }) => {
    const data = await context.queryClient.ensureQueryData(todayQuery);
    const launching = isLaunching();
    markLaunched();
    if (launching && data.activeSession) {
      throw redirect({ to: "/practice/$sessionId", params: { sessionId: data.activeSession.id } });
    }
  },
  component: TodayPage,
});

type Today = Awaited<ReturnType<NonNullable<typeof todayQuery.queryFn>>>;

function initialBlocks(today: Today): DraftBlock[] {
  return [
    {
      key: draftKey(),
      topicId: null,
      label: es.today.warmUp,
      title: es.today.warmUp,
      minutes: today.suggestion.warmUpMinutes,
    },
    ...today.suggestion.topics.map((topic) => ({
      key: draftKey(),
      topicId: topic.topicId,
      label: null,
      title: topic.title,
      minutes: topic.minutes,
    })),
  ];
}

function TodayPage() {
  const { data } = useSuspenseQuery(todayQuery);
  const [blocks, setBlocks] = useState(() => initialBlocks(data));

  return (
    <>
      <PageHeader title={es.today.title}>
        <Button asChild variant="outline">
          <Link to="/log">
            <NotebookPen aria-hidden />
            {es.today.logPractice}
          </Link>
        </Button>
      </PageHeader>
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing
            value={data.minutes}
            max={data.targetMinutes}
            label={es.today.progress(data.minutes, data.targetMinutes)}
          />
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-lg">
              <Flame aria-hidden className="size-5 text-brand" />
              {data.streak > 0 ? es.today.streak(data.streak) : es.today.noStreak}
            </p>
            {data.met && <p className="text-brand">{es.today.targetMet}</p>}
            {data.latestLesson && (
              <Link
                to="/lessons/$lessonId"
                params={{ lessonId: data.latestLesson.id }}
                className="flex items-center gap-2 underline-offset-4 hover:underline"
              >
                <BookOpen aria-hidden className="size-5 text-muted-foreground" />
                {`${es.today.latestLesson}: ${data.latestLesson.title} · ${formatDate(data.latestLesson.date)}`}
              </Link>
            )}
            {data.latestLesson && data.openQuestionsCount > 0 && (
              <Link
                to="/lessons/$lessonId"
                params={{ lessonId: data.latestLesson.id }}
                hash="next-class"
                className="flex items-center gap-2 underline-offset-4 hover:underline"
              >
                <MessageCircleQuestion aria-hidden className="size-5 text-muted-foreground" />
                {es.today.openQuestions(data.openQuestionsCount)}
              </Link>
            )}
          </div>
        </div>

        {data.activeSession ? (
          <section className="flex flex-col gap-3 rounded-xl border border-brand p-4">
            <h2 className="text-lg font-semibold">{es.today.activeTitle}</h2>
            <Button asChild size="lg" className="self-start">
              <Link to="/practice/$sessionId" params={{ sessionId: data.activeSession.id }}>
                <Play aria-hidden />
                {es.today.continue}
              </Link>
            </Button>
          </section>
        ) : (
          <Section title={es.today.plan}>
            {data.suggestion.topics.length === 0 && (
              <p className="text-muted-foreground">
                {es.today.noTopics}{" "}
                <Link to="/topics/new" className="text-brand underline">
                  {es.today.createTopics}
                </Link>
              </p>
            )}
            <BlockPlanner blocks={blocks} onChange={setBlocks} />
            <StartButton blocks={blocks} />
          </Section>
        )}
      </div>
    </>
  );
}

function StartButton({ blocks }: { blocks: DraftBlock[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const payload = blocks.map((block) => ({
    topicId: block.topicId,
    label: block.topicId ? undefined : (block.label ?? block.title),
    plannedSeconds: block.minutes * 60,
  }));

  const start = useMutation({
    mutationFn: async () => {
      const startedAt = Date.now();
      const { session } = await (
        await ensureOk(await api.sessions.$post({ json: { blocks: payload } }))
      ).json();
      syncClock(session.serverNow, startedAt);
      return session;
    },
    onSuccess: async (session) => {
      practiceStore.load(session);
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await navigate({ to: "/practice/$sessionId", params: { sessionId: session.id } });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setActiveId(String((error.body as { activeSessionId?: string }).activeSessionId ?? ""));
        return;
      }
      toast.error(errorMessage(error, es.today.startError));
    },
  });

  const discardAndStart = async () => {
    if (activeId)
      await ensureOk(await api.sessions[":id"].abandon.$post({ param: { id: activeId } }));
    setActiveId(null);
    start.mutate();
  };

  return (
    <>
      <Button
        size="lg"
        className="h-14 text-lg"
        onClick={() => start.mutate()}
        disabled={start.isPending || blocks.length === 0}
      >
        <Play aria-hidden />
        {start.isPending ? es.today.starting : es.today.start}
      </Button>
      <AlertDialog open={activeId !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{es.today.activeExists}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Link to="/practice/$sessionId" params={{ sessionId: activeId ?? "" }}>
                {es.today.continue}
              </Link>
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discardAndStart}>
              {es.today.discardAndStart}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
