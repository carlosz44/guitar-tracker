import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { formatBytes } from "@/lib/format";

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

export function LessonFiles({ lessonId, files }: { lessonId: string; files: LessonFile[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => (
        <li key={file.id}>
          <Link
            to="/lessons/$lessonId/files/$fileId"
            params={{ lessonId, fileId: file.id }}
            className="flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 hover:bg-muted"
          >
            <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate font-medium">{file.originalName}</span>
            <span className="text-sm text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
