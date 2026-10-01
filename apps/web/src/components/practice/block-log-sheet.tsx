import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { es } from "@/i18n/es";
import type { BlockLog, SessionBlock } from "@/lib/practice/types";
import { cn } from "@/lib/utils";

export function initialBpm(block: SessionBlock) {
  if (!block.topicId) return null;
  return block.lastCleanBpm ?? block.targetBpm ?? 60;
}

export function BlockLogSheet({
  block,
  onSave,
  onClose,
}: {
  block: SessionBlock;
  onSave: (log: BlockLog) => void;
  onClose: () => void;
}) {
  const [bpm, setBpm] = useState<number | null>(() => initialBpm(block));
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const step = (delta: number) =>
    setBpm((value) => Math.min(400, Math.max(20, (value ?? 60) + delta)));

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle className="text-xl">{block.title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm text-muted-foreground">{es.blockLog.bpm}</h3>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon-lg"
                aria-label={es.blockLog.less}
                onClick={() => step(-5)}
              >
                <Minus aria-hidden />
              </Button>
              <output
                className="w-24 text-center text-4xl font-semibold tabular-nums"
                data-testid="bpm-value"
              >
                {bpm ?? "—"}
              </output>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label={es.blockLog.more}
                onClick={() => step(5)}
              >
                <Plus aria-hidden />
              </Button>
              <Button
                variant="ghost"
                onClick={() => setBpm(bpm === null ? (initialBpm(block) ?? 60) : null)}
              >
                {bpm === null ? es.blockLog.addBpm : es.blockLog.noBpm}
              </Button>
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm text-muted-foreground">{es.blockLog.rating}</h3>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  aria-label={es.blockLog.rate(value)}
                  aria-pressed={rating === value}
                  className={cn(
                    "h-14 text-xl",
                    rating === value && "border-brand bg-brand text-brand-foreground",
                  )}
                  onClick={() => setRating(rating === value ? null : value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <label htmlFor="block-note" className="text-sm text-muted-foreground">
              {es.blockLog.note}
            </label>
            <Textarea
              id="block-note"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </section>
          <Button
            size="lg"
            className="h-14 text-lg"
            onClick={() => onSave({ cleanBpm: bpm, rating, notes })}
          >
            {es.blockLog.save}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
