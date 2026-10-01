import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { es } from "@/i18n/es";

export const Route = createFileRoute("/_app/history")({ component: HistoryPage });

function HistoryPage() {
  return (
    <>
      <PageHeader title={es.history.title} />
      <EmptyState icon={History} message={es.history.placeholder} />
    </>
  );
}
