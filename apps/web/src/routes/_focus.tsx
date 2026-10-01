import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meQuery, UnauthorizedError } from "@/lib/api";

export const Route = createFileRoute("/_focus")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw redirect({ to: "/login" });
      throw error;
    }
  },
  component: Outlet,
});
