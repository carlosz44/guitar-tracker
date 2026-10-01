import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";

export const Route = createFileRoute("/_app/$")({ component: NotFoundPage });

function NotFoundPage() {
  return (
    <>
      <PageHeader title={es.notFound.title} />
      <EmptyState icon={SearchX} message={es.notFound.body} />
      <Button asChild variant="outline" className="mt-6">
        <Link to="/today">{es.notFound.back}</Link>
      </Button>
    </>
  );
}
