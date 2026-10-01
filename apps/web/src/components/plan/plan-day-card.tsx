import { Check, Minus, Plus, RefreshCw, X } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { formatPlanDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlanDay, PlanItemInput } from "./types";

export function PlanDayCard({
  day,
  editable,
  showProgress,
  moveTargets,
  topics,
  onChange,
  onMove,
  onRegenerate,
  busy,
}: {
  day: PlanDay;
  editable: boolean;
  showProgress: boolean;
  moveTargets: PlanDay[];
  topics: { id: string; title: string; defaultBlockMinutes: number }[];
  onChange: (items: PlanItemInput[]) => void;
  onMove: (index: number, toDate: string) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const label = formatPlanDay(day.date);
  const total = day.items.reduce((sum, item) => sum + item.minutes, 0);
  const inputs = (): PlanItemInput[] =>
    day.items.map(({ topicId, label: itemLabel, minutes }) => ({
      topicId,
      label: itemLabel,
      minutes,
    }));
  const setMinutes = (index: number, delta: number) =>
    onChange(
      inputs().map((item, i) =>
        i === index ? { ...item, minutes: Math.min(240, Math.max(5, item.minutes + delta)) } : item,
      ),
    );
  const planned = new Set(day.items.flatMap((item) => (item.topicId ? [item.topicId] : [])));
  const addable = topics.filter((topic) => !planned.has(topic.id));
  const topicCount = planned.size;

  return (
    <section
      aria-label={es.plan.dayLabel(label)}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        day.today && "border-brand",
        day.past && "opacity-80",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold first-letter:uppercase">{label}</h2>
        <div className="flex items-center gap-2">
          {day.today && <Badge>{es.plan.today}</Badge>}
          <span
            data-testid="day-total"
            className={cn(
              "text-sm tabular-nums",
              total !== day.targetMinutes && topicCount > 0
                ? "font-medium text-destructive"
                : "text-muted-foreground",
            )}
          >
            {es.plan.total(total, day.targetMinutes)}
          </span>
        </div>
      </header>
      {showProgress && (
        <p className="text-sm text-muted-foreground" data-testid="day-progress">
          {es.plan.practicedTotal(day.minutesPracticed, day.targetMinutes)}
        </p>
      )}
      {day.focusNote && <p className="text-sm">{day.focusNote}</p>}
      <ul className="flex flex-col gap-2">
        {day.items.map((item, index) => (
          <li key={item.id} className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                {item.practiced && (
                  <Check aria-label={es.plan.practiced} className="size-4 shrink-0 text-brand" />
                )}
                <span className="truncate">{item.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={es.plan.less(item.title)}
                    disabled={busy || item.minutes <= 5}
                    onClick={() => setMinutes(index, -5)}
                  >
                    <Minus aria-hidden />
                  </Button>
                )}
                <span className="w-14 text-center text-sm tabular-nums">
                  {es.plan.minutes(item.minutes)}
                </span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={es.plan.more(item.title)}
                    disabled={busy}
                    onClick={() => setMinutes(index, 5)}
                  >
                    <Plus aria-hidden />
                  </Button>
                )}
              </span>
            </div>
            {editable && item.topicId && (
              <div className="flex items-center gap-2">
                <NativeSelect
                  aria-label={es.plan.moveTo(item.title)}
                  className="flex-1"
                  value=""
                  disabled={busy}
                  onChange={(event) => event.target.value && onMove(index, event.target.value)}
                >
                  <option value="">{es.plan.moveOption}</option>
                  {moveTargets.map((target) => (
                    <option key={target.date} value={target.date}>
                      {formatPlanDay(target.date)}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={es.plan.remove(item.title)}
                  disabled={busy}
                  onClick={() => onChange(inputs().filter((_, i) => i !== index))}
                >
                  <X aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-col gap-2">
          {topicCount < 3 && addable.length > 0 && (
            <NativeSelect
              aria-label={es.plan.addTopic(label)}
              value=""
              disabled={busy}
              onChange={(event) => {
                const topic = addable.find((candidate) => candidate.id === event.target.value);
                if (!topic) return;
                const minutes = Math.max(5, Math.round(topic.defaultBlockMinutes / 5) * 5);
                onChange([...inputs(), { topicId: topic.id, label: null, minutes }]);
              }}
            >
              <option value="">{es.plan.addOption}</option>
              {addable.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </NativeSelect>
          )}
          <Button variant="outline" className="self-start" onClick={onRegenerate} disabled={busy}>
            <RefreshCw aria-hidden />
            {es.plan.regenerateDay}
          </Button>
        </div>
      )}
    </section>
  );
}
