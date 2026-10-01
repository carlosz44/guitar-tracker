import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { instant, timestamps } from "./columns";

export const user = pgTable("user", {
  id: uuid().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  githubId: text().notNull().unique(),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: uuid().primaryKey(),
    expiresAt: instant().notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index().on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: instant(),
    refreshTokenExpiresAt: instant(),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (table) => [index().on(table.userId), uniqueIndex().on(table.providerId, table.accountId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: instant().notNull(),
    ...timestamps,
  },
  (table) => [index().on(table.identifier)],
);
