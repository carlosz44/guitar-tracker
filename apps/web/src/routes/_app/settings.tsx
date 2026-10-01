import { type MeResponse, type UpdateSettings, updateSettingsSchema } from "@ds/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { es, validationMessage } from "@/i18n/es";
import { api, ensureOk, meQuery } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatDateTime, formatUsd } from "@/lib/format";
import { llmUsageQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  return (
    <>
      <PageHeader title={es.settings.title} />
      <div className="flex flex-col gap-4">
        <AccountCard me={me} />
        <PracticeCard me={me} />
        <BackupCard me={me} />
        <ClaudeCard enabled={me.llm.enabled} />
        <SignOutButton />
      </div>
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function AccountCard({ me }: { me: MeResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{es.settings.account}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Avatar className="size-14">
          {me.user.image && <AvatarImage src={me.user.image} alt="" />}
          <AvatarFallback>{initials(me.user.name)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-lg font-medium">{me.user.name}</p>
          <CardDescription>{es.settings.accountDescription}</CardDescription>
        </div>
      </CardContent>
    </Card>
  );
}

function PracticeCard({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const form = useForm<UpdateSettings>({
    resolver: zodResolver(updateSettingsSchema),
    defaultValues: { dailyTargetMinutes: me.settings.dailyTargetMinutes },
  });

  const save = useMutation({
    mutationFn: async (values: UpdateSettings) =>
      (await ensureOk(await api.settings.$patch({ json: values }))).json(),
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(meQuery.queryKey, (current) =>
        current ? { ...current, settings } : current,
      );
      form.reset({ dailyTargetMinutes: settings.dailyTargetMinutes });
      toast.success(es.settings.saved);
    },
    onError: () => toast.error(es.settings.saveError),
  });

  const error = form.formState.errors.dailyTargetMinutes;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{es.settings.practice}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <p className="text-sm text-muted-foreground">{es.settings.timezone}</p>
          <p className="font-medium" data-testid="timezone">
            {me.settings.timezone}
          </p>
        </div>
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex flex-col gap-3"
        >
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="daily-target">{es.settings.dailyTarget}</FieldLabel>
            <div className="flex gap-3">
              <Input
                id="daily-target"
                type="number"
                inputMode="numeric"
                min={10}
                max={240}
                step={5}
                className="max-w-32"
                aria-invalid={error ? true : undefined}
                {...form.register("dailyTargetMinutes", { valueAsNumber: true })}
              />
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? es.settings.saving : es.settings.save}
              </Button>
            </div>
            {error ? (
              <FieldError>{validationMessage(error.message)}</FieldError>
            ) : (
              <FieldDescription>{es.settings.dailyTargetHelp}</FieldDescription>
            )}
          </Field>
        </form>
        <DayTargets me={me} />
      </CardContent>
    </Card>
  );
}

function DayTargets({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const initial = me.settings.dayTargets ?? Array(7).fill(me.settings.dailyTargetMinutes);
  const [targets, setTargets] = useState<number[]>(initial);
  const save = useMutation({
    mutationFn: async (dayTargets: number[] | null) =>
      (await ensureOk(await api.settings.$patch({ json: { dayTargets } }))).json(),
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(meQuery.queryKey, (current) =>
        current ? { ...current, settings } : current,
      );
      setTargets(settings.dayTargets ?? Array(7).fill(settings.dailyTargetMinutes));
      queryClient.invalidateQueries({ queryKey: ["today"] });
      toast.success(es.settings.dayTargetsSaved);
    },
    onError: () => toast.error(es.settings.saveError),
  });
  const change = (index: number, delta: number) =>
    setTargets((current) =>
      current.map((value, i) => (i === index ? Math.min(240, Math.max(10, value + delta)) : value)),
    );

  return (
    <details open={me.settings.dayTargets !== null} className="flex flex-col gap-3">
      <summary className="cursor-pointer py-2 font-medium">{es.settings.dayTargets}</summary>
      <p className="text-sm text-muted-foreground">{es.settings.dayTargetsHelp}</p>
      <ul className="mt-3 flex flex-col gap-1">
        {es.settings.weekdays.map((day, index) => (
          <li key={day} className="flex items-center justify-between gap-3">
            <span>{day}</span>
            <span className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={es.settings.lessMinutes(day)}
                disabled={(targets[index] ?? 0) <= 10}
                onClick={() => change(index, -5)}
              >
                <Minus aria-hidden />
              </Button>
              <span
                className="w-16 text-center tabular-nums"
                data-testid={`day-target-${index + 1}`}
              >
                {es.settings.dayMinutes(targets[index] ?? 0)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={es.settings.moreMinutes(day)}
                disabled={(targets[index] ?? 0) >= 240}
                onClick={() => change(index, 5)}
              >
                <Plus aria-hidden />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => save.mutate(targets)} disabled={save.isPending}>
          {es.settings.saveDayTargets}
        </Button>
        {me.settings.dayTargets !== null && (
          <Button
            type="button"
            variant="outline"
            onClick={() => save.mutate(null)}
            disabled={save.isPending}
          >
            {es.settings.sameEveryDay}
          </Button>
        )}
      </div>
    </details>
  );
}

function BackupCard({ me }: { me: MeResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{es.settings.backups}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{es.settings.lastBackup}</p>
        <p className="font-medium" data-testid="last-backup">
          {me.lastBackupAt
            ? formatDateTime(me.lastBackupAt, me.settings.timezone)
            : es.settings.noBackups}
        </p>
      </CardContent>
    </Card>
  );
}

function ClaudeCard({ enabled }: { enabled: boolean }) {
  const { data } = useQuery({ ...llmUsageQuery, enabled });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{es.settings.claude}</CardTitle>
      </CardHeader>
      <CardContent>
        {!enabled ? (
          <p className="text-muted-foreground">{es.validation["llm.disabled"]}</p>
        ) : data ? (
          <>
            <p className="text-sm text-muted-foreground">{es.settings.claudeMonth}</p>
            <p className="font-medium" data-testid="llm-usage">
              {es.settings.claudeSpend(
                formatUsd(data.monthSpendUsd),
                formatUsd(data.budgetUsd),
                data.monthCalls,
              )}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SignOutButton() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/login" });
  }

  return (
    <Button variant="outline" onClick={signOut} className="self-start">
      <LogOut aria-hidden />
      {es.settings.signOut}
    </Button>
  );
}
