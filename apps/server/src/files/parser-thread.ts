import { parentPort } from "node:worker_threads";
import { parseFile } from "./parse/parse";
import type { ParseInput } from "./parse/types";

parentPort?.once("message", async (input: ParseInput) => {
  parentPort?.postMessage(await parseFile(input));
});
