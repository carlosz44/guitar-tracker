import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  fetchOptions: { customFetchImpl: (input, init) => fetch(input, init) },
});

export function signInWithGitHub() {
  return authClient.signIn.social({
    provider: "github",
    callbackURL: "/today",
    errorCallbackURL: "/login",
  });
}
