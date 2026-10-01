import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { es } from "@/i18n/es";
import { fileQuery } from "@/lib/queries";

const GuitarProViewer = lazy(() =>
  import("@/components/files/guitar-pro-viewer").then((module) => ({
    default: module.GuitarProViewer,
  })),
);

export const Route = createFileRoute("/_app/lessons/$lessonId/files/$fileId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(fileQuery(params.fileId)),
  component: FileViewerPage,
});

function FileViewerPage() {
  const { lessonId, fileId } = Route.useParams();
  const { data } = useSuspenseQuery(fileQuery(fileId));
  const { file } = data;
  const openUrl = `/api/files/${fileId}/open`;
  const downloadUrl = `${openUrl}?disposition=attachment`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/lessons/$lessonId" params={{ lessonId }} aria-label={es.viewer.back}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 truncate text-xl font-semibold">{file.originalName}</h1>
        <Button asChild variant="outline">
          <a href={downloadUrl}>
            <Download aria-hidden />
            {es.files.download}
          </a>
        </Button>
      </div>

      {file.extractionStatus === "failed" && (
        <p role="alert" className="text-destructive">
          {es.files.failedLong}
        </p>
      )}

      {file.kind === "guitar_pro" && (
        <Suspense fallback={<p className="text-muted-foreground">{es.viewer.loading}</p>}>
          <GuitarProViewer fileId={fileId} />
        </Suspense>
      )}

      {file.kind === "docx" &&
        (file.extractedText ? (
          <div
            className="whitespace-pre-wrap rounded-xl border p-4 leading-relaxed"
            data-testid="docx-text"
          >
            {file.extractedText}
          </div>
        ) : (
          file.extractionStatus !== "failed" && (
            <p className="text-muted-foreground">{es.viewer.noText}</p>
          )
        ))}

      {file.kind === "image" && (
        <ImageView src={openUrl} alt={file.originalName} downloadUrl={downloadUrl} />
      )}

      {file.kind === "pdf" && (
        <Button asChild className="self-start">
          <a href={openUrl} target="_blank" rel="noopener">
            {es.files.open}
          </a>
        </Button>
      )}
    </div>
  );
}

function ImageView({ src, alt, downloadUrl }: { src: string; alt: string; downloadUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground">{es.viewer.noImagePreview}</p>
        <Button asChild variant="outline" className="self-start">
          <a href={downloadUrl}>{es.files.download}</a>
        </Button>
      </div>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener">
      <img
        src={src}
        alt={alt}
        className="w-full rounded-xl border"
        onError={() => setFailed(true)}
      />
    </a>
  );
}
