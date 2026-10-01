import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  FileImage,
  FileMusic,
  FileText,
  type LucideIcon,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { es } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { FileDropzone } from "./file-dropzone";
import { useUploads } from "./use-uploads";

export interface LessonFile {
  id: string;
  kind: string;
  originalName: string;
  sizeBytes: number;
  uploadStatus: string;
  extractionStatus: string;
  extractionError: string | null;
  duplicateOf: string | null;
}

const ICONS: Record<string, LucideIcon> = { guitar_pro: FileMusic, image: FileImage };

export function LessonFiles({ lessonId, files }: { lessonId: string; files: LessonFile[] }) {
  const { uploads, rejected, add, dismiss } = useUploads(lessonId);
  const visible = files.filter((file) => file.uploadStatus === "uploaded");

  return (
    <div className="flex flex-col gap-3">
      {visible.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visible.map((file) => (
            <FileRow key={file.id} lessonId={lessonId} file={file} />
          ))}
        </ul>
      )}
      {uploads.length > 0 && (
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
                    onClick={() => dismiss(upload.key)}
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
      )}
      {rejected.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {rejected.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <FileDropzone onFiles={add} />
    </div>
  );
}

function FileRow({ lessonId, file }: { lessonId: string; file: LessonFile }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lessons"] });
  const retry = useMutation({
    mutationFn: async () =>
      ensureOk(await api.files[":id"].retry.$post({ param: { id: file.id } })),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, es.common.genericError)),
  });
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.files[":id"].$delete({ param: { id: file.id } })),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, es.common.genericError)),
  });
  const Icon = ICONS[file.kind] ?? FileText;
  const body = (
    <>
      <Icon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{file.originalName}</span>
        <span className="text-sm text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
      </span>
      <StatusBadge file={file} />
    </>
  );
  const rowClass = "flex min-h-16 flex-1 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted";

  return (
    <li className="flex flex-col gap-2 rounded-xl border p-1">
      <div className="flex items-center gap-1">
        {file.kind === "pdf" ? (
          <a
            href={`/api/files/${file.id}/open`}
            target="_blank"
            rel="noopener"
            className={rowClass}
          >
            {body}
          </a>
        ) : (
          <Link
            to="/lessons/$lessonId/files/$fileId"
            params={{ lessonId, fileId: file.id }}
            className={rowClass}
          >
            {body}
          </Link>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={es.files.delete(file.originalName)}>
              <Trash2 aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{es.files.deleteTitle}</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{es.lessonPage.cancel}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                {es.files.deleteConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {file.extractionStatus === "failed" && (
        <div className="flex flex-wrap items-center gap-3 px-3 pb-2">
          <p className="text-sm text-destructive">{es.files.failedLong}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            <RotateCcw aria-hidden />
            {es.files.retry}
          </Button>
        </div>
      )}
      {file.duplicateOf && (
        <p className="flex items-center gap-2 px-3 pb-2 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden className="size-4" />
          {es.files.duplicate(file.duplicateOf)}
        </p>
      )}
    </li>
  );
}

function StatusBadge({ file }: { file: LessonFile }) {
  if (file.extractionStatus === "pending")
    return <Badge variant="secondary">{es.files.processing}</Badge>;
  if (file.extractionStatus === "done") return <Badge variant="outline">{es.files.ready}</Badge>;
  if (file.extractionStatus === "failed")
    return <Badge variant="destructive">{es.files.failed}</Badge>;
  return null;
}
