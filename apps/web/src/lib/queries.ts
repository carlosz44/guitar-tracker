import type { TopicCategory, TopicStatus } from "@ds/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, ensureOk } from "./api";

export const lessonsQuery = queryOptions({
  queryKey: ["lessons"],
  queryFn: async () => (await ensureOk(await api.lessons.$get())).json(),
});

export const lessonQuery = (id: string) =>
  queryOptions({
    queryKey: ["lessons", id],
    queryFn: async () => (await ensureOk(await api.lessons[":id"].$get({ param: { id } }))).json(),
    refetchInterval: (query) =>
      query.state.data?.files.some(
        (file) => file.uploadStatus === "uploading" || file.extractionStatus === "pending",
      )
        ? 2_000
        : false,
  });

export const topicsQuery = (filters: { status?: TopicStatus; category?: TopicCategory } = {}) =>
  queryOptions({
    queryKey: ["topics", filters],
    queryFn: async () => (await ensureOk(await api.topics.$get({ query: filters }))).json(),
  });

export const topicQuery = (id: string) =>
  queryOptions({
    queryKey: ["topics", "detail", id],
    queryFn: async () => (await ensureOk(await api.topics[":id"].$get({ param: { id } }))).json(),
  });

export const openQuestionsQuery = queryOptions({
  queryKey: ["questions", "open"],
  queryFn: async () =>
    (await ensureOk(await api.questions.$get({ query: { status: "open" } }))).json(),
});

export const fileQuery = (id: string) =>
  queryOptions({
    queryKey: ["files", id],
    queryFn: async () => (await ensureOk(await api.files[":id"].$get({ param: { id } }))).json(),
  });

export const todayQuery = queryOptions({
  queryKey: ["today"],
  queryFn: async () => (await ensureOk(await api.today.$get())).json(),
});
