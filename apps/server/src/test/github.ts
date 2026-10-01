import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { TEST_APP_URL } from "./app";

export interface FakeGitHubProfile {
  id: number;
  login: string;
  name: string;
  email: string;
}

export function useFakeGitHub() {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  return {
    signsInAs(profile: FakeGitHubProfile) {
      server.use(
        http.post("https://github.com/login/oauth/access_token", () =>
          HttpResponse.json({
            access_token: "gho_fake_access_token",
            token_type: "bearer",
            scope: "read:user,user:email",
          }),
        ),
        http.get("https://api.github.com/user", () =>
          HttpResponse.json({
            id: profile.id,
            login: profile.login,
            name: profile.name,
            email: profile.email,
            avatar_url: `https://avatars.example.com/u/${profile.id}`,
          }),
        ),
        http.get("https://api.github.com/user/emails", () =>
          HttpResponse.json([{ email: profile.email, primary: true, verified: true }]),
        ),
      );
    },
  };
}

type Requester = { request: (input: string, init?: RequestInit) => Response | Promise<Response> };

function cookieHeader(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

export async function signInWithGitHub(app: Requester) {
  const start = await app.request(`${TEST_APP_URL}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: TEST_APP_URL },
    body: JSON.stringify({ provider: "github", callbackURL: "/today", errorCallbackURL: "/login" }),
  });
  if (start.status !== 200) throw new Error(`sign-in start failed with ${start.status}`);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";

  const callback = await app.request(
    `${TEST_APP_URL}/api/auth/callback/github?code=fake-code&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookieHeader(start.headers.getSetCookie()) } },
  );
  const setCookies = callback.headers.getSetCookie();
  return {
    status: callback.status,
    location: callback.headers.get("location"),
    setCookies,
    cookie: cookieHeader(setCookies),
  };
}
