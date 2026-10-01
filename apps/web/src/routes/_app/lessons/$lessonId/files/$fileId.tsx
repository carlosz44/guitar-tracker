import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/lessons/$lessonId/files/$fileId")({
  component: () => null,
});
