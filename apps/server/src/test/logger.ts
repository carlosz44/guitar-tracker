import { Writable } from "node:stream";
import { createLogger, type Service } from "../logger";

export function captureLogger(service: Service = "api") {
  const lines: Record<string, unknown>[] = [];
  const raw: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      const text = chunk.toString();
      raw.push(text);
      lines.push(JSON.parse(text));
      done();
    },
  });
  const logger = createLogger({ service, level: "trace" }, stream);
  return { logger, lines, text: () => raw.join("") };
}

export const silentLogger = createLogger({ service: "api", level: "silent" });
