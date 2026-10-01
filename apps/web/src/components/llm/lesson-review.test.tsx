import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { LESSON_ID, lessonDetail, lessonList } from "@/test/lesson-fixtures";
import { DRAFT_ID, draftView, QUESTION_ID } from "@/test/llm-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";

function reviewApi(view = draftView()) {
  const state = {
    view: view as ReturnType<typeof draftView> & { review: Record<string, unknown> },
  };
  const handler = ({ method, path, body }: RecordedRequest) => {
    if (method === "GET" && path === `/api/lessons/${LESSON_ID}`) {
      return json(lessonDetail({ draft: { id: DRAFT_ID, status: state.view.status } }));
    }
    if (method === "GET" && path === "/api/lessons") return json(lessonList);
    if (method === "GET" && path === `/api/drafts/${DRAFT_ID}`) return json({ draft: state.view });
    const section = path.match(/^\/api\/drafts\/[^/]+\/sections\/(\w+)$/)?.[1];
    if (method === "POST" && section) {
      const action = (body as { action: string }).action;
      state.view = {
        ...state.view,
        review: {
          ...state.view.review,
          [section]: { state: action === "accept" ? "accepted" : "discarded" },
        },
      };
      return json({ draft: state.view });
    }
    if (method === "POST" && path.endsWith("/discard")) {
      state.view = { ...state.view, status: "discarded" };
      return json({ draft: state.view });
    }
    if (method === "POST" && path.endsWith("/accept-all")) {
      state.view = { ...state.view, status: "accepted" };
      return json({ draft: state.view });
    }
    if (method === "POST" && path === `/api/lessons/${LESSON_ID}/enrich`) {
      return json({ draftId: DRAFT_ID }, 202);
    }
    return undefined;
  };
  return { state, handler };
}

async function open(view = draftView()) {
  const { handler } = reviewApi(view);
  const api = fakeApi({ me: carlos, handlers: [handler] });
  renderApp(`/lessons/${LESSON_ID}`);
  await screen.findByRole("heading", { name: es.review.heading });
  return api;
}

function bodyOf<T>(requests: RecordedRequest[], suffix: string) {
  const request = requests.find((r) => r.path.endsWith(suffix));
  if (!request) throw new Error(`no request to ${suffix}`);
  return request.body as T;
}

const card = (section: keyof typeof es.review.sections) =>
  screen.getByRole("region", { name: es.review.sections[section] });

describe("lesson review", () => {
  it("AC-5: shows each section's proposal next to the current value, editable before accepting", async () => {
    const { requests } = await open();
    const title = card("title");
    expect(within(title).getByText(es.review.showCurrent)).toBeTruthy();
    expect(within(title).getAllByText("Modo dórico").length).toBeGreaterThan(0);
    const input = within(title).getByLabelText(es.review.sections.title) as HTMLInputElement;
    expect(input.value).toBe("Modo dórico en tríadas");
    await userEvent.clear(input);
    await userEvent.type(input, "Dórico y tríadas");
    await userEvent.click(within(title).getByRole("button", { name: es.review.accept }));

    await waitFor(() =>
      expect(requests.find((r) => r.path.endsWith("/sections/title"))?.body).toEqual({
        action: "accept",
        value: "Dórico y tríadas",
      }),
    );
    expect(await within(card("title")).findByText(es.review.accepted)).toBeTruthy();
  });

  it("AC-6: suggested topics can be unchecked and edited before accepting", async () => {
    const { requests } = await open();
    const topics = card("topics");
    await userEvent.click(
      within(topics).getByRole("checkbox", { name: es.review.include("Modo dórico") }),
    );
    const bpm = within(topics).getByLabelText(es.review.targetBpm(1));
    await userEvent.clear(bpm);
    await userEvent.type(bpm, "85");
    await userEvent.selectOptions(
      within(topics).getByLabelText(es.review.relation(1)),
      es.relations.extended,
    );
    await userEvent.click(within(topics).getByRole("button", { name: es.review.accept }));

    await waitFor(() =>
      expect(requests.some((r) => r.path.endsWith("/sections/topics"))).toBe(true),
    );
    const { value } = bodyOf<{ value: unknown[] }>(requests, "/sections/topics");
    expect(value).toEqual([
      expect.objectContaining({
        title: "Arpegios menores",
        targetBpm: 85,
        relation: "extended",
        checked: true,
      }),
      expect.objectContaining({ title: "Modo dórico", checked: false }),
    ]);
  });

  it("AC-7: a question resolved in the meantime is shown as resolved and can't be checked", async () => {
    const view = draftView();
    await open({
      ...view,
      current: {
        ...view.current,
        questions: [{ id: QUESTION_ID, text: "¿Qué digitación uso?", status: "answered" }],
      },
    });
    const answers = card("answers");
    expect(within(answers).getByText(es.review.resolved)).toBeTruthy();
    const box = within(answers).getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
  });

  it("AC-8: suggested questions show the topic they belong to", async () => {
    await open();
    expect(
      within(card("questions")).getByText(es.review.questionTopic("Arpegios menores")),
    ).toBeTruthy();
  });

  it("AC-9: 'Aceptar todo' sends the edited values of every pending section", async () => {
    const view = draftView();
    const { requests } = await open({
      ...view,
      review: { ...view.review, summary: { state: "discarded" } },
    });
    await userEvent.type(
      within(card("homework")).getByLabelText(es.review.sections.homework),
      " Hoy.",
    );
    await userEvent.click(screen.getByRole("button", { name: es.review.acceptAll }));
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/accept-all"))).toBe(true));
    const { values } = bodyOf<{ values: Record<string, unknown> }>(requests, "/accept-all");
    expect(Object.keys(values).sort()).toEqual(
      ["answers", "homework", "practicePoints", "questions", "title", "topics"].sort(),
    );
    expect(values.homework).toBe("Grabar el riff a 90. Hoy.");
  });

  it("AC-10: 'Regenerar' sends an optional instruction", async () => {
    const { requests } = await open();
    await userEvent.click(screen.getByRole("button", { name: es.review.regenerate }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(es.review.instruction), "más breve");
    await userEvent.click(within(dialog).getByRole("button", { name: es.review.regenerate }));
    await waitFor(() =>
      expect(requests.find((r) => r.path.endsWith("/enrich"))?.body).toEqual({
        instruction: "más breve",
      }),
    );
  });

  it("AC-11: sections and the whole draft can be discarded", async () => {
    const { requests } = await open();
    await userEvent.click(within(card("summary")).getByRole("button", { name: es.review.discard }));
    await waitFor(() =>
      expect(requests.find((r) => r.path.endsWith("/sections/summary"))?.body).toEqual({
        action: "discard",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: es.llm.discardDraft }));
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/discard"))).toBe(true));
  });
});
