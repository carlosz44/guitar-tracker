import { timestamp } from "drizzle-orm/pg-core";

export const instant = () => timestamp({ withTimezone: true, mode: "date" });

export const timestamps = {
  createdAt: instant().notNull().defaultNow(),
  updatedAt: instant()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
