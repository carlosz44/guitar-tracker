import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { LESSON_ID, lessonDetail, lessonList } from "@/test/lesson-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";
import { TOPIC_ID, topicDetail, topicList } from "@/test/topic-fixtures";

const openQuestions = [
  {
    id: "q1",
    text: "¿Qué digitación uso en el compás 3?",
    createdAt: "2026-09-28T00:00:00.000Z",
    topic: null,
  },
  {
    id: "q2",
    text: "¿Puedo usar púa?",
    createdAt: "2026-09-29T00:00:00.000Z",
    topic: { id: TOPIC_ID, title: "Tríadas de dórico" },
  },
];

function api(detail = lessonDetail({ openQuestions })) {
  return ({ method, path }: RecordedRequest) => {
    if (method === "GET" && path === `/api/lessons/${LESSON_ID}`) return json(detail);
    if (method === "GET" && path === "/api/lessons") return json(lessonList);
    if (method === "GET" && path === "/api/topics") return json(topicList);
    if (method === "GET" && path === `/api/topics/${TOPIC_ID}`) return json(topicDetail());
    if (method === "POST" && path === "/api/questions") return json({ question: {} }, 201);
    if (method === "PATCH" && path.startsWith("/api/questions/")) return json({ question: {} });
    return undefined;
  };
}

async function ask(text: string) {
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(within(dialog).getByLabelText(es.questions.text), text);
  await userEvent.click(within(dialog).getByRole("button", { name: es.questions.save }));
}

describe("+ Pregunta", () => {
  it("AC-16: adds a question from anywhere in the app, with no topic", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp("/today");
    const [globalButton] = await screen.findAllByRole("button", { name: es.questions.addLabel });
    await userEvent.click(globalButton as HTMLElement);
    await ask("¿Cómo practico el vibrato?");
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toEqual({
        text: "¿Cómo practico el vibrato?",
        topicId: null,
      }),
    );
    expect(await screen.findByText(es.questions.saved)).toBeTruthy();
  });

  it("AC-16: from a topic page, the question is linked to that topic", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/topics/${TOPIC_ID}`);
    await screen.findByRole("heading", { name: "Tríadas de dórico", level: 1 });
    await userEvent.click(
      within(screen.getByRole("main")).getByRole("button", { name: es.questions.addLabel }),
    );
    await ask("¿Más rápido?");
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toEqual({
        text: "¿Más rápido?",
        topicId: TOPIC_ID,
      }),
    );
  });

  it("AC-16: from a lesson page, a question can be added too", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    await screen.findByRole("heading", { name: "Modo dórico", level: 1 });
    await userEvent.click(
      within(screen.getByRole("main")).getByRole("button", { name: es.questions.addLabel }),
    );
    await ask("¿Repaso jónico?");
    await waitFor(() => expect(requests.some((r) => r.method === "POST")).toBe(true));
  });

  it("asks for the question text in Spanish", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp("/today");
    const [globalButton] = await screen.findAllByRole("button", { name: es.questions.addLabel });
    await userEvent.click(globalButton as HTMLElement);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: es.questions.save }),
    );
    expect(await screen.findByText(es.validation["question.text"])).toBeTruthy();
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });
});

describe("Para la próxima clase", () => {
  it("AC-17: the latest lesson lists the open questions", async () => {
    fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    const section = (await screen.findByRole("heading", { name: es.lessonPage.nextClass })).closest(
      "section",
    );
    expect(within(section as HTMLElement).getByText(openQuestions[0]?.text ?? "")).toBeTruthy();
    expect(within(section as HTMLElement).getByText("Tríadas de dórico")).toBeTruthy();
  });

  it("AC-17: answers a question with the answer text and the lesson it was answered in", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    const [answer] = await screen.findAllByRole("button", { name: es.questions.answer });
    await userEvent.click(answer as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(es.questions.answerText), "Usa 1-2-4");
    await userEvent.click(within(dialog).getByRole("button", { name: es.questions.markAnswered }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")).toMatchObject({
        path: "/api/questions/q1",
        body: { status: "answered", answer: "Usa 1-2-4", answeredInLessonId: LESSON_ID },
      }),
    );
  });

  it("AC-17: answering needs the answer text", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    const [answer] = await screen.findAllByRole("button", { name: es.questions.answer });
    await userEvent.click(answer as HTMLElement);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: es.questions.markAnswered,
      }),
    );
    expect(await screen.findByText(es.validation["question.answer"])).toBeTruthy();
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
  });

  it("AC-17: dismisses a question", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    const dismiss = await screen.findAllByRole("button", { name: es.questions.dismiss });
    await userEvent.click(dismiss[1] as HTMLElement);
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")).toMatchObject({
        path: "/api/questions/q2",
        body: { status: "dismissed" },
      }),
    );
  });

  it("AC-17: older lessons don't show the list", async () => {
    fakeApi({ me: carlos, handlers: [api(lessonDetail({ isLatest: false, openQuestions: [] }))] });
    renderApp(`/lessons/${LESSON_ID}`);
    await screen.findByRole("heading", { name: "Modo dórico", level: 1 });
    expect(screen.queryByRole("heading", { name: es.lessonPage.nextClass })).toBeNull();
  });
});
