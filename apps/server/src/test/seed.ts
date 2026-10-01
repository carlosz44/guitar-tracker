import { uuidv7 } from "uuidv7";
import type { Database } from "../db/client";
import {
  lessonFiles,
  lessons,
  lessonTopics,
  practiceDays,
  practiceSessions,
  sessionBlocks,
  teacherQuestions,
  topics,
} from "../db/schema";

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

export interface SeedBlock {
  topicId?: string | null;
  label?: string | null;
  plannedSeconds?: number;
  actualSeconds?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  cleanBpm?: number | null;
  rating?: number | null;
}

export async function seedSession(
  db: Database,
  userId: string,
  values: Partial<typeof practiceSessions.$inferInsert> & {
    blocks?: SeedBlock[];
    targetMinutes?: number;
  } = {},
) {
  const { blocks = [], targetMinutes, ...session } = values;
  const startedAt = session.startedAt ?? new Date("2026-10-01T16:00:00Z");
  const [row] = await db
    .insert(practiceSessions)
    .values({
      id: uuidv7(),
      userId,
      startedAt,
      lastActivityAt: startedAt,
      practiceDate: "2026-10-01",
      status: "completed",
      ...session,
    })
    .returning();
  if (!row) throw new Error("seed session failed");
  if (targetMinutes !== undefined) {
    await db
      .insert(practiceDays)
      .values({ userId, date: row.practiceDate, targetMinutes })
      .onConflictDoNothing();
  }
  const blockRows = [];
  for (const [position, block] of blocks.entries()) {
    const [created] = await db
      .insert(sessionBlocks)
      .values({
        id: uuidv7(),
        userId,
        sessionId: row.id,
        position,
        topicId: block.topicId ?? null,
        label: block.label ?? (block.topicId ? null : "Calentamiento"),
        plannedSeconds: block.plannedSeconds ?? 600,
        actualSeconds: block.actualSeconds === undefined ? 600 : block.actualSeconds,
        startedAt: block.startedAt === undefined ? startedAt : block.startedAt,
        endedAt:
          block.endedAt === undefined ? new Date(startedAt.getTime() + 600_000) : block.endedAt,
        cleanBpm: block.cleanBpm ?? null,
        rating: block.rating ?? null,
      })
      .returning();
    blockRows.push(created);
  }
  return { session: row, blocks: blockRows };
}
