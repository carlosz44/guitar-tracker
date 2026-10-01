import { MAX_FILE_BYTES } from "@ds/shared";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { es, validationMessage } from "@/i18n/es";
import { LESSON_ID, lessonDetail, lessonList } from "@/test/lesson-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";

class FakeXHR {
  static instances: FakeXHR[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  status = 0;
  body: unknown;
  upload: {
    onprogress:
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
    FakeXHR.instances.push(this);
  }
  progress(percent: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: percent, total: 100 });
  }
  finish(status = 200) {
    this.status = status;
    this.onload?.();
  }
}

beforeEach(() => {
  FakeXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

let created = 0;
function api(detail = lessonDetail({ files: [] })) {
  return ({ method, path }: RecordedRequest) => {
    if (method === "GET" && path === `/api/lessons/${LESSON_ID}`) return json(detail);
    if (method === "GET" && path === "/api/lessons") return json(lessonList);
    if (method === "POST" && path === `/api/lessons/${LESSON_ID}/files`) {
      created += 1;
      return json(
        {
          fileId: `file-${created}`,
          uploadUrl: `https://storage.test/put/${created}`,
          contentType: "application/pdf",
        },
        201,
      );
    }
    if (method === "POST" && /^\/api\/files\/[^/]+\/(confirm|retry)$/.test(path))
      return json({ file: {} });
    return undefined;
  };
}

function pick(files: File[]) {
  fireEvent.change(screen.getByTestId("file-input"), { target: { files } });
}

function pdf(name: string, size = 1000) {
  const file = new File(["x"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("file uploads", () => {
  it("AC-4: rejects other types and files over 25 MB before uploading, saying why in Spanish", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    await screen.findByText(es.files.choose);
    pick([new File(["x"], "canción.mp3"), pdf("libro.pdf", MAX_FILE_BYTES + 1)]);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      es.files.rejected("canción.mp3", validationMessage("file.extension")),
    );
    expect(alert.textContent).toContain(
      es.files.rejected("libro.pdf", validationMessage("file.size")),
    );
    expect(requests.some((r) => r.method === "POST")).toBe(false);
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("AC-4/AC-5: uploads several files at once straight to storage, each with its own progress bar, then confirms", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    await screen.findByText(es.files.choose);
    pick([pdf("uno.pdf"), pdf("dos.pdf")]);

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(2));
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    const byName = (name: string) =>
      FakeXHR.instances.find((xhr) => (xhr.body as File).name === name);
    const first = byName("uno.pdf");
    const second = byName("dos.pdf");
    expect(first?.method).toBe("PUT");
    expect(first?.url).toMatch(/^https:\/\/storage\.test\/put\//);
    expect(first?.headers["Content-Type"]).toBe("application/pdf");
    expect(
      requests.filter((r) => r.path === `/api/lessons/${LESSON_ID}/files`).map((r) => r.body),
    ).toEqual([
      { name: "uno.pdf", mime: "application/pdf", size: 1000 },
      { name: "dos.pdf", mime: "application/pdf", size: 1000 },
    ]);

    act(() => first?.progress(40));
    await waitFor(() =>
      expect(
        screen.getByRole("progressbar", { name: "uno.pdf" }).getAttribute("aria-valuenow"),
      ).toBe("40"),
    );

    act(() => {
      first?.finish();
      second?.finish();
    });
    await waitFor(() =>
      expect(requests.filter((r) => r.path.endsWith("/confirm"))).toHaveLength(2),
    );
    await waitFor(() => expect(screen.queryAllByRole("progressbar")).toHaveLength(0));
  });

  it("AC-5: a failed upload shows an error and is never confirmed", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    renderApp(`/lessons/${LESSON_ID}`);
    await screen.findByText(es.files.choose);
    pick([pdf("uno.pdf")]);
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    act(() => FakeXHR.instances[0]?.finish(403));
    expect(await screen.findByText(es.files.uploadFailed)).toBeTruthy();
    expect(requests.some((r) => r.path.endsWith("/confirm"))).toBe(false);
  });
});

describe("file rows", () => {
  const failed = {
    ...lessonDetail().files[0],
    id: "bad",
    originalName: "roto.gp",
    extractionStatus: "failed",
    extractionError: "parse_error",
  };

  it("AC-7: a file that couldn't be read says so and offers to retry", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [api(lessonDetail({ files: [failed] }))],
    });
    renderApp(`/lessons/${LESSON_ID}`);
    expect(await screen.findByText(es.files.failedLong)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: es.files.retry }));
    await waitFor(() => expect(requests.some((r) => r.path === "/api/files/bad/retry")).toBe(true));
  });

  it("shows processing and ready badges, and warns about duplicates", async () => {
    const files = [
      { ...lessonDetail().files[0], extractionStatus: "pending" },
      { ...lessonDetail().files[2], duplicateOf: "notas-viejas.docx" },
    ];
    fakeApi({ me: carlos, handlers: [api(lessonDetail({ files }))] });
    renderApp(`/lessons/${LESSON_ID}`);
    expect(await screen.findByText(es.files.processing)).toBeTruthy();
    expect(screen.getByText(es.files.ready)).toBeTruthy();
    expect(screen.getByText(es.files.duplicate("notas-viejas.docx"))).toBeTruthy();
  });

  it("AC-9: PDFs open in a new tab through a fresh-URL endpoint; other files open the viewer", async () => {
    fakeApi({ me: carlos, handlers: [api(lessonDetail())] });
    renderApp(`/lessons/${LESSON_ID}`);
    const pdfLink = (await screen.findByText("ejercicios.pdf")).closest("a");
    expect(pdfLink?.getAttribute("href")).toBe("/api/files/f2/open");
    expect(pdfLink?.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("triadas.gp").closest("a")?.getAttribute("href")).toBe(
      `/lessons/${LESSON_ID}/files/f1`,
    );
  });

  it("deletes a file after confirmation", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        api(lessonDetail()),
        ({ method }) => (method === "DELETE" ? new Response(null, { status: 204 }) : undefined),
      ],
    });
    renderApp(`/lessons/${LESSON_ID}`);
    await userEvent.click(
      await screen.findByRole("button", { name: es.files.delete("triadas.gp") }),
    );
    await userEvent.click(await screen.findByRole("button", { name: es.files.deleteConfirm }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "DELETE" && r.path === "/api/files/f1")).toBe(true),
    );
  });
});
