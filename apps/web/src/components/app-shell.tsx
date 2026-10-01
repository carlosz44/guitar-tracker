import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  History,
  Layers,
  type LucideIcon,
  MessageCirclePlus,
  Settings,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import { es } from "@/i18n/es";
import { AppMark } from "./app-mark";
import { QuestionDialog } from "./questions/question-dialog";
import { Button } from "./ui/button";

type NavPath = "/today" | "/lessons" | "/topics" | "/history" | "/settings";

export const NAV_ITEMS: readonly { to: NavPath; label: string; icon: LucideIcon }[] = [
  { to: "/today", label: es.nav.today, icon: Sun },
  { to: "/lessons", label: es.nav.lessons, icon: BookOpen },
  { to: "/topics", label: es.nav.topics, icon: Layers },
  { to: "/history", label: es.nav.history, icon: History },
  { to: "/settings", label: es.nav.settings, icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar />
      <main className="flex-1 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-10 lg:pt-10 lg:pb-10">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
      <div className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 lg:hidden">
        <QuestionDialog
          trigger={
            <Button
              size="icon-lg"
              className="rounded-full shadow-lg"
              aria-label={es.questions.addLabel}
            >
              <MessageCirclePlus aria-hidden />
            </Button>
          }
        />
      </div>
      <BottomNav />
    </div>
  );
}

export function Sidebar() {
  return (
    <aside
      data-testid="sidebar"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 border-r bg-sidebar p-4 text-sidebar-foreground lg:flex"
    >
      <div className="flex items-center gap-3 px-2 pt-2">
        <AppMark className="size-9" />
        <span className="text-lg font-semibold">{es.app.name}</span>
      </div>
      <nav aria-label={es.nav.label}>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-brand"
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto">
        <QuestionDialog />
      </div>
    </aside>
  );
}

export function BottomNav() {
  return (
    <nav
      aria-label={es.nav.label}
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground data-[status=active]:text-brand"
            >
              <Icon aria-hidden className="size-6" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
