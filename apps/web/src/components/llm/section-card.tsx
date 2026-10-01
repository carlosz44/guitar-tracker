import type { SectionState } from "@ds/shared";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";

export function SectionCard({
  title,
  state,
  current,
  children,
  onAccept,
  onDiscard,
  busy,
}: {
  title: string;
  state: SectionState;
  current?: ReactNode;
  children: ReactNode;
  onAccept: () => void;
  onDiscard: () => void;
  busy: boolean;
}) {
  if (state !== "pending") {
    return (
      <section
        aria-label={title}
        className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
      >
        <h3 className="font-medium">{title}</h3>
        <Badge variant={state === "accepted" ? "default" : "secondary"}>
          {state === "accepted" ? es.review.accepted : es.review.discarded}
        </Badge>
      </section>
    );
  }
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="font-medium">{title}</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {current !== undefined && (
          <div className="hidden flex-col gap-2 lg:flex">
            <p className="text-sm text-muted-foreground">{es.review.current}</p>
            <div className="text-muted-foreground">{current}</div>
          </div>
        )}
        <div
          className={
            current === undefined ? "flex flex-col gap-2 lg:col-span-2" : "flex flex-col gap-2"
          }
        >
          {current !== undefined && (
            <p className="hidden text-sm text-muted-foreground lg:block">{es.review.proposal}</p>
          )}
          {children}
        </div>
        {current !== undefined && (
          <details className="lg:hidden">
            <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
              {es.review.showCurrent}
            </summary>
            <div className="pt-2 text-muted-foreground">{current}</div>
          </details>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={onAccept} disabled={busy}>
          <Check aria-hidden />
          {es.review.accept}
        </Button>
        <Button variant="outline" onClick={onDiscard} disabled={busy}>
          <X aria-hidden />
          {es.review.discard}
        </Button>
      </div>
    </section>
  );
}
