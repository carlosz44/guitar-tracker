import { type DestinationStream, type Logger, type LoggerOptions, pino } from "pino";

export type { Logger };

export type Service = "api" | "worker" | "migrate";

export const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.password",
  "*.secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.DATABASE_URL",
  "*.connectionString",
];

export function createLogger(
  options: { service: Service; level: LoggerOptions["level"] },
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level: options.level,
      base: { service: options.service },
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
