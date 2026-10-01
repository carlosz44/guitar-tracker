export const validEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  PORT: "3000",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgres://guitartracker:fake-db-password@localhost:5433/guitartracker",
  BETTER_AUTH_SECRET: "fake-better-auth-secret-0123456789abcdef",
  GITHUB_CLIENT_ID: "fake-client-id",
  GITHUB_CLIENT_SECRET: "fake-github-client-secret",
  ALLOWED_GITHUB_IDS: "1001, 1002",
  R2_ACCOUNT_ID: "fake-account",
  R2_ACCESS_KEY_ID: "fake-access-key",
  R2_SECRET_ACCESS_KEY: "fake-r2-secret-access-key",
  R2_BUCKET: "guitar-tracker",
  DEFAULT_TIMEZONE: "America/Lima",
} satisfies Record<string, string>;

export const SECRET_VALUES = [
  "fake-db-password",
  validEnv.BETTER_AUTH_SECRET,
  validEnv.GITHUB_CLIENT_SECRET,
  validEnv.R2_SECRET_ACCESS_KEY,
];
