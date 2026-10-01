import type { CreateTopic } from "@ds/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { TopicForm } from "@/components/topics/topic-form";
import { useTopicServerError } from "@/components/topics/use-topic-save";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { topicQuery, topicsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/topics/$topicId/edit")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(topicQuery(params.topicId)),
  component: EditTopicPage,
});

function EditTopicPage() {
  const { topicId } = Route.useParams();
  const { data } = useSuspenseQuery(topicQuery(topicId));
  const { data: all } = useQuery(topicsQuery());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { serverError, report } = useTopicServerError();
  const back = () => navigate({ to: "/topics/$topicId", params: { topicId } });
  const save = useMutation({
    mutationFn: async (values: CreateTopic) =>
      (
        await ensureOk(await api.topics[":id"].$patch({ param: { id: topicId }, json: values }))
      ).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["topics"] });
      await back();
    },
    onError: report,
  });
  const { topic } = data;

  return (
    <>
      <PageHeader title={es.topicForm.editTitle} />
      <TopicForm
        defaultValues={{
          title: topic.title,
          category: topic.category,
          description: topic.description,
          practicePoints: topic.practicePoints,
          successCriteria: topic.successCriteria,
          targetBpm: topic.targetBpm,
          priority: topic.priority,
          defaultBlockMinutes: topic.defaultBlockMinutes,
          parentId: topic.parentId,
        }}
        parentOptions={(all?.topics ?? []).filter((option) => option.id !== topicId)}
        onSubmit={(values) => save.mutate(values)}
        onCancel={back}
        pending={save.isPending}
        serverError={serverError}
      />
    </>
  );
}
