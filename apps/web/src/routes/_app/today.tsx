import { createFileRoute } from "@tanstack/react-router";
import { Guitar } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { es } from "@/i18n/es";

export const Route = createFileRoute("/_app/today")({ component: TodayPage });

function TodayPage() {
  return (
    <>
      <PageHeader title={es.today.title} />
      <EmptyState icon={Guitar} message={es.today.empty} />
    </>
  );
}
