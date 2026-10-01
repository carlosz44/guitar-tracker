import type { MeResponse } from "@ds/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { createAppRouter } from "@/router";

export const carlos: MeResponse = {
  user: { id: "0190f0e0-0000-7000-8000-000000000001", name: "Carlos Amorós", image: null },
  settings: { timezone: "America/Lima", dailyTargetMinutes: 30, lessonWeekday: 4 },
  lastBackupAt: null,
};

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (request: RecordedRequest) => Response | undefined;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fakeApi(options: { me: MeResponse | null; handlers?: Handler[] }) {
  const requests: RecordedRequest[] = [];
  let me = options.me;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request =
      input instanceof Request
        ? input
        : new Request(new URL(String(input), "http://localhost"), init);
    const url = new URL(request.url);
    const text = await request.clone().text();
    const recorded = {
      method: request.method,
      path: url.pathname + url.search,
      body: text ? JSON.parse(text) : undefined,
    };
    requests.push(recorded);

    for (const handler of options.handlers ?? []) {
      const response = handler(recorded);
      if (response) return response;
    }
    if (url.pathname === "/api/me") {
      return me ? json(me) : json({ error: "unauthorized" }, 401);
    }
    if (url.pathname === "/api/auth/sign-out") {
      me = null;
      return json({ success: true });
    }
    if (url.pathname === "/api/auth/get-session") return json(null);
    if (url.pathname === "/api/lessons" && request.method === "GET") return json({ lessons: [] });
    if (url.pathname === "/api/topics" && request.method === "GET") return json({ topics: [] });
    if (url.pathname === "/api/questions" && request.method === "GET")
      return json({ questions: [] });
    return json({ error: "not_found" }, 404);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock, json };
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter(queryClient, history);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}

export { json };
