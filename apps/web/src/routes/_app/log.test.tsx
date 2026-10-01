import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { sessionView } from "@/lib/practice/fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";

function api({ method, path }: RecordedRequest) {
  if (method === "GET" && path === "/api/topics") {
    return json({
      topics: [
        {
          id: "0190f0e0-0000-7000-8000-0000000000c1",
          title: "Tríadas de dórico",
          status: "active",
        },
      ],
    });
  }
  if (method === "POST" && path === "/api/sessions/manual")
    return json({ session: sessionView() }, 201);
  if (method === "GET" && path.startsWith("/api/sessions"))
    return json({ cycles: [], nextBefore: "2026-09-01" });
  return undefined;
}

describe("Registrar práctica", () => {
  it("AC-17: logs date, duration, topics or a free label with optional minutes and BPM, and notes", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api] });
    const { router } = renderApp("/log");
    const duration = await screen.findByLabelText(es.log.duration);
    await userEvent.clear(duration);
    await userEvent.type(duration, "35");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Tríadas de dórico" })).toBeTruthy(),
    );
    await userEvent.selectOptions(screen.getByLabelText(es.log.topic(1)), "Tríadas de dórico");
    await userEvent.type(screen.getByLabelText(es.log.bpm(1)), "85");
    await userEvent.click(screen.getByRole("button", { name: es.log.add }));
    await userEvent.type(screen.getByLabelText(es.log.label(2)), "Cromática");
    await userEvent.type(screen.getByLabelText(es.log.minutes(2)), "10");
    await userEvent.type(screen.getByLabelText(es.log.notes), "Sin la app");
    await userEvent.click(screen.getByRole("button", { name: es.log.save }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/history"));
    expect(requests.find((r) => r.path === "/api/sessions/manual")?.body).toMatchObject({
      minutes: 35,
      notes: "Sin la app",
      items: [
        { topicId: "0190f0e0-0000-7000-8000-0000000000c1", minutes: null, cleanBpm: 85 },
        { topicId: null, label: "Cromática", minutes: 10, cleanBpm: null },
      ],
    });
  });

  it("AC-17: explains problems in Spanish and sends nothing", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api] });
    renderApp("/log");
    await userEvent.clear(await screen.findByLabelText(es.log.duration));
    await userEvent.click(screen.getByRole("button", { name: es.log.save }));
    expect(await screen.findByText(es.validation["session.duration"])).toBeTruthy();
    expect(await screen.findByText(es.validation["session.blockLabel"])).toBeTruthy();
    expect(requests.some((r) => r.path === "/api/sessions/manual")).toBe(false);
  });
});
