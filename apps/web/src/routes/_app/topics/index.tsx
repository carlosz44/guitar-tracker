import { TOPIC_CATEGORIES, TOPIC_STATUSES, type TopicCategory } from "@ds/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Layers, Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { topicsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/topics/")({
  validateSearch: z.object({ category: z.enum(TOPIC_CATEGORIES).optional() }),
  component: TopicsPage,
});

function TopicsPage() {
  const { category } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useQuery(topicsQuery({ category }));
  const [showArchived, setShowArchived] = useState(false);
  const topics = data?.topics ?? [];

  return (
    <>
      <PageHeader title={es.topics.title}>
        <Button asChild>
          <Link to="/topics/new">
            <Plus aria-hidden />
            {es.topicsPage.new}
          </Link>
        </Button>
      </PageHeader>

      <NativeSelect
        aria-label={es.topicsPage.category}
        className="mb-6 max-w-xs"
        value={category ?? ""}
        onChange={(event) =>
          navigate({
            search: { category: (event.target.value || undefined) as TopicCategory | undefined },
          })
        }
      >
        <option value="">{es.topicsPage.allCategories}</option>
        {TOPIC_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {es.categories[value]}
          </option>
        ))}
      </NativeSelect>

      {data && topics.length === 0 && <EmptyState icon={Layers} message={es.topicsPage.empty} />}

      <div className="flex flex-col gap-8">
        {TOPIC_STATUSES.map((status) => {
          const group = topics.filter((topic) => topic.status === status);
          if (group.length === 0) return null;
          const list = (
            <ul className="flex flex-col gap-2">
              {group.map((topic) => (
                <li key={topic.id}>
                  <Link
                    to="/topics/$topicId"
                    params={{ topicId: topic.id }}
                    className="flex flex-col gap-1 rounded-xl border p-4 hover:bg-muted"
                  >
                    <span className="font-medium">{topic.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        es.categories[topic.category],
                        es.priorities[topic.priority],
                        topic.parent ? es.topicsPage.childOf(topic.parent.title) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          );
          if (status !== "archived") {
            return (
              <Section key={status} title={es.topicStatusGroups[status]}>
                {list}
              </Section>
            );
          }
          return (
            <section key={status} className="flex flex-col gap-3">
              <Button
                variant="ghost"
                className="self-start"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((open) => !open)}
              >
                <ChevronDown aria-hidden className={showArchived ? "rotate-180" : undefined} />
                {es.topicsPage.archived(group.length)}
              </Button>
              {showArchived && list}
            </section>
          );
        })}
      </div>
    </>
  );
}
