import type { JobData, JobQueue } from "../jobs/boss";

export function memoryQueue() {
  const sent: { name: keyof JobData; data: JobData[keyof JobData] }[] = [];
  const queue: JobQueue = {
    async send(name, data) {
      sent.push({ name, data });
    },
  };
  return { queue, sent };
}
