import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { es } from "@/i18n/es";

export function ListEditor({
  value,
  onChange,
  id,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
}) {
  const update = (index: number, text: string) =>
    onChange(value.map((item, i) => (i === index ? text : item)));

  return (
    <div className="flex flex-col gap-2" id={id}>
      {value.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: items are plain strings edited in place.
        <div key={index} className="flex gap-2">
          <Input
            value={item}
            aria-label={es.list.item(index + 1)}
            onChange={(event) => update(index, event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={es.list.remove(index + 1)}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...value, ""])}
      >
        <Plus aria-hidden />
        {es.list.add}
      </Button>
    </div>
  );
}
