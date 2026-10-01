import { todayIn } from "@ds/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { LESSON_ID, lessonDetail, lessonList } from "@/test/lesson-fixtures";
import { carlos, fakeApi, json, renderApp } from "@/test/render-app";

const detailHandler =
  (detail = lessonDetail()) =>
  ({ method, path }: { method: string; path: string }) => {
    if (method === "GET" && path === `/api/lessons/${LESSON_ID}`) return json(detail);
    if (method === "GET" && path === "/api/lessons") return json(lessonList);
    return undefined;
  };

describe("lessons list", () => {
  it("AC-1: lists lessons in the order the API gives (newest first), with counts", async () => {
    fakeApi({ me: carlos, handlers: [detailHandler()] });
    renderApp("/lessons");
    const items = await screen.findAllByRole("link", { name: /Modo dórico|Jónico/ });
    expect(items[0]?.textContent).toContain("Modo dórico");
    expect(items[0]?.textContent).toContain("jueves, 1 de octubre de 2026");
    expect(items[0]?.textContent).toContain(es.lessonsPage.counts(3, 2));
    expect(items[1]?.textContent).toContain("Jónico");
  });

  it("shows the empty state", async () => {
    fakeApi({ me: carlos });
    renderApp("/lessons");
    expect(await screen.findByText(es.lessonsPage.empty)).toBeTruthy();
  });
});

describe("new lesson", () => {
  it("AC-1: defaults the date to today in Lima and creates the lesson", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        detailHandler(),
        ({ method, path, body }) =>
          method === "POST" && path === "/api/lessons"
            ? json({ lesson: { ...lessonDetail().lesson, ...(body as object) } }, 201)
            : undefined,
      ],
    });
    const { router } = renderApp("/lessons/new");
    const date = (await screen.findByLabelText(es.lessonForm.date)) as HTMLInputElement;
    expect(date.value).toBe(todayIn("America/Lima"));

    await userEvent.type(screen.getByLabelText(es.lessonForm.title), "Modo dórico");
    await userEvent.type(screen.getByLabelText(es.lessonForm.notes), "Notas");
    await userEvent.click(screen.getByRole("button", { name: es.list.add }));
    await userEvent.type(screen.getByLabelText(es.list.item(1)), "Tríadas");
    await userEvent.click(screen.getByRole("button", { name: es.lessonForm.save }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/lessons/${LESSON_ID}`));
    expect(requests.find((r) => r.method === "POST")?.body).toMatchObject({
      title: "Modo dórico",
      rawNotes: "Notas",
      practicePoints: ["Tríadas"],
      date: todayIn("America/Lima"),
    });
  });

  it("AC-1: a title is required, in Spanish", async () => {
    const { requests } = fakeApi({ me: carlos });
    renderApp("/lessons/new");
    await userEvent.click(await screen.findByRole("button", { name: es.lessonForm.save }));
    expect(await screen.findByText(es.validation["lesson.title"])).toBeTruthy();
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });
});

describe("lesson page", () => {
  it("AC-2: shows summary, files, practice points, topics by relation and the open questions count", async () => {
    fakeApi({ me: carlos, handlers: [detailHandler()] });
    renderApp(`/lessons/${LESSON_ID}`);
    expect(await screen.findByRole("heading", { name: "Modo dórico", level: 1 })).toBeTruthy();
    expect(screen.getByText("A").tagName).toBe("EM");
    expect(screen.getByText("triadas.gp")).toBeTruthy();
    expect(screen.getByText("ejercicios.pdf")).toBeTruthy();
    expect(screen.getByText("Tríadas en cuerdas 1–3")).toBeTruthy();
    expect(screen.getByText(es.relationGroups.introduced)).toBeTruthy();
    expect(screen.getByText(es.relationGroups.extended)).toBeTruthy();
    expect(screen.queryByText(es.relationGroups.reviewed)).toBeNull();
    expect(
      screen.getByRole("link", { name: es.lessonPage.openQuestions(2) }).getAttribute("href"),
    ).toBe(`/lessons/${LESSON_ID}#next-class`);
  });

  it("AC-3: editing starts from the saved values and saves changes", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        detailHandler(),
        ({ method }) => (method === "PATCH" ? json({ lesson: lessonDetail().lesson }) : undefined),
      ],
    });
    renderApp(`/lessons/${LESSON_ID}/edit`);
    const title = (await screen.findByLabelText(es.lessonForm.title)) as HTMLInputElement;
    expect(title.value).toBe("Modo dórico");
    await userEvent.clear(title);
    await userEvent.type(title, "Dórico II");
    await userEvent.click(screen.getByRole("button", { name: es.lessonForm.save }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toMatchObject({
        title: "Dórico II",
      }),
    );
  });

  it("AC-3: deleting asks for confirmation naming the file count, then returns to the list", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        detailHandler(),
        ({ method }) => (method === "DELETE" ? new Response(null, { status: 204 }) : undefined),
      ],
    });
    const { router } = renderApp(`/lessons/${LESSON_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.lessonPage.delete }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Se eliminarán 3 archivos. Sus temas se conservan."),
    ).toBeTruthy();
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);

    await userEvent.click(
      within(dialog).getByRole("button", { name: es.lessonPage.deleteConfirm }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/lessons"));
    expect(
      requests.some((r) => r.method === "DELETE" && r.path === `/api/lessons/${LESSON_ID}`),
    ).toBe(true);
  });
});
