import { type CreateLesson, todayIn } from "@ds/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LessonForm } from "@/components/lessons/lesson-form";
import { PageHeader } from "@/components/page-header";
import { es } from "@/i18n/es";
import { api, ensureOk, meQuery } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/lessons/new")({ component: NewLessonPage });

function NewLessonPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: async (values: CreateLesson) =>
      (await ensureOk(await api.lessons.$post({ json: values }))).json(),
    onSuccess: async ({ lesson }) => {
      await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      await navigate({ to: "/lessons/$lessonId", params: { lessonId: lesson.id } });
    },
    onError: (error) => toast.error(errorMessage(error, es.lessonForm.saveError)),
  });

  return (
    <>
      <PageHeader title={es.lessonForm.newTitle} />
      <LessonForm
        defaultValues={{
          date: todayIn(me.settings.timezone),
          title: "",
          rawNotes: "",
          summary: "",
          practicePoints: [],
          homework: "",
        }}
        onSubmit={(values) => create.mutate(values)}
        onCancel={() => navigate({ to: "/lessons" })}
        pending={create.isPending}
      />
    </>
  );
}
