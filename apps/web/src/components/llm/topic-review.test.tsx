import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { DRAFT_ID } from "@/test/llm-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";
import { TOPIC_ID, topicDetail, topicList } from "@/test/topic-fixtures";

const pendingView = {
  id: DRAFT_ID,
  kind: "topic_improve",
  subjectType: "topic",
  subjectId: TOPIC_ID,
  status: "pending",
  error: null,
  instruction: "",
  payload: {
    description: "Tríadas **cerradas** del modo dórico.",
    practicePoints: ["Cuerdas 1–3 a 80"],
    successCriteria: "Limpio a 100 dos días seguidos.",
  },
  review: {
    description: { state: "pending" },
    practicePoints: { state: "pending" },
    successCriteria: { state: "pending" },
  },
  skippedFiles: [],
  current: {
    title: "Tríadas de dórico",
    description: "En **A**",
    practicePoints: ["Cuerdas 1–3"],
    successCriteria: "3 veces limpias a 90",
  },
};

function topicApi(state: { draft: { id: string; status: string } | null; view: unknown }) {
  return ({ method, path, body }: RecordedRequest) => {
    if (method === "GET" && path === `/api/topics/${TOPIC_ID}`)
      return json(topicDetail({ draft: state.draft }));
    if (method === "GET" && path.startsWith("/api/topics")) return json(topicList);
    if (method === "GET" && path === `/api/drafts/${DRAFT_ID}`) return json({ draft: state.view });
    if (method === "POST" && path === `/api/topics/${TOPIC_ID}/improve`) {
      state.draft = { id: DRAFT_ID, status: "queued" };
      state.view = { ...pendingView, status: "queued", payload: null };
      return json({ draftId: DRAFT_ID }, 202);
    }
    const section = path.match(/sections\/(\w+)$/)?.[1];
    if (method === "POST" && section) {
      const view = state.view as typeof pendingView;
      state.view = {
        ...view,
        review: {
          ...view.review,
          [section]: {
            state: (body as { action: string }).action === "accept" ? "accepted" : "discarded",
          },
        },
      };
      return json({ draft: state.view });
    }
    return undefined;
  };
}

describe("Mejorar con Claude", () => {
  it("AC-12: starts from the topic page and shows the waiting state", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [topicApi({ draft: null, view: null })] });
    renderApp(`/topics/${TOPIC_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.llm.improveTopic }));
    expect(await screen.findByText(es.llm.readingTopic)).toBeTruthy();
    expect(requests.some((r) => r.method === "POST" && r.path.endsWith("/improve"))).toBe(true);
  });

  it("AC-12: reviews description, practice points and success criteria separately", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [topicApi({ draft: { id: DRAFT_ID, status: "pending" }, view: pendingView })],
    });
    renderApp(`/topics/${TOPIC_ID}`);
    const description = await screen.findByRole("region", { name: es.review.sections.description });
    const editor = within(description).getByLabelText(es.review.sections.description);
    await userEvent.clear(editor);
    await userEvent.type(editor, "Tríadas cerradas.");
    await userEvent.click(within(description).getByRole("button", { name: es.review.accept }));
    await waitFor(() =>
      expect(requests.find((r) => r.path.endsWith("/sections/description"))?.body).toEqual({
        action: "accept",
        value: "Tríadas cerradas.",
      }),
    );
    const points = screen.getByRole("region", { name: es.review.sections.practicePoints });
    await userEvent.click(within(points).getByRole("button", { name: es.review.discard }));
    await waitFor(() =>
      expect(requests.find((r) => r.path.endsWith("/sections/practicePoints"))?.body).toEqual({
        action: "discard",
      }),
    );
    expect(
      await within(screen.getByRole("region", { name: es.review.sections.description })).findByText(
        es.review.accepted,
      ),
    ).toBeTruthy();
  });

  it("AC-16: hidden when Claude isn't configured", async () => {
    fakeApi({
      me: { ...carlos, llm: { enabled: false } },
      handlers: [topicApi({ draft: null, view: null })],
    });
    renderApp(`/topics/${TOPIC_ID}`);
    await screen.findByRole("heading", { name: "Tríadas de dórico", level: 1 });
    expect(screen.queryByRole("button", { name: es.llm.improveTopic })).toBeNull();
  });
});
