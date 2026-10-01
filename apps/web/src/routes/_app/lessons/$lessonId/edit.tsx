import type { CreateLesson } from "@ds/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LessonForm } from "@/components/lessons/lesson-form";
import { PageHeader } from "@/components/page-header";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { lessonQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/lessons/$lessonId/edit")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(lessonQuery(params.lessonId)),
  component: EditLessonPage,
});

function EditLessonPage() {
  const { lessonId } = Route.useParams();
  const { data } = useSuspenseQuery(lessonQuery(lessonId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const back = () => navigate({ to: "/lessons/$lessonId", params: { lessonId } });
  const save = useMutation({
    mutationFn: async (values: CreateLesson) =>
      (
        await ensureOk(await api.lessons[":id"].$patch({ param: { id: lessonId }, json: values }))
      ).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      await back();
    },
    onError: (error) => toast.error(errorMessage(error, es.lessonForm.saveError)),
  });
  const { lesson } = data;

  return (
    <>
      <PageHeader title={es.lessonForm.editTitle} />
      <LessonForm
        defaultValues={{
          date: lesson.date,
          title: lesson.title,
          rawNotes: lesson.rawNotes,
          summary: lesson.summary,
          practicePoints: lesson.practicePoints,
          homework: lesson.homework,
        }}
        onSubmit={(values) => save.mutate(values)}
        onCancel={back}
        pending={save.isPending}
      />
    </>
  );
}
