import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { es } from "@/i18n/es";
import type { Upload } from "./use-uploads";

export function UploadList({
  uploads,
  onDismiss,
}: {
  uploads: Upload[];
  onDismiss: (key: string) => void;
}) {
  if (uploads.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {uploads.map((upload) => (
        <li key={upload.key} className="flex flex-col gap-2 rounded-xl border px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex-1 truncate font-medium">{upload.name}</span>
            {upload.error ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={es.common.close}
                onClick={() => onDismiss(upload.key)}
              >
                <X aria-hidden />
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">{es.files.uploading}</span>
            )}
          </div>
          {upload.error ? (
            <p role="alert" className="text-sm text-destructive">
              {upload.error}
            </p>
          ) : (
            <Progress value={upload.progress} aria-label={upload.name} />
          )}
        </li>
      ))}
    </ul>
  );
}
