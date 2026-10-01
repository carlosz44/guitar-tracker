import { useSuspenseQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { meQuery } from "@/lib/api";

export function StartDraftButton({
  label,
  onStart,
  pending,
}: {
  label: string;
  onStart: () => void;
  pending: boolean;
}) {
  const { data: me } = useSuspenseQuery(meQuery);
  if (!me.llm.enabled) return null;
  return (
    <Button variant="outline" onClick={onStart} disabled={pending}>
      <Sparkles aria-hidden />
      {label}
    </Button>
  );
}
