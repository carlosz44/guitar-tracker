import { parentPort } from "node:worker_threads";

parentPort?.once("message", () => {
  const hoard: number[][] = [];
  for (;;) hoard.push(new Array(1_000_000).fill(1));
});
