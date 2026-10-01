import type { draftQuery } from "@/lib/queries";

export type Draft = Awaited<ReturnType<NonNullable<ReturnType<typeof draftQuery>["queryFn"]>>>;
export type DraftRef = { id: string; status: Draft["status"] } | null;
