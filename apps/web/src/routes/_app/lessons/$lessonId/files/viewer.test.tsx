import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/es";
import { LESSON_ID, lessonDetail } from "@/test/lesson-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";

const alphaTab = vi.hoisted(() => {
  class FakeAlphaTabApi {
    static instances: FakeAlphaTabApi[] = [];
    settings: { display: { scale: number; staveProfile: unknown } };
    loaded: unknown = null;
    updates = 0;
    renders = 0;
    destroyed = false;
    error = { on: vi.fn() };
    renderFinished = { on: (handler: () => void) => setTimeout(handler, 0) };
    constructor(
      readonly element: HTMLElement,
      readonly options: {
        display: { scale: number; staveProfile: unknown };
        player: { enablePlayer: boolean };
      },
    ) {
      this.settings = { display: { ...options.display } };
      FakeAlphaTabApi.instances.push(this);
    }
    load(data: unknown) {
      this.loaded = data;
      return true;
    }
    updateSettings() {
      this.updates += 1;
    }
    render() {
      this.renders += 1;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { FakeAlphaTabApi };
});

vi.mock("@coderline/alphatab", () => ({ AlphaTabApi: alphaTab.FakeAlphaTabApi }));

const [guitarPro, pdf, docx] = lessonDetail().files;

function fileHandler(file: Record<string, unknown>) {
  return ({ method, path }: RecordedRequest) => {
    if (method === "GET" && path === `/api/files/${file.id}`) return json({ file });
    if (method === "GET" && path.startsWith(`/api/files/${file.id}/url`)) {
      return json({ url: `https://storage.test/presigned/${file.id}` });
    }
    if (path === `/presigned/${file.id}`) return new Response(new Uint8Array([0x50, 0x4b, 3, 4]));
    return undefined;
  };
}

beforeEach(() => {
  alphaTab.FakeAlphaTabApi.instances = [];
  localStorage.clear();
});

describe("Guitar Pro viewer", () => {
  it("AC-8: shows only the tab staff, fitted to the page, with no player", async () => {
    fakeApi({
      me: carlos,
      handlers: [fileHandler({ ...guitarPro, meta: null, extractedText: "" })],
    });
    renderApp(`/lessons/${LESSON_ID}/files/${guitarPro?.id}`);
    await waitFor(() => expect(alphaTab.FakeAlphaTabApi.instances).toHaveLength(1));
    const [tab] = alphaTab.FakeAlphaTabApi.instances;
    expect(tab?.options).toMatchObject({
      display: { staveProfile: "Tab", layoutMode: "Page", scale: 1 },
      player: { enablePlayer: false },
    });
    await waitFor(() => expect(tab?.loaded).toEqual(new Uint8Array([0x50, 0x4b, 3, 4])));
  });

  it("AC-8: toggles standard notation on and off", async () => {
    fakeApi({
      me: carlos,
      handlers: [fileHandler({ ...guitarPro, meta: null, extractedText: "" })],
    });
    renderApp(`/lessons/${LESSON_ID}/files/${guitarPro?.id}`);
    await waitFor(() => expect(alphaTab.FakeAlphaTabApi.instances).toHaveLength(1));
    const tab = alphaTab.FakeAlphaTabApi.instances[0];

    await userEvent.click(await screen.findByRole("button", { name: es.viewer.showNotation }));
    expect(tab?.settings.display.staveProfile).toBe("ScoreTab");
    expect(tab?.renders).toBe(1);
    await userEvent.click(screen.getByRole("button", { name: es.viewer.tabOnly }));
    expect(tab?.settings.display.staveProfile).toBe("Tab");
  });

  it("AC-8: zoom changes the scale and is remembered on this device", async () => {
    fakeApi({
      me: carlos,
      handlers: [fileHandler({ ...guitarPro, meta: null, extractedText: "" })],
    });
    const { unmount } = renderApp(`/lessons/${LESSON_ID}/files/${guitarPro?.id}`);
    await waitFor(() => expect(alphaTab.FakeAlphaTabApi.instances).toHaveLength(1));
    await userEvent.click(await screen.findByRole("button", { name: es.viewer.zoomIn }));
    await userEvent.click(screen.getByRole("button", { name: es.viewer.zoomIn }));
    expect(alphaTab.FakeAlphaTabApi.instances[0]?.settings.display.scale).toBe(1.2);
    expect(screen.getByTestId("zoom").textContent).toBe(es.viewer.zoomValue(120));
    unmount();

    fakeApi({
      me: carlos,
      handlers: [fileHandler({ ...guitarPro, meta: null, extractedText: "" })],
    });
    renderApp(`/lessons/${LESSON_ID}/files/${guitarPro?.id}`);
    await waitFor(() => expect(alphaTab.FakeAlphaTabApi.instances).toHaveLength(2));
    expect(alphaTab.FakeAlphaTabApi.instances[1]?.options.display.scale).toBe(1.2);
  });

  it("AC-10: asks the API for a fresh file URL every time it opens", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [fileHandler({ ...guitarPro, meta: null, extractedText: "" })],
    });
    renderApp(`/lessons/${LESSON_ID}/files/${guitarPro?.id}`);
    await waitFor(() =>
      expect(requests.some((r) => r.path.startsWith(`/api/files/${guitarPro?.id}/url`))).toBe(true),
    );
  });
});

describe("other viewers", () => {
  it("AC-9: a Word file shows its extracted text and a download button", async () => {
    fakeApi({
      me: carlos,
      handlers: [fileHandler({ ...docx, meta: null, extractedText: "Tríadas de dórico" })],
    });
    renderApp(`/lessons/${LESSON_ID}/files/${docx?.id}`);
    expect((await screen.findByTestId("docx-text")).textContent).toBe("Tríadas de dórico");
    expect(screen.getByRole("link", { name: es.files.download }).getAttribute("href")).toBe(
      `/api/files/${docx?.id}/open?disposition=attachment`,
    );
  });

  it("AC-9: an image shows inline and opens full size", async () => {
    const image = {
      ...pdf,
      id: "img",
      kind: "image",
      originalName: "pizarra.jpg",
      meta: null,
      extractedText: null,
    };
    fakeApi({ me: carlos, handlers: [fileHandler(image)] });
    renderApp(`/lessons/${LESSON_ID}/files/img`);
    const img = await screen.findByRole("img", { name: "pizarra.jpg" });
    expect(img.getAttribute("src")).toBe("/api/files/img/open");
    expect(img.closest("a")?.getAttribute("target")).toBe("_blank");
  });

  it("AC-7: a file that couldn't be read says so and stays downloadable", async () => {
    fakeApi({
      me: carlos,
      handlers: [
        fileHandler({
          ...docx,
          extractionStatus: "failed",
          extractionError: "parse_error",
          meta: null,
          extractedText: null,
        }),
      ],
    });
    renderApp(`/lessons/${LESSON_ID}/files/${docx?.id}`);
    expect(await screen.findByText(es.files.failedLong)).toBeTruthy();
    expect(screen.getByRole("link", { name: es.files.download })).toBeTruthy();
  });
});
