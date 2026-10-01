import { LESSON_RELATIONS } from "@ds/shared";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { es } from "@/i18n/es";

type LinkedTopic = { id: string; title: string; category: string; status: string };

export function LessonTopics({
  topics,
}: {
  topics: Record<(typeof LESSON_RELATIONS)[number], LinkedTopic[]>;
}) {
  const groups = LESSON_RELATIONS.filter((relation) => topics[relation].length > 0);
  if (groups.length === 0) return <p className="text-muted-foreground">{es.lessonPage.noTopics}</p>;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((relation) => (
        <div key={relation}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {es.relationGroups[relation]}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {topics[relation].map((topic) => (
              <li key={topic.id}>
                <Badge asChild variant="secondary" className="h-auto min-h-9 px-3 text-sm">
                  <Link to="/topics/$topicId" params={{ topicId: topic.id }}>
                    {topic.title}
                  </Link>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
