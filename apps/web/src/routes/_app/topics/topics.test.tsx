import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";
import { PARENT_ID, TOPIC_ID, topicDetail, topicList } from "@/test/topic-fixtures";

function topicsApi(detail = topicDetail()) {
  return ({ method, path }: RecordedRequest) => {
    if (
      (method === "GET" && path.startsWith("/api/topics?")) ||
      (method === "GET" && path === "/api/topics")
    ) {
      const category = new URL(path, "http://x").searchParams.get("category");
      return json({
        topics: topicList.topics.filter((topic) => !category || topic.category === category),
      });
    }
    if (method === "GET" && path === `/api/topics/${TOPIC_ID}`) return json(detail);
    return undefined;
  };
}

describe("topics list", () => {
  it("AC-12: groups topics by status, with Archivados collapsed", async () => {
    fakeApi({ me: carlos, handlers: [topicsApi()] });
    renderApp("/topics");
    expect(await screen.findByRole("heading", { name: es.topicStatusGroups.new })).toBeTruthy();
    expect(screen.getByRole("heading", { name: es.topicStatusGroups.active })).toBeTruthy();
    expect(screen.getByRole("heading", { name: es.topicStatusGroups.maintenance })).toBeTruthy();
    expect(screen.queryByText("Escala de blues")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: es.topicsPage.archived(1) }));
    expect(screen.getByText("Escala de blues")).toBeTruthy();
  });

  it("AC-12: each row shows category, priority and parent", async () => {
    fakeApi({ me: carlos, handlers: [topicsApi()] });
    renderApp("/topics");
    const row = (await screen.findByText("Tríadas de dórico")).closest("a") as HTMLElement;
    expect(row.textContent).toContain(es.categories.chords_arpeggios);
    expect(row.textContent).toContain(es.priorities[2]);
    expect(row.textContent).toContain(es.topicsPage.childOf("Modo dórico"));
  });

  it("AC-12: filters by category", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [topicsApi()] });
    renderApp("/topics");
    await screen.findByText("Cromática");
    await userEvent.selectOptions(
      screen.getByLabelText(es.topicsPage.category),
      es.categories.technique,
    );
    await waitFor(() => expect(screen.queryByText("Tríadas de dórico")).toBeNull());
    expect(screen.getByText("Cromática")).toBeTruthy();
    expect(requests.some((r) => r.path === "/api/topics?category=technique")).toBe(true);
  });
});

describe("topic form", () => {
  it("AC-11: creates a topic with every field", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        topicsApi(),
        ({ method, path }) =>
          method === "POST" && path === "/api/topics"
            ? json({ topic: topicDetail().topic }, 201)
            : undefined,
      ],
    });
    const { router } = renderApp("/topics/new");
    await userEvent.type(await screen.findByLabelText(es.topicForm.title), "Tríadas de dórico");
    await userEvent.selectOptions(
      screen.getByLabelText(es.topicForm.category),
      es.categories.chords_arpeggios,
    );
    await userEvent.type(
      screen.getByLabelText(es.topicForm.successCriteria),
      "3 veces limpias a 90",
    );
    await userEvent.type(screen.getByLabelText(es.topicForm.targetBpm), "90");
    await userEvent.selectOptions(
      screen.getByLabelText(es.topicForm.priority),
      es.priorities[3] ?? "",
    );
    await waitFor(() => expect(screen.getByRole("option", { name: "Modo dórico" })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(es.topicForm.parent), "Modo dórico");
    await userEvent.click(screen.getByRole("button", { name: es.topicForm.save }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/topics/${TOPIC_ID}`));
    expect(requests.find((r) => r.method === "POST")?.body).toMatchObject({
      title: "Tríadas de dórico",
      category: "chords_arpeggios",
      successCriteria: "3 veces limpias a 90",
      targetBpm: 90,
      priority: 3,
      defaultBlockMinutes: 10,
      parentId: PARENT_ID,
    });
  });

  it("AC-11: shows Spanish messages for a missing title and an out-of-range BPM", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [topicsApi()] });
    renderApp("/topics/new");
    await userEvent.type(await screen.findByLabelText(es.topicForm.targetBpm), "500");
    await userEvent.click(screen.getByRole("button", { name: es.topicForm.save }));
    expect(await screen.findByText(es.validation["topic.title"])).toBeTruthy();
    expect(screen.getByText(es.validation["topic.targetBpm"])).toBeTruthy();
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });

  it("AC-14: shows the server's cycle error under the parent field", async () => {
    fakeApi({
      me: carlos,
      handlers: [
        topicsApi(),
        ({ method }) =>
          method === "PATCH"
            ? json(
                { error: "invalid", issues: [{ path: ["parentId"], message: "topic.cycle" }] },
                400,
              )
            : undefined,
      ],
    });
    renderApp(`/topics/${TOPIC_ID}/edit`);
    await userEvent.click(await screen.findByRole("button", { name: es.topicForm.save }));
    expect(await screen.findByText(es.validation["topic.cycle"])).toBeTruthy();
  });
});

describe("topic page", () => {
  it("AC-13: shows all fields, parent, children, linked lessons with relation, and open questions", async () => {
    fakeApi({ me: carlos, handlers: [topicsApi()] });
    renderApp(`/topics/${TOPIC_ID}`);
    expect(
      await screen.findByRole("heading", { name: "Tríadas de dórico", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("A").tagName).toBe("STRONG");
    expect(screen.getByText("3 veces limpias a 90")).toBeTruthy();
    expect(screen.getByText("Cuerdas 1–3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Modo dórico" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Inversiones" })).toBeTruthy();
    const lesson = screen.getByRole("link", { name: /Clase de dórico/ });
    expect(lesson.textContent).toContain(es.relations.introduced);
    expect(screen.getByText("¿Qué digitación uso?")).toBeTruthy();
  });

  it("AC-13: changes the status to any other status", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        topicsApi(),
        ({ method }) => (method === "PATCH" ? json({ topic: topicDetail().topic }) : undefined),
      ],
    });
    renderApp(`/topics/${TOPIC_ID}`);
    await userEvent.selectOptions(
      await screen.findByLabelText(es.topicPage.status),
      es.topicStatus.maintenance,
    );
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "maintenance" }),
    );
  });

  it("offers archiving instead of deleting a topic linked to lessons", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        topicsApi(),
        ({ method }) => (method === "PATCH" ? json({ topic: topicDetail().topic }) : undefined),
      ],
    });
    renderApp(`/topics/${TOPIC_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.topicPage.delete }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(es.validation["topic.hasLessons"])).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", { name: es.topicPage.archiveInstead }),
    );
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "archived" }),
    );
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("deletes a topic with no lessons", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        topicsApi(topicDetail({ lessons: [] })),
        ({ method }) => (method === "DELETE" ? new Response(null, { status: 204 }) : undefined),
      ],
    });
    const { router } = renderApp(`/topics/${TOPIC_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: es.topicPage.delete }));
    await userEvent.click(await screen.findByRole("button", { name: es.topicPage.deleteConfirm }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/topics"));
    expect(
      requests.some((r) => r.method === "DELETE" && r.path === `/api/topics/${TOPIC_ID}`),
    ).toBe(true);
  });
});
