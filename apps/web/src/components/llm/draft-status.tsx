import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { es, validationMessage } from "@/i18n/es";
import type { Draft } from "./types";

export function DraftWaiting({ message }: { message: string }) {
  return (
    <section
      className="flex items-start gap-3 rounded-xl border border-brand/50 p-4"
      aria-live="polite"
      data-testid="draft-waiting"
    >
      <Loader2 aria-hidden className="mt-0.5 size-5 animate-spin text-brand" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{message}</p>
        <p className="text-sm text-muted-foreground">{es.llm.waitHint}</p>
      </div>
    </section>
  );
}

const KNOWN = new Set(["llm.budget", "llm.disabled"]);

export function DraftFailed({
  draft,
  onRetry,
  onDiscard,
  pending,
}: {
  draft: Draft;
  onRetry: () => void;
  onDiscard: () => void;
  pending: boolean;
}) {
  const message =
    draft.error && KNOWN.has(draft.error) ? validationMessage(draft.error) : es.llm.failed;
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-destructive/50 p-4"
      role="alert"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertCircle aria-hidden className="size-5 text-destructive" />
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRetry} disabled={pending}>
          {es.llm.retry}
        </Button>
        <Button variant="outline" onClick={onDiscard} disabled={pending}>
          {es.llm.discardDraft}
        </Button>
      </div>
    </section>
  );
}

export function SkippedFiles({ draft }: { draft: Draft }) {
  if (draft.skippedFiles.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
      {draft.skippedFiles.map((file) => (
        <li key={file.fileId}>{es.llm.skipped(file.name, es.llm.skipReasons[file.reason])}</li>
      ))}
    </ul>
  );
}
