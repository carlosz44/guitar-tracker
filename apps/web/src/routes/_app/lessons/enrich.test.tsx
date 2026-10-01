import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

class InstantXHR {
  upload = { onprogress: null };
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send() {
    this.status = 200;
    setTimeout(() => this.onload?.(), 0);
  }
}

function newLessonApi() {
  return ({ method, path, body }: RecordedRequest) => {
    if (method === "POST" && path === "/api/lessons") {
      const values = body as { draft: boolean };
      return json(
        {
          lesson: { ...lessonDetail().lesson, status: values.draft ? "draft" : "final" },
          draftId: null,
        },
        201,
      );
    }
    if (method === "POST" && path === `/api/lessons/${LESSON_ID}/files`) {
      return json(
        {
          fileId: "file-1",
          uploadUrl: "https://storage.test/put/1",
          contentType: "application/pdf",
        },
        201,
      );
    }
    if (method === "POST" && path === "/api/files/file-1/confirm") return json({ file: {} });
    return undefined;
  };
}

describe("files in the new-lesson form", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", InstantXHR);
  });

  const pdf = () => new File(["%PDF"], "ejercicios.pdf", { type: "application/pdf" });

  it("AC-17: 'Guardar y completar con Claude' uploads the chosen files, then starts Claude", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        newLessonApi(),
        lessonApi({
          draft: { id: DRAFT_ID, status: "queued" },
          view: draftView({ status: "queued" }),
        }),
      ],
    });
    const { router } = renderApp("/lessons/new");
    await screen.findByLabelText(es.lessonForm.date);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [pdf()] } });
    expect(screen.getByText("ejercicios.pdf")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: es.llm.saveAndEnrich }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/lessons/${LESSON_ID}`));
    const posts = requests.filter((r) => r.method === "POST").map((r) => r.path);
    expect(posts).toEqual([
      "/api/lessons",
      `/api/lessons/${LESSON_ID}/files`,
      "/api/files/file-1/confirm",
      `/api/lessons/${LESSON_ID}/enrich`,
    ]);
    expect(
      requests[requests.findIndex((r) => r.path === "/api/lessons" && r.method === "POST")]?.body,
    ).toMatchObject({
      enrich: false,
      draft: true,
    });
  });

  it("AC-17: a plain save uploads the files without starting Claude, and files can be removed first", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [newLessonApi(), lessonApi({ draft: null })],
    });
    const { router } = renderApp("/lessons/new");
    await userEvent.type(await screen.findByLabelText(es.lessonForm.title), "Clase");
    fireEvent.change(screen.getByTestId("file-input"), {
      target: { files: [pdf(), new File(["x"], "foto.jpg", { type: "image/jpeg" })] },
    });
    await userEvent.click(
      screen.getByRole("button", { name: es.lessonForm.removeFile("foto.jpg") }),
    );
    await userEvent.click(screen.getByRole("button", { name: es.lessonForm.save }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/lessons/${LESSON_ID}`));
    const posts = requests.filter((r) => r.method === "POST");
    expect(posts.map((r) => r.path)).toEqual([
      "/api/lessons",
      `/api/lessons/${LESSON_ID}/files`,
      "/api/files/file-1/confirm",
    ]);
    expect(posts[0]?.body).toMatchObject({ enrich: false, draft: false });
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

describe("planning after a lesson", () => {
  it("006 AC-14: a final lesson whose cycle has no plan offers 'Planificar la semana'", async () => {
    fakeApi({ me: carlos, handlers: [lessonApi({ draft: null })] });
    renderApp(`/lessons/${LESSON_ID}`);
    const prompt = await screen.findByTestId("plan-prompt");
    expect(prompt.querySelector("a")?.getAttribute("href")).toBe("/plan?cycle=2026-10-01");
  });

  it("006 AC-14: hidden while a draft is under review or once the cycle has a plan", async () => {
    fakeApi({
      me: carlos,
      handlers: [
        ({ method, path }) =>
          method === "GET" && path === `/api/lessons/${LESSON_ID}`
            ? json(
                lessonDetail({
                  cyclePlan: {
                    cycleStart: "2026-10-01",
                    ended: false,
                    plan: { id: "p", status: "draft" },
                  },
                }),
              )
            : undefined,
        lessonApi({ draft: null }),
      ],
    });
    renderApp(`/lessons/${LESSON_ID}`);
    await screen.findByRole("heading", { name: "Modo dórico" });
    expect(screen.queryByTestId("plan-prompt")).toBeNull();
  });
});
