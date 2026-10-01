import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { DraftWaiting } from "@/components/llm/draft-status";
import { PageHeader } from "@/components/page-header";
import { PlanDayCard } from "@/components/plan/plan-day-card";
import type { Plan, PlanDay, PlanItemInput } from "@/components/plan/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { es, validationMessage } from "@/i18n/es";
import { api, ensureOk } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDayRange } from "@/lib/format";
import { planQuery, topicsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/plan")({
  validateSearch: z.object({ cycle: z.iso.date().optional() }),
  component: PlanPage,
});

type PlanAction =
  | { kind: "accept" | "regenerate" | "replan" }
  | { kind: "day"; date: string }
  | { kind: "days"; days: { date: string; items: PlanItemInput[] }[] };

async function runAction(id: string, input: PlanAction) {
  const param = { id };
  switch (input.kind) {
    case "accept":
      return (await ensureOk(await api.plans[":id"].accept.$post({ param }))).json();
    case "regenerate":
      return (await ensureOk(await api.plans[":id"].regenerate.$post({ param }))).json();
    case "replan":
      return (await ensureOk(await api.plans[":id"].replan.$post({ param }))).json();
    case "day":
      return (
        await ensureOk(
          await api.plans[":id"].days[":date"].regenerate.$post({
            param: { id, date: input.date },
          }),
        )
      ).json();
    case "days":
      return (
        await ensureOk(await api.plans[":id"].days.$put({ param, json: { days: input.days } }))
      ).json();
  }
}

function PlanPage() {
  const { cycle } = Route.useSearch();
  const query = planQuery(cycle);
  const queryClient = useQueryClient();
  const { data } = useQuery(query);
  const { data: topicData } = useQuery(topicsQuery());
  const topics = (topicData?.topics ?? []).filter((topic) => topic.status !== "archived");

  const onPlan = (response: { plan: Plan }) => {
    queryClient.setQueryData(query.queryKey, (current) =>
      current ? { ...current, plan: response.plan } : current,
    );
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    void queryClient.invalidateQueries({ queryKey: ["lessons"] });
  };
  const onError = (error: unknown) => toast.error(errorMessage(error, es.common.genericError));

  const build = useMutation({
    mutationFn: async () =>
      (await ensureOk(await api.plans.$post({ json: cycle ? { cycleStart: cycle } : {} }))).json(),
    onSuccess: onPlan,
    onError,
  });
  const action = useMutation({
    mutationFn: async (input: PlanAction) => {
      const id = data?.plan?.id;
      if (!id) throw new Error("no plan");
      return runAction(id, input);
    },
    onSuccess: onPlan,
    onError,
  });

  if (!data) return <PageHeader title={es.plan.title} />;
  const { plan } = data;
  const range = formatDayRange(data.cycleStart, plan?.cycleEnd ?? data.cycleStart);

  if (!plan) {
    return (
      <>
        <PageHeader title={es.plan.title} />
        <p className="-mt-4 mb-6 text-muted-foreground">{es.plan.range(range)}</p>
        <EmptyState icon={CalendarRange} message={es.plan.empty} />
        <p className="mb-4 text-center text-sm text-muted-foreground">{es.plan.emptyHint}</p>
        <Button className="mx-auto flex" onClick={() => build.mutate()} disabled={build.isPending}>
          {build.isPending ? es.plan.building : es.plan.build}
        </Button>
      </>
    );
  }

  const locked = plan.llmStatus === "queued" || plan.llmStatus === "running";
  const busy = locked || action.isPending || build.isPending;
  const canEdit = (day: PlanDay) =>
    !plan.ended && plan.status !== "replaced" && !(plan.status === "active" && day.past);
  const putDays = (days: { date: string; items: PlanItemInput[] }[]) =>
    action.mutate({ kind: "days", days });
  const plainItems = (day: PlanDay): PlanItemInput[] =>
    day.items.map(({ topicId, label, minutes }) => ({ topicId, label, minutes }));
  const move = (from: PlanDay, index: number, toDate: string) => {
    const target = plan.days.find((day) => day.date === toDate);
    const item = plainItems(from)[index];
    if (!target || !item) return;
    putDays([
      { date: from.date, items: plainItems(from).filter((_, i) => i !== index) },
      {
        date: target.date,
        items: [...plainItems(target).filter((other) => other.topicId !== item.topicId), item],
      },
    ]);
  };

  return (
    <>
      <PageHeader title={es.plan.title}>
        <Badge variant={plan.status === "active" ? "default" : "secondary"}>
          {plan.ended ? es.plan.ended : plan.status === "active" ? es.plan.active : es.plan.draft}
        </Badge>
      </PageHeader>
      <p className="-mt-4 mb-4 text-muted-foreground">{es.plan.range(range)}</p>

      <div className="mb-6 flex flex-col gap-3">
        {locked && <DraftWaiting message={es.plan.claudeWorking} />}
        {plan.llmStatus === "rejected" && (
          <p className="text-sm text-muted-foreground">{es.plan.rejected}</p>
        )}
        {plan.llmStatus === "failed" && (
          <p className="text-sm text-muted-foreground">{es.plan.failed}</p>
        )}
        {plan.llmStatus === "skipped" && plan.llmError && (
          <p className="text-sm text-muted-foreground">
            {es.plan.skipped(validationMessage(plan.llmError))}
          </p>
        )}
        {plan.weekNote && <p className="text-lg">{plan.weekNote}</p>}
        {!plan.ended && (
          <div className="flex flex-wrap gap-2">
            {plan.status === "draft" && (
              <Button
                onClick={() =>
                  action.mutate(
                    { kind: "accept" },
                    {
                      onSuccess: () => toast.success(es.plan.accepted),
                    },
                  )
                }
                disabled={busy}
              >
                {es.plan.accept}
              </Button>
            )}
            {plan.status === "draft" && (
              <Button
                variant="outline"
                onClick={() => action.mutate({ kind: "regenerate" })}
                disabled={busy}
              >
                <RefreshCw aria-hidden />
                {es.plan.regenerateWeek}
              </Button>
            )}
            {plan.status === "active" && (
              <Button
                variant="outline"
                onClick={() => action.mutate({ kind: "replan" })}
                disabled={busy}
              >
                <RefreshCw aria-hidden />
                {es.plan.replan}
              </Button>
            )}
            {plan.status === "active" && (
              <Button variant="ghost" onClick={() => build.mutate()} disabled={busy}>
                {es.plan.build}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {plan.days.map((day) => (
          <PlanDayCard
            key={day.id}
            day={day}
            editable={canEdit(day) && !locked}
            showProgress={plan.status === "active" && (day.past || day.today)}
            moveTargets={plan.days.filter((other) => other.date !== day.date && canEdit(other))}
            topics={topics}
            busy={busy}
            onChange={(items) => putDays([{ date: day.date, items }])}
            onMove={(index, toDate) => move(day, index, toDate)}
            onRegenerate={() => action.mutate({ kind: "day", date: day.date })}
          />
        ))}
      </div>
    </>
  );
}
