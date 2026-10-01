import { PgBoss, type Queue } from "pg-boss";

export const QUEUES = {
  heartbeat: "system.heartbeat",
  backup: "system.backup",
  fileExtract: "file.extract",
  fileCleanup: "file.cleanup-stale",
  sessionClose: "session.close-stale",
  lessonEnrich: "llm.lesson-enrich",
  topicImprove: "llm.topic-improve",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const QUEUE_OPTIONS: Record<QueueName, Omit<Queue, "name">> = {
  [QUEUES.heartbeat]: { retryLimit: 0, expireInSeconds: 60, deleteAfterSeconds: 60 * 60 },
  [QUEUES.backup]: { retryLimit: 3, retryBackoff: true, retryDelay: 60, expireInSeconds: 30 * 60 },
  [QUEUES.fileExtract]: {
    retryLimit: 2,
    retryBackoff: true,
    retryDelay: 10,
    expireInSeconds: 5 * 60,
  },
  [QUEUES.fileCleanup]: {
    retryLimit: 0,
    expireInSeconds: 10 * 60,
    deleteAfterSeconds: 24 * 60 * 60,
  },
  [QUEUES.sessionClose]: {
    retryLimit: 0,
    expireInSeconds: 5 * 60,
    deleteAfterSeconds: 24 * 60 * 60,
  },
  [QUEUES.lessonEnrich]: { retryLimit: 0, expireInSeconds: 10 * 60 },
  [QUEUES.topicImprove]: { retryLimit: 0, expireInSeconds: 5 * 60 },
};

export function createBoss(connectionString: string, role: "worker" | "api" = "worker") {
  return new PgBoss({
    connectionString,
    schema: "pgboss",
    application_name: `guitar-tracker-${role}`,
    ...(role === "api" ? { max: 2, supervise: false, schedule: false } : { max: 3 }),
  });
}

export async function ensureQueue(boss: PgBoss, name: QueueName) {
  await boss.createQueue(name, QUEUE_OPTIONS[name]);
}

export type Boss = PgBoss;

export interface JobData {
  [QUEUES.fileExtract]: { fileId: string };
  [QUEUES.lessonEnrich]: { draftId: string };
  [QUEUES.topicImprove]: { draftId: string };
}

export interface JobQueue {
  send<N extends keyof JobData>(name: N, data: JobData[N]): Promise<void>;
}

export function bossQueue(boss: PgBoss): JobQueue {
  return {
    async send(name, data) {
      await boss.send(name, data);
    },
  };
}
