import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { es } from "@/i18n/es";
import { meQuery, UnauthorizedError } from "@/lib/api";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw redirect({ to: "/login" });
      throw error;
    }
  },
  pendingComponent: () => <p className="p-6 text-muted-foreground">{es.common.loading}</p>,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
