import { createRootRouteWithContext, Outlet, useRouter } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { UpdatePrompt } from "@/components/update-prompt";
import { es } from "@/i18n/es";
import type { RouterContext } from "@/router";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  errorComponent: RootError,
});

function Root() {
  return (
    <>
      <Outlet />
      <Toaster theme="system" position="top-center" richColors />
      <UpdatePrompt />
    </>
  );
}

function RootError() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert">{es.common.genericError}</p>
      <Button onClick={() => router.invalidate()}>{es.common.retry}</Button>
    </main>
  );
}
