import { runLessonEnrichment } from "../llm/lesson-enrichment";
import { finishDraft, type LlmJobDeps } from "../llm/run";
import { type Boss, ensureQueue, QUEUES } from "./boss";

async function guarded(deps: LlmJobDeps, draftId: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    deps.logger.error({ err: error, draftId }, "llm job failed");
    await finishDraft(deps.db, draftId, { status: "failed", error: "internal" });
  }
}

export async function registerLlmJobs(boss: Boss, deps: LlmJobDeps) {
  await ensureQueue(boss, QUEUES.lessonEnrich);
  await boss.work<{ draftId: string }>(
    QUEUES.lessonEnrich,
    { pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (job)
        await guarded(deps, job.data.draftId, () => runLessonEnrichment(deps, job.data.draftId));
    },
  );
}
