import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <Icon aria-hidden className="size-10 text-brand" />
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  );
}
