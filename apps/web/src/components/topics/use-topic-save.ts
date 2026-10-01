import { useState } from "react";
import { es } from "@/i18n/es";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export function useTopicServerError() {
  const [serverError, setServerError] = useState<{
    field: "parentId" | null;
    message: string;
  } | null>(null);
  const report = (error: unknown) => {
    const onParent = error instanceof ApiError && error.body.issues?.[0]?.path[0] === "parentId";
    setServerError({
      field: onParent ? "parentId" : null,
      message: errorMessage(error, es.topicForm.saveError),
    });
  };
  return { serverError, report, clear: () => setServerError(null) };
}
