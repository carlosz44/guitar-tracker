import { FILE_WAIT_SECONDS, runLessonEnrichment } from "../llm/lesson-enrichment";
import { finishDraft, type LlmJobDeps } from "../llm/run";
import { runTopicImprove } from "../llm/topic-improve";
import { type Boss, ensureQueue, QUEUES } from "./boss";

async function guarded(deps: LlmJobDeps, draftId: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    deps.logger.error({ err: error, draftId }, "llm job failed");
    await finishDraft(deps.db, draftId, { status: "failed", error: "internal" });
  }
}

export async function registerLlmJobs(boss: Boss, baseDeps: LlmJobDeps) {
  const deps: LlmJobDeps = {
    ...baseDeps,
    requeue: async (draftId, waits) => {
      await boss.send(QUEUES.lessonEnrich, { draftId, waits }, { startAfter: FILE_WAIT_SECONDS });
    },
  };
  await ensureQueue(boss, QUEUES.lessonEnrich);
  await ensureQueue(boss, QUEUES.topicImprove);
  await boss.work<{ draftId: string }>(
    QUEUES.lessonEnrich,
    { pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (job)
        await guarded(deps, job.data.draftId, () => runLessonEnrichment(deps, job.data.draftId));
    },
  );
  await boss.work<{ draftId: string }>(
    QUEUES.topicImprove,
    { pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (job) await guarded(deps, job.data.draftId, () => runTopicImprove(deps, job.data.draftId));
    },
  );
}
