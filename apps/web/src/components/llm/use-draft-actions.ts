import type { DraftSection } from "@ds/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export function useDraftActions(draftId: string, subjectKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const refresh = (draft?: unknown) => {
    if (draft) queryClient.setQueryData(["drafts", draftId], draft);
    return Promise.all(
      [subjectKey, ["lessons"], ["topics"], ["questions"], ["today"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
  const onError = (error: unknown) => toast.error(errorMessage(error, es.common.genericError));

  const section = useMutation({
    mutationFn: async (input: {
      section: DraftSection;
      action: "accept" | "discard";
      value?: unknown;
    }) =>
      (
        await (
          await ensureOk(
            await api.drafts[":id"].sections[":section"].$post({
              param: { id: draftId, section: input.section },
              json: { action: input.action, value: input.value },
            }),
          )
        ).json()
      ).draft,
    onSuccess: refresh,
    onError,
  });
  const acceptAll = useMutation({
    mutationFn: async (values: Partial<Record<DraftSection, unknown>>) =>
      (
        await (
          await ensureOk(
            await api.drafts[":id"]["accept-all"].$post({
              param: { id: draftId },
              json: { values },
            }),
          )
        ).json()
      ).draft,
    onSuccess: refresh,
    onError,
  });
  const discard = useMutation({
    mutationFn: async () =>
      (
        await (
          await ensureOk(await api.drafts[":id"].discard.$post({ param: { id: draftId } }))
        ).json()
      ).draft,
    onSuccess: refresh,
    onError,
  });
  return { section, acceptAll, discard };
}
