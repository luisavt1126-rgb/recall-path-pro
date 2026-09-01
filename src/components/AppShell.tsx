import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  LayoutGrid,
  Layers,
  ListChecks,
  Moon,
  Sun,
  Timer,
  GraduationCap,
  Settings,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { useProfile, useStudySessions } from "@/lib/data";
import { decimalHours, longDate, startOfWeek } from "@/lib/format";

const NAV = [
  { to: "/hoje", label: "Hoje", icon: LayoutGrid },
  { to: "/assuntos", label: "Assuntos", icon: BookOpen },
  { to: "/revisoes", label: "Revisões", icon: ListChecks },
  { to: "/baralhos", label: "Baralhos Anki", icon: Layers },
  { to: "/questoes", label: "Questões", icon: ListChecks },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/provas", label: "Provas", icon: GraduationCap },
  { to: "/temporizador", label: "Temporizador", icon: Timer },
  { to: "/graficos", label: "Gráficos", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

const MOBILE_NAV = [
  { to: "/hoje", label: "Hoje", icon: LayoutGrid },
  { to: "/assuntos", label: "Assuntos", icon: BookOpen },
  { to: "/calendario", label: "Agenda", icon: CalendarDays },
  { to: "/provas", label: "Provas", icon: GraduationCap },
  { to: "/temporizador", label: "Timer", icon: Timer },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { data: profile } = useProfile();
  const { data: sessions = [] } = useStudySessions();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const weekStart = startOfWeek(new Date());
  const weekMinutes = sessions
    .filter((s) => new Date(s.started_at) >= weekStart)
    .reduce((acc, s) => acc + s.minutes, 0);
  const goal = Number(profile?.weekly_goal_hours ?? 30);
  const pct = Math.min(100, Math.round((weekMinutes / 60 / (goal || 1)) * 100));
  const initial = (profile?.name ?? "L").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-5 py-6 lg:flex">
          <div className="mb-8 flex items-center gap-2.5 px-2">
            <div className="grid size-9 place-items-center rounded-lg bg-brand font-display text-sm font-bold text-brand-foreground">
              R
            </div>
            <div>
              <p className="font-display text-[15px] font-semibold leading-none">Residuum</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Residência
              </p>
            </div>
          </div>
          <nav className="flex flex-col gap-1 text-sm">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    active
                      ? "bg-accent font-medium text-brand"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3">
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-[11px] font-medium text-foreground/70">Meta semanal</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {decimalHours(weekMinutes)} / {goal} h
              </p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
            >
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-20 lg:pb-0">
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card/85 px-4 py-4 backdrop-blur sm:px-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {longDate(new Date())}
              </p>
              <h1 className="mt-1 font-display text-xl font-semibold sm:text-2xl">
                Olá, {profile?.name ?? "estudante"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggle}
                aria-label="Alternar tema"
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                <span className="hidden sm:inline">
                  {theme === "dark" ? "Modo claro" : "Modo escuro"}
                </span>
              </button>
              <div className="grid size-9 place-items-center rounded-full bg-violet/15 font-display text-sm font-semibold text-violet">
                {initial}
              </div>
            </div>
          </header>
          <section className="space-y-5 px-4 py-6 sm:px-6">{children}</section>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-card/95 px-2 py-2 backdrop-blur lg:hidden">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-[10px] ${
                active ? "text-brand" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
