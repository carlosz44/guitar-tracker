import { type CreateLesson, todayIn } from "@ds/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { UploadList } from "@/components/files/upload-list";
import { useUploads } from "@/components/files/use-uploads";
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
  const [files, setFiles] = useState<File[]>([]);
  const { uploads, add, dismiss } = useUploads();
  const create = useMutation({
    mutationFn: async ({ values, enrich }: { values: CreateLesson; enrich: boolean }) => {
      const withFiles = files.length > 0;
      const { lesson } = await (
        await ensureOk(
          await api.lessons.$post({
            json: { ...values, enrich: enrich && !withFiles, draft: enrich },
          }),
        )
      ).json();
      if (withFiles) {
        const results = await add(files, lesson.id);
        if (results.includes(false)) toast.error(es.lessonForm.uploadsFailed);
        if (enrich) {
          try {
            await ensureOk(
              await api.lessons[":id"].enrich.$post({
                param: { id: lesson.id },
                json: { instruction: "" },
              }),
            );
          } catch (error) {
            toast.error(errorMessage(error, es.llm.failed));
          }
        }
      }
      return { lesson };
    },
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
        onSubmit={(values) => create.mutate({ values, enrich: false })}
        onSubmitAndEnrich={
          me.llm.enabled ? (values) => create.mutate({ values, enrich: true }) : undefined
        }
        onCancel={() => navigate({ to: "/lessons" })}
        pending={create.isPending}
        files={{ chosen: files, onChange: setFiles }}
      />
      <div className="mt-4">
        <UploadList uploads={uploads} onDismiss={dismiss} />
      </div>
    </>
  );
}
