import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { LESSON_ID, lessonDetail, lessonList } from "@/test/lesson-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";

const topics = [
  {
    id: "t1",
    title: "Tríadas de dórico",
    category: "chords_arpeggios",
    status: "new",
    priority: 2,
    parent: null,
  },
  {
    id: "t2",
    title: "Modo dórico",
    category: "scales_modes",
    status: "active",
    priority: 2,
    parent: null,
  },
  {
    id: "t3",
    title: "Cromática",
    category: "technique",
    status: "active",
    priority: 1,
    parent: null,
  },
  {
    id: "t4",
    title: "Blues",
    category: "scales_modes",
    status: "archived",
    priority: 2,
    parent: null,
  },
];

function lessonApi({ method, path }: RecordedRequest) {
  if (method === "GET" && path === `/api/lessons/${LESSON_ID}`) return json(lessonDetail());
  if (method === "GET" && path === "/api/lessons") return json(lessonList);
  if (method === "GET" && path === "/api/topics") return json({ topics });
  if (method === "PUT" && path === `/api/lessons/${LESSON_ID}/topics`)
    return json({ topics: lessonDetail().topics });
  if (method === "POST" && path === "/api/topics")
    return json({ topic: { ...topics[2], id: "new-topic" } }, 201);
  return undefined;
}

const puts = (requests: RecordedRequest[]) =>
  requests.filter((r) => r.method === "PUT").map((r) => r.body);

describe("linking topics to a lesson", () => {
  it("AC-15: links an existing topic with the chosen relation, without offering ones already linked", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [lessonApi] });
    renderApp(`/lessons/${LESSON_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.linking.title }));
    await userEvent.selectOptions(
      screen.getByLabelText(es.linking.relation),
      es.relations.reviewed,
    );
    expect(await screen.findByRole("option", { name: "Cromática" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Modo dórico" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Blues" })).toBeNull();

    await userEvent.click(screen.getByRole("option", { name: "Cromática" }));
    await waitFor(() =>
      expect(puts(requests)).toEqual([
        [
          { topicId: "t1", relation: "introduced" },
          { topicId: "t2", relation: "extended" },
          { topicId: "t3", relation: "reviewed" },
        ],
      ]),
    );
  });

  it("AC-15: creates a new topic inline and links it, without leaving the page", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [lessonApi] });
    const { router } = renderApp(`/lessons/${LESSON_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.linking.title }));
    await userEvent.type(screen.getByPlaceholderText(es.linking.search), "Arpegios de dórico");
    await userEvent.click(
      await screen.findByRole("option", { name: es.linking.create("Arpegios de dórico") }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText(es.linking.category),
      es.categories.chords_arpeggios,
    );
    await userEvent.click(screen.getByRole("button", { name: es.linking.link }));

    await waitFor(() => expect(puts(requests)).toHaveLength(1));
    expect(requests.find((r) => r.method === "POST" && r.path === "/api/topics")?.body).toEqual({
      title: "Arpegios de dórico",
      category: "chords_arpeggios",
    });
    expect(puts(requests)[0]).toContainEqual({ topicId: "new-topic", relation: "introduced" });
    expect(router.state.location.pathname).toBe(`/lessons/${LESSON_ID}`);
  });

  it("AC-15: doesn't offer to create a topic that already exists", async () => {
    fakeApi({ me: carlos, handlers: [lessonApi] });
    renderApp(`/lessons/${LESSON_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.linking.title }));
    await userEvent.type(screen.getByPlaceholderText(es.linking.search), "cromática");
    expect(await screen.findByRole("option", { name: "Cromática" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: es.linking.create("cromática") })).toBeNull();
  });

  it("AC-15: unlinks a topic", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [lessonApi] });
    renderApp(`/lessons/${LESSON_ID}`);
    await userEvent.click(
      await screen.findByRole("button", { name: es.linking.remove("Modo dórico") }),
    );
    await waitFor(() =>
      expect(puts(requests)).toEqual([[{ topicId: "t1", relation: "introduced" }]]),
    );
  });
});
