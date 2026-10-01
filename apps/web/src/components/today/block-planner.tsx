import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { es } from "@/i18n/es";
import { topicsQuery } from "@/lib/queries";

export interface DraftBlock {
  key: string;
  topicId: string | null;
  label: string | null;
  title: string;
  minutes: number;
}

let keys = 0;
export const draftKey = () => `draft-${++keys}`;

export function BlockPlanner({
  blocks,
  onChange,
}: {
  blocks: DraftBlock[];
  onChange: (blocks: DraftBlock[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const total = blocks.reduce((sum, block) => sum + block.minutes, 0);

  const update = (index: number, change: Partial<DraftBlock>) =>
    onChange(blocks.map((block, i) => (i === index ? { ...block, ...change } : block)));
  const move = (index: number, delta: number) => {
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(index + delta, 0, moved);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {blocks.map((block, index) => (
          <li
            key={block.key}
            className="flex flex-wrap items-center gap-x-2 rounded-xl border p-2 pl-4"
          >
            <span className="min-w-0 basis-full truncate pt-1 font-medium sm:basis-0 sm:flex-1 sm:pt-0">
              {block.title}
            </span>
            <div className="-ml-2 flex items-center gap-2 sm:ml-0">
              <Button
                variant="ghost"
                size="icon"
                aria-label={es.today.lessMinutes(block.title)}
                disabled={block.minutes <= 5}
                onClick={() => update(index, { minutes: block.minutes - 5 })}
              >
                <Minus aria-hidden />
              </Button>
              <span className="w-14 text-center tabular-nums">
                {es.today.minutes(block.minutes)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={es.today.moreMinutes(block.title)}
                disabled={block.minutes >= 240}
                onClick={() => update(index, { minutes: block.minutes + 5 })}
              >
                <Plus aria-hidden />
              </Button>
            </div>
            <div className="ml-auto flex items-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label={es.today.moveUp(block.title)}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={es.today.moveDown(block.title)}
                disabled={index === blocks.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={es.today.remove(block.title)}
                onClick={() => onChange(blocks.filter((_, i) => i !== index))}
              >
                <X aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {es.today.addBlock}
        </Button>
        <span className="font-medium tabular-nums" data-testid="plan-total">
          {es.today.total(total)}
        </span>
      </div>
      {adding && (
        <AddBlockDialog
          onClose={() => setAdding(false)}
          onAdd={(block) => {
            onChange([...blocks, block]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddBlockDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (block: DraftBlock) => void;
}) {
  const { data } = useQuery(topicsQuery());
  const topics = (data?.topics ?? []).filter((topic) => topic.status !== "archived");
  const [topicId, setTopicId] = useState("");
  const [label, setLabel] = useState("");
  const topic = topics.find((candidate) => candidate.id === topicId);
  const ready = topic || label.trim();

  const add = () => {
    if (topic) {
      const minutes = Math.max(5, Math.round(topic.defaultBlockMinutes / 5) * 5);
      onAdd({ key: draftKey(), topicId: topic.id, label: null, title: topic.title, minutes });
    } else if (label.trim()) {
      onAdd({
        key: draftKey(),
        topicId: null,
        label: label.trim(),
        title: label.trim(),
        minutes: 10,
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.today.addTitle}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="add-topic">{es.today.topic}</FieldLabel>
          <NativeSelect
            id="add-topic"
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
          >
            <option value="">{es.today.freeBlock}</option>
            {topics.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!topicId && (
          <Field>
            <FieldLabel htmlFor="add-label">{es.today.label}</FieldLabel>
            <Input
              id="add-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {es.today.cancel}
          </Button>
          <Button onClick={add} disabled={!ready}>
            {es.today.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
