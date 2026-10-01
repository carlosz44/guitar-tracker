import { uuidv7 } from "uuidv7";
import type { Database } from "../db/client";
import { lessonFiles, lessons, lessonTopics, teacherQuestions, topics } from "../db/schema";

export async function seedLesson(
  db: Database,
  userId: string,
  values: Partial<typeof lessons.$inferInsert> = {},
) {
  const [row] = await db
    .insert(lessons)
    .values({ id: uuidv7(), userId, date: "2026-10-01", title: "Dórico", ...values })
    .returning();
  if (!row) throw new Error("seed lesson failed");
  return row;
}

export async function seedTopic(
  db: Database,
  userId: string,
  values: Partial<typeof topics.$inferInsert> = {},
) {
  const [row] = await db
    .insert(topics)
    .values({ id: uuidv7(), userId, title: "Modo dórico", category: "scales_modes", ...values })
    .returning();
  if (!row) throw new Error("seed topic failed");
  return row;
}

export async function seedFile(
  db: Database,
  userId: string,
  lessonId: string,
  values: Partial<typeof lessonFiles.$inferInsert> = {},
) {
  const id = uuidv7();
  const [row] = await db
    .insert(lessonFiles)
    .values({
      id,
      userId,
      lessonId,
      kind: "pdf",
      originalName: "ejercicios.pdf",
      mime: "application/pdf",
      sizeBytes: 3,
      r2Key: `lesson-files/${lessonId}/${id}-ejercicios.pdf`,
      uploadStatus: "uploaded",
      extractionStatus: "not_applicable",
      ...values,
    })
    .returning();
  if (!row) throw new Error("seed file failed");
  return row;
}

export async function linkTopic(
  db: Database,
  userId: string,
  lessonId: string,
  topicId: string,
  relation: "introduced" | "extended" | "reviewed" = "introduced",
) {
  await db.insert(lessonTopics).values({ userId, lessonId, topicId, relation });
}

export async function seedQuestion(
  db: Database,
  userId: string,
  values: Partial<typeof teacherQuestions.$inferInsert> = {},
) {
  const [row] = await db
    .insert(teacherQuestions)
    .values({ id: uuidv7(), userId, text: "¿Qué digitación uso?", ...values })
    .returning();
  if (!row) throw new Error("seed question failed");
  return row;
}
