import { createFileRoute } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { es } from "@/i18n/es";

export const Route = createFileRoute("/_app/topics")({ component: TopicsPage });

function TopicsPage() {
  return (
    <>
      <PageHeader title={es.topics.title} />
      <EmptyState icon={Layers} message={es.topics.placeholder} />
    </>
  );
}
