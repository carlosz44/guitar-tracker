import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { MessageCirclePlus, Pause, Play, Plus, SkipForward, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { BlockLogSheet } from "@/components/practice/block-log-sheet";
import { SessionSummary } from "@/components/practice/session-summary";
import { useNow } from "@/components/practice/use-now";
import { useWakeLock } from "@/components/practice/use-wake-lock";
import { QuestionDialog } from "@/components/questions/question-dialog";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { formatClock } from "@/lib/format";
import { fetchSession, practiceStore, settle, usePractice } from "@/lib/practice";
import { serverTime } from "@/lib/practice/clock";
import { progress } from "@/lib/practice/model";
import { cn } from "@/lib/utils";

const TIP_KEY = "ds.wakeTipDismissed";

const CONTROL = "h-auto min-h-16 min-w-0 flex-col gap-1 px-1 py-2 leading-tight whitespace-normal";

export const Route = createFileRoute("/_focus/practice/$sessionId")({
  loader: async ({ params }) => {
    const fresh = await fetchSession(params.sessionId).catch(() => null);
    if (fresh) practiceStore.load(fresh);
    const session = practiceStore.getState().session;
    if (!session || session.id !== params.sessionId || session.status !== "in_progress") {
      throw redirect({ to: "/today" });
    }
  },
  component: PracticePage,
});

const iso = (millis: number) => new Date(millis).toISOString();

function PracticePage() {
  const { session, pending, offline } = usePractice();
  const now = useNow();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [logging, setLogging] = useState<{ endedAt: string; action: "complete" | "skip" } | null>(
    null,
  );
  const [tipDismissed, setTipDismissed] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const state = session ? progress(session, now) : null;
  const running = Boolean(state && state.index >= 0 && !state.paused && !logging);
  const wakeUnavailable = useWakeLock(running);

  if (!session || !state) return null;

  const finish = async (notes: string) => {
    practiceStore.dispatch({ kind: "finish", notes });
    await settle();
    await queryClient.invalidateQueries({ queryKey: ["today"] });
    await navigate({ to: "/today" });
  };

  if (state.finishedBlocks) return <SessionSummary session={session} onFinish={finish} />;

  const block = session.blocks[state.index];
  const next = session.blocks[state.index + 1];
  if (!block) return null;
  const timeUp = state.remaining === 0 && !state.paused;

  const openLog = (action: "complete" | "skip") =>
    setLogging({ endedAt: iso(serverTime()), action });
  const dismissTip = () => {
    setTipDismissed(true);
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {}
  };

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] transition-colors",
        timeUp && "bg-brand text-brand-foreground",
      )}
      data-testid="practice-screen"
      data-time-up={timeUp}
    >
      <header className="flex items-center justify-between gap-3 px-4">
        <Button asChild variant="ghost" className={cn(timeUp && "text-brand-foreground")}>
          <Link to="/today">
            <X aria-hidden />
            {es.practice.exit}
          </Link>
        </Button>
        <span className="tabular-nums" data-testid="total-elapsed">
          {es.practice.total(formatClock(state.totalElapsed))}
        </span>
      </header>

      {pending > 0 && offline && (
        <p
          role="status"
          className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
        >
          <WifiOff aria-hidden className="size-4" />
          {es.practice.offline}
        </p>
      )}
      {wakeUnavailable && !tipDismissed && (
        <div
          role="note"
          className="mx-4 mt-3 flex items-start gap-3 rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
        >
          <p className="flex-1">{es.practice.wakeTip}</p>
          <Button variant="ghost" size="sm" onClick={dismissTip}>
            {es.practice.dismiss}
          </Button>
        </div>
      )}

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-semibold" data-testid="block-title">
          {block.title}
        </h1>
        {timeUp ? (
          <>
            <p className="text-5xl font-bold">{es.practice.timeUp}</p>
            <p className="text-8xl font-semibold tabular-nums" data-testid="overtime">
              {es.practice.overtime(formatClock(state.overtime))}
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="mt-4 h-16 px-8 text-xl"
              onClick={() => openLog("complete")}
            >
              {es.practice.logAndContinue}
            </Button>
          </>
        ) : (
          <p className="text-8xl font-semibold tabular-nums" data-testid="countdown">
            {formatClock(state.remaining)}
          </p>
        )}
        {state.paused && <p className="text-xl text-brand">{es.practice.paused}</p>}
        {(block.targetBpm !== null || block.lastCleanBpm !== null) && (
          <p className="text-2xl" data-testid="bpm-info">
            {[
              block.targetBpm !== null ? es.practice.targetBpm(block.targetBpm) : null,
              block.lastCleanBpm !== null ? es.practice.lastBpm(block.lastCleanBpm) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p className={cn("text-lg", !timeUp && "text-muted-foreground")} data-testid="next-block">
          {next ? es.practice.next(next.title) : es.practice.lastBlock}
        </p>
      </main>

      <nav className="grid grid-cols-4 gap-2 px-4">
        <Button
          variant="outline"
          className={CONTROL}
          onClick={() =>
            practiceStore.dispatch(
              state.paused
                ? { kind: "resume", at: iso(serverTime()) }
                : { kind: "pause", at: iso(serverTime()) },
            )
          }
        >
          {state.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {state.paused ? es.practice.resume : es.practice.pause}
        </Button>
        <Button
          variant="outline"
          className={CONTROL}
          onClick={() => practiceStore.dispatch({ kind: "extend", blockId: block.id })}
        >
          <Plus aria-hidden />
          {es.practice.extend}
        </Button>
        <Button variant="outline" className={CONTROL} onClick={() => openLog("skip")}>
          <SkipForward aria-hidden />
          {es.practice.skip}
        </Button>
        <QuestionDialog
          topicId={block.topicId ?? undefined}
          trigger={
            <Button variant="outline" className={CONTROL}>
              <MessageCirclePlus aria-hidden />
              {es.practice.question}
            </Button>
          }
        />
      </nav>

      {logging && (
        <BlockLogSheet
          block={block}
          onClose={() => setLogging(null)}
          onSave={(log) => {
            practiceStore.dispatch({
              kind: "complete",
              blockId: block.id,
              action: logging.action,
              endedAt: logging.endedAt,
              nextStartsAt: iso(serverTime()),
              log,
            });
            setLogging(null);
          }}
        />
      )}
    </div>
  );
}
