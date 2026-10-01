import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { formatDate } from "@/lib/format";
import { lessonsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/lessons/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(lessonsQuery),
  component: LessonsPage,
});

function LessonsPage() {
  const { data } = useSuspenseQuery(lessonsQuery);
  return (
    <>
      <PageHeader title={es.lessons.title}>
        <Button asChild>
          <Link to="/lessons/new">
            <Plus aria-hidden />
            {es.lessonsPage.new}
          </Link>
        </Button>
      </PageHeader>
      {data.lessons.length === 0 ? (
        <EmptyState icon={BookOpen} message={es.lessonsPage.empty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link
                to="/lessons/$lessonId"
                params={{ lessonId: lesson.id }}
                className="flex flex-col gap-1 rounded-xl border p-4 hover:bg-muted"
              >
                <span className="text-sm text-muted-foreground first-letter:uppercase">
                  {formatDate(lesson.date)}
                </span>
                <span className="text-lg font-medium">{lesson.title}</span>
                <span className="text-sm text-muted-foreground">
                  {es.lessonsPage.counts(lesson.fileCount, lesson.topicCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
