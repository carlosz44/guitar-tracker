import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { LESSON_ID, lessonDetail, lessonList } from "@/test/lesson-fixtures";
import { DRAFT_ID, draftView } from "@/test/llm-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";

function lessonApi(state: { draft: { id: string; status: string } | null; view?: unknown }) {
  return ({ method, path }: RecordedRequest) => {
    if (method === "GET" && path === `/api/lessons/${LESSON_ID}`) {
      return json(lessonDetail({ draft: state.draft }));
    }
    if (method === "GET" && path === "/api/lessons") return json(lessonList);
    if (method === "GET" && path === `/api/drafts/${DRAFT_ID}`) return json({ draft: state.view });
    if (method === "POST" && path === `/api/lessons/${LESSON_ID}/enrich`) {
      state.draft = { id: DRAFT_ID, status: "queued" };
      state.view = draftView({ status: "queued", payload: null });
      return json({ draftId: DRAFT_ID }, 202);
    }
    return undefined;
  };
}

describe("Completar con Claude", () => {
  it("AC-1: starts enrichment and shows a waiting state that survives a reload", async () => {
    const state = { draft: null } as Parameters<typeof lessonApi>[0];
    const { requests } = fakeApi({ me: carlos, handlers: [lessonApi(state)] });
    const { unmount } = renderApp(`/lessons/${LESSON_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.llm.enrichLesson }));

    expect(await screen.findByText(es.llm.readingLesson)).toBeTruthy();
    expect(requests.find((r) => r.method === "POST")?.body).toEqual({ instruction: "" });
    expect(screen.queryByRole("button", { name: es.llm.enrichLesson })).toBeNull();
    unmount();

    state.view = draftView({ status: "running", payload: null });
    renderApp(`/lessons/${LESSON_ID}`);
    expect(await screen.findByText(es.llm.readingLesson)).toBeTruthy();
  });

  it("AC-16: hides the Claude buttons when Claude isn't configured", async () => {
    fakeApi({ me: { ...carlos, llm: { enabled: false } }, handlers: [lessonApi({ draft: null })] });
    renderApp(`/lessons/${LESSON_ID}`);
    await screen.findByRole("heading", { name: "Modo dórico" });
    expect(screen.queryByRole("button", { name: es.llm.enrichLesson })).toBeNull();
  });

  it("AC-4: a failed draft explains it and offers Reintentar with the same instruction", async () => {
    const state = {
      draft: { id: DRAFT_ID, status: "failed" },
      view: draftView({
        status: "failed",
        error: "invalid_output",
        payload: null,
        instruction: "más breve",
      }),
    };
    const { requests } = fakeApi({ me: carlos, handlers: [lessonApi(state)] });
    renderApp(`/lessons/${LESSON_ID}`);
    expect(await screen.findByText(es.llm.failed)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: es.llm.retry }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toEqual({ instruction: "más breve" }),
    );
  });

  it("AC-15: a draft refused over budget says so", async () => {
    const state = {
      draft: { id: DRAFT_ID, status: "failed" },
      view: draftView({ status: "failed", error: "llm.budget", payload: null }),
    };
    fakeApi({ me: carlos, handlers: [lessonApi(state)] });
    renderApp(`/lessons/${LESSON_ID}`);
    expect(await screen.findByText(es.validation["llm.budget"])).toBeTruthy();
  });
});

describe("quick capture", () => {
  it("AC-2: 'Guardar y completar con Claude' needs only the date and names the lesson after it", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        lessonApi({
          draft: { id: DRAFT_ID, status: "queued" },
          view: draftView({ status: "queued" }),
        }),
        ({ method, path, body }) =>
          method === "POST" && path === "/api/lessons"
            ? json(
                {
                  lesson: { ...lessonDetail().lesson, ...(body as object), status: "draft" },
                  draftId: DRAFT_ID,
                },
                201,
              )
            : undefined,
      ],
    });
    const { router } = renderApp("/lessons/new");
    const date = await screen.findByLabelText(es.lessonForm.date);
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-01");
    await userEvent.type(screen.getByLabelText(es.lessonForm.notes), "Tríadas en dórico");
    await userEvent.click(screen.getByRole("button", { name: es.llm.saveAndEnrich }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/lessons/${LESSON_ID}`));
    expect(requests.find((r) => r.method === "POST")?.body).toMatchObject({
      title: es.llm.defaultTitle("1 de octubre"),
      rawNotes: "Tríadas en dórico",
      enrich: true,
    });
  });

  it("AC-2: draft lessons show a Borrador badge in the list and on their page", async () => {
    fakeApi({
      me: carlos,
      handlers: [
        ({ method, path }) =>
          method === "GET" && path === "/api/lessons"
            ? json({ lessons: [{ ...lessonList.lessons[0], status: "draft" }] })
            : undefined,
        lessonApi({ draft: null }),
      ],
    });
    renderApp("/lessons");
    expect(await screen.findByText(es.llm.draftBadge)).toBeTruthy();
  });
});
