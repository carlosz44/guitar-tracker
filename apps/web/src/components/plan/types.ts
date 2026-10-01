import type { planQuery } from "@/lib/queries";

type Current = Awaited<ReturnType<NonNullable<ReturnType<typeof planQuery>["queryFn"]>>>;
export type Plan = NonNullable<Current["plan"]>;
export type PlanDay = Plan["days"][number];
export interface PlanItemInput {
  topicId: string | null;
  label: string | null;
  minutes: number;
}
