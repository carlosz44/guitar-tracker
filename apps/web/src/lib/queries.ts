import type { TopicCategory, TopicStatus } from "@ds/shared";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
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

export const draftQuery = (id: string) =>
  queryOptions({
    queryKey: ["drafts", id],
    queryFn: async () =>
      (await (await ensureOk(await api.drafts[":id"].$get({ param: { id } }))).json()).draft,
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "running"
        ? 2_000
        : false,
  });

export const planQuery = (cycle?: string) =>
  queryOptions({
    queryKey: ["plans", "current", cycle ?? "now"],
    queryFn: async () =>
      (await ensureOk(await api.plans.current.$get({ query: cycle ? { cycle } : {} }))).json(),
    refetchInterval: (query) =>
      query.state.data?.plan?.llmStatus === "queued" ||
      query.state.data?.plan?.llmStatus === "running"
        ? 2_000
        : false,
  });

export const llmUsageQuery = queryOptions({
  queryKey: ["llm", "usage"],
  queryFn: async () => (await ensureOk(await api.llm.usage.$get())).json(),
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

export const historyQuery = infiniteQueryOptions({
  queryKey: ["sessions", "history"],
  initialPageParam: undefined as string | undefined,
  queryFn: async ({ pageParam }) =>
    (
      await ensureOk(
        await api.sessions.$get({
          query: pageParam ? { cycles: "4", before: pageParam } : { cycles: "4" },
        }),
      )
    ).json(),
  getNextPageParam: (page) => page.nextBefore,
});

export const sessionQuery = (id: string) =>
  queryOptions({
    queryKey: ["sessions", "detail", id],
    queryFn: async () => (await ensureOk(await api.sessions[":id"].$get({ param: { id } }))).json(),
  });
