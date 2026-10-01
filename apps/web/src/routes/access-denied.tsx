import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";

export const Route = createFileRoute("/access-denied")({
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <ShieldX aria-hidden className="size-12 text-destructive" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{es.accessDenied.title}</h1>
        <p className="text-muted-foreground">{es.accessDenied.body}</p>
      </div>
      <Button asChild variant="outline" className="w-full">
        <Link to="/login">{es.accessDenied.back}</Link>
      </Button>
    </main>
  );
}
