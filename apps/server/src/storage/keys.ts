const BACKUP_PREFIX = "db-backups/";
const BACKUP_KEY = /^db-backups\/guitartracker-(\d{4}-\d{2}-\d{2})\.dump$/;

export const backupPrefix = BACKUP_PREFIX;

export function backupKey(date: string) {
  return `${BACKUP_PREFIX}guitartracker-${date}.dump`;
}

export function backupKeyDate(key: string): string | null {
  return BACKUP_KEY.exec(key)?.[1] ?? null;
}

export function lessonFileKey(lessonId: string, fileId: string, originalName: string) {
  return `lesson-files/${lessonId}/${fileId}-${safeFileName(originalName)}`;
}

const MAX_NAME_LENGTH = 100;

const EXTENSION = /\.([A-Za-z0-9]{1,10})$/;

function toAsciiSlug(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function safeFileName(name: string) {
  const match = EXTENSION.exec(name.trim());
  const extension = match ? `.${match[1]?.toLowerCase()}` : "";
  const stem = toAsciiSlug(match ? name.trim().slice(0, match.index) : name) || "file";
  return stem.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}
