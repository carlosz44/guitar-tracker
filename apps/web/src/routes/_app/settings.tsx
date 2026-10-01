import { type MeResponse, type UpdateSettings, updateSettingsSchema } from "@ds/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
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
import { formatDateTime } from "@/lib/format";

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
      </CardContent>
    </Card>
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
