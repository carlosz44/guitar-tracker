import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export function useStartDraft(subject: { type: "lesson" | "topic"; id: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instruction?: string) => {
      const response =
        subject.type === "lesson"
          ? await api.lessons[":id"].enrich.$post({
              param: { id: subject.id },
              json: { instruction: instruction ?? "" },
            })
          : await api.topics[":id"].improve.$post({ param: { id: subject.id } });
      return (await ensureOk(response)).json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey:
          subject.type === "lesson" ? ["lessons", subject.id] : ["topics", "detail", subject.id],
      }),
    onError: (error) => toast.error(errorMessage(error, es.llm.failed)),
  });
}
