import { Upload as UploadIcon } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { cn } from "@/lib/utils";

export function FileDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    onFiles([...event.dataTransfer.files]);
  };

  return (
    <section
      aria-label={es.files.dropzone}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center",
        dragging && "border-brand bg-muted",
      )}
    >
      <UploadIcon aria-hidden className="hidden size-8 text-muted-foreground lg:block" />
      <p className="hidden font-medium lg:block">{es.files.dropzone}</p>
      <Button type="button" variant="outline" onClick={() => input.current?.click()}>
        {es.files.choose}
      </Button>
      <p className="text-sm text-muted-foreground">{es.files.accepted}</p>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="file-input"
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
    </section>
  );
}
