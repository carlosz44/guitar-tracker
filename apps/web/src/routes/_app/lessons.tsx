import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { es } from "@/i18n/es";

export const Route = createFileRoute("/_app/lessons")({ component: LessonsPage });

function LessonsPage() {
  return (
    <>
      <PageHeader title={es.lessons.title} />
      <EmptyState icon={BookOpen} message={es.lessons.placeholder} />
    </>
  );
}
