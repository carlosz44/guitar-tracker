import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { es } from "@/i18n/es";
import type { SessionView } from "@/lib/practice/types";
import { todayQuery } from "@/lib/queries";

export function SessionSummary({
  session,
  onFinish,
}: {
  session: SessionView;
  onFinish: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(session.notes);
  const { data: today } = useQuery(todayQuery);
  const sessionSeconds = session.blocks.reduce((sum, block) => sum + (block.actualSeconds ?? 0), 0);
  const bpms = session.blocks.filter((block) => block.cleanBpm !== null);
  const todayMinutes = today
    ? Math.floor((today.seconds + (today.activeSession ? sessionSeconds : 0)) / 60)
    : null;
  const target = today?.targetMinutes ?? null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{es.summary.title}</h1>
      <p className="text-4xl font-semibold tabular-nums">
        {es.summary.total(Math.round(sessionSeconds / 60))}
      </p>
      {todayMinutes !== null && target !== null && (
        <p className={todayMinutes >= target ? "text-brand" : "text-muted-foreground"}>
          {todayMinutes >= target ? es.summary.met : es.summary.remaining(target - todayMinutes)}
        </p>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm text-muted-foreground">{es.summary.perTopic}</h2>
        <ul className="flex flex-col gap-1">
          {session.blocks.map((block) => (
            <li key={block.id} className="flex justify-between gap-4">
              <span>{block.title}</span>
              <span className="tabular-nums">
                {es.summary.minutes(Math.round((block.actualSeconds ?? 0) / 60))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {bpms.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm text-muted-foreground">{es.summary.bpms}</h2>
          <ul className="flex flex-col gap-1">
            {bpms.map((block) => (
              <li key={block.id}>{es.summary.bpm(block.title, block.cleanBpm ?? 0)}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <label htmlFor="session-note" className="text-sm text-muted-foreground">
          {es.summary.note}
        </label>
        <Textarea
          id="session-note"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </section>
      <Button size="lg" className="h-14 text-lg" onClick={() => onFinish(notes)}>
        {es.summary.finish}
      </Button>
    </div>
  );
}
