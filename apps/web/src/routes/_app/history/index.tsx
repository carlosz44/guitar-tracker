import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, History, NotebookPen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { meQuery } from "@/lib/api";
import { formatDate, formatDayRange, formatTime } from "@/lib/format";
import { historyQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/history/")({ component: HistoryPage });

const minutes = (seconds: number) => Math.round(seconds / 60);

function HistoryPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data, fetchNextPage, isFetchingNextPage, isPending } = useInfiniteQuery(historyQuery);
  const cycles = data?.pages.flatMap((page) => page.cycles) ?? [];
  const anyPractice = cycles.some((cycle) => cycle.days.length > 0);
  const timeZone = me.settings.timezone;

  return (
    <>
      <PageHeader title={es.history.title}>
        <Button asChild variant="outline">
          <Link to="/log">
            <NotebookPen aria-hidden />
            {es.today.logPractice}
          </Link>
        </Button>
      </PageHeader>
      {!isPending && !anyPractice && <EmptyState icon={History} message={es.history.empty} />}
      <div className="flex flex-col gap-8">
        {anyPractice &&
          cycles.map((cycle) => (
            <section
              key={cycle.start}
              className="flex flex-col gap-3"
              aria-label={es.history.cycle(formatDayRange(cycle.start, cycle.end))}
            >
              <header>
                <h2 className="text-lg font-semibold">
                  {es.history.cycle(formatDayRange(cycle.start, cycle.end))}
                </h2>
                <p className="text-sm text-muted-foreground" data-testid="cycle-summary">
                  {es.history.cycleSummary(minutes(cycle.seconds), cycle.daysPracticed)}
                </p>
              </header>
              {cycle.days.length === 0 ? (
                <p className="text-muted-foreground">{es.history.noPractice}</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-3 lg:hidden">
                    {cycle.days.map((day) => (
                      <li
                        key={day.date}
                        className="rounded-xl border p-3"
                        data-testid="history-day"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium first-letter:uppercase">
                            {formatDate(day.date)}
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            {es.history.dayMinutes(minutes(day.seconds))}
                            {day.met && (
                              <CircleCheck
                                aria-label={es.history.met}
                                className="size-5 text-brand"
                              />
                            )}
                          </span>
                        </div>
                        <ul className="mt-2 flex flex-col">
                          {day.sessions.map((session) => (
                            <li key={session.id}>
                              <Link
                                to="/history/$sessionId"
                                params={{ sessionId: session.id }}
                                className="flex min-h-11 flex-col justify-center text-sm text-muted-foreground hover:text-foreground"
                              >
                                <span>
                                  {session.source === "manual"
                                    ? `${es.history.manual} · ${es.history.dayMinutes(minutes(session.seconds))}`
                                    : es.history.sessionLine(
                                        formatTime(session.startedAt, timeZone),
                                        minutes(session.seconds),
                                      )}
                                  {session.status === "abandoned"
                                    ? ` · ${es.history.abandoned}`
                                    : ""}
                                </span>
                                <span className="truncate">{session.topics.join(", ")}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                  <table className="hidden w-full text-left lg:table" data-testid="history-table">
                    <thead className="text-sm text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4 font-normal">{es.history.columns.date}</th>
                        <th className="py-2 pr-4 font-normal">{es.history.columns.minutes}</th>
                        <th className="py-2 pr-4 font-normal">{es.history.columns.topics}</th>
                        <th className="py-2 pr-4 font-normal">{es.history.columns.rating}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycle.days.flatMap((day) =>
                        day.sessions.map((session, index) => (
                          <tr key={session.id} className="border-t">
                            <td className="py-2 pr-4">
                              {index === 0 && (
                                <span className="flex items-center gap-2">
                                  <span className="first-letter:uppercase">
                                    {formatDate(day.date)}
                                  </span>
                                  {day.met && (
                                    <CircleCheck
                                      aria-label={es.history.met}
                                      className="size-4 text-brand"
                                    />
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-4 tabular-nums">
                              <Link
                                to="/history/$sessionId"
                                params={{ sessionId: session.id }}
                                className="underline-offset-4 hover:underline"
                              >
                                {es.history.dayMinutes(minutes(session.seconds))}
                              </Link>
                            </td>
                            <td className="py-2 pr-4">{session.topics.join(", ")}</td>
                            <td className="py-2 pr-4 tabular-nums">
                              {session.averageRating === null
                                ? "—"
                                : es.history.rating(session.averageRating)}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          ))}
        {anyPractice && (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {es.history.more}
          </Button>
        )}
      </div>
    </>
  );
}
