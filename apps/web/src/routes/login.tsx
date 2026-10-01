import { AUTH_ERROR_NOT_ALLOWLISTED } from "@ds/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { meQuery } from "@/lib/api";
import { signInWithGitHub } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ error: z.string().optional() }),
  beforeLoad: async ({ search, context }) => {
    if (search.error === AUTH_ERROR_NOT_ALLOWLISTED) throw redirect({ to: "/access-denied" });
    const me = await context.queryClient.fetchQuery(meQuery).catch(() => null);
    if (me) throw redirect({ to: "/today" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { error } = Route.useSearch();
  const [redirecting, setRedirecting] = useState(false);

  async function signIn() {
    setRedirecting(true);
    const result = await signInWithGitHub().catch(() => null);
    if (!result || result.error) setRedirecting(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <AppMark className="size-20" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{es.app.name}</h1>
        <p className="text-muted-foreground">{es.app.tagline}</p>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {es.login.error}
        </p>
      )}
      <Button size="lg" className="w-full" onClick={signIn} disabled={redirecting}>
        <LogIn aria-hidden />
        {redirecting ? es.login.redirecting : es.login.signIn}
      </Button>
    </main>
  );
}
