import type { CreateTopic } from "@ds/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { TopicForm } from "@/components/topics/topic-form";
import { useTopicServerError } from "@/components/topics/use-topic-save";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { topicsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/topics/new")({ component: NewTopicPage });

function NewTopicPage() {
  const { data } = useQuery(topicsQuery());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { serverError, report } = useTopicServerError();
  const create = useMutation({
    mutationFn: async (values: CreateTopic) =>
      (await ensureOk(await api.topics.$post({ json: values }))).json(),
    onSuccess: async ({ topic }) => {
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      await navigate({ to: "/topics/$topicId", params: { topicId: topic.id } });
    },
    onError: report,
  });

  return (
    <>
      <PageHeader title={es.topicForm.newTitle} />
      <TopicForm
        defaultValues={{
          title: "",
          category: "technique",
          description: "",
          practicePoints: [],
          successCriteria: "",
          targetBpm: null,
          priority: 2,
          defaultBlockMinutes: 10,
          parentId: null,
        }}
        parentOptions={data?.topics ?? []}
        onSubmit={(values) => create.mutate(values)}
        onCancel={() => navigate({ to: "/topics" })}
        pending={create.isPending}
        serverError={serverError}
      />
    </>
  );
}
