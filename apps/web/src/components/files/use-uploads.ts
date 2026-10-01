import { validateUpload } from "@ds/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { es, validationMessage } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { putWithProgress } from "@/lib/upload";

export interface Upload {
  key: string;
  name: string;
  progress: number;
  error: string | null;
}

let counter = 0;

export function useUploads(defaultLessonId?: string) {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);

  const patch = useCallback(
    (key: string, change: Partial<Upload>) =>
      setUploads((current) =>
        current.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)),
      ),
    [],
  );

  const uploadOne = useCallback(
    async (file: File, key: string, lessonId: string) => {
      try {
        const created = await (
          await ensureOk(
            await api.lessons[":id"].files.$post({
              param: { id: lessonId },
              json: { name: file.name, mime: file.type, size: file.size },
            }),
          )
        ).json();
        await queryClient.invalidateQueries({ queryKey: ["lessons", lessonId] });
        await putWithProgress(created.uploadUrl, file, created.contentType, (progress) =>
          patch(key, { progress }),
        );
        await ensureOk(await api.files[":id"].confirm.$post({ param: { id: created.fileId } }));
        setUploads((current) => current.filter((upload) => upload.key !== key));
        await queryClient.invalidateQueries({ queryKey: ["lessons"] });
        return true;
      } catch (error) {
        patch(key, { error: errorMessage(error, es.files.uploadFailed) });
        return false;
      }
    },
    [patch, queryClient],
  );

  const add = useCallback(
    (files: File[], lessonId = defaultLessonId) => {
      if (!lessonId) throw new Error("useUploads: no lesson to upload to");
      const accepted: { file: File; key: string }[] = [];
      const reasons: string[] = [];
      for (const file of files) {
        const check = validateUpload({ name: file.name, size: file.size });
        if (check.ok) accepted.push({ file, key: `upload-${++counter}` });
        else reasons.push(es.files.rejected(file.name, validationMessage(check.error)));
      }
      setRejected(reasons);
      setUploads((current) => [
        ...current,
        ...accepted.map(({ file, key }) => ({ key, name: file.name, progress: 0, error: null })),
      ]);
      return Promise.all(accepted.map(({ file, key }) => uploadOne(file, key, lessonId)));
    },
    [uploadOne, defaultLessonId],
  );

  const dismiss = useCallback(
    (key: string) => setUploads((current) => current.filter((upload) => upload.key !== key)),
    [],
  );

  return { uploads, rejected, add, dismiss };
}
