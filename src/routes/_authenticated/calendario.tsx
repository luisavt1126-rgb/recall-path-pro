import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  useSubjects,
  useDecks,
  useDisciplines,
  useQuestionLogs,
  useReviews,
  useDeckSessions,
  useSubjectPrioritySnapshots,
  type Subject,
} from "@/lib/data";
import { CORE_AREAS } from "@/lib/areas";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { addDays, formatDate, isSameDay, startOfDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário · Residuum" },
      { name: "description", content: "Dashboard mensal operacional de revisões SRS." },
      { property: "og:title", content: "Calendário · Residuum" },
      { property: "og:description", content: "Passados, vencimentos e projeções SRS do mês." },
    ],
  }),
  component: CalendarPage,
});

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const dayKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const startOfWeekSunday = (d: Date) => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
};

// Palette exata do design escuro.
// Verde #10b981 = emerald-500 · Vermelho #f43f5e = rose-500.
const CARD = "rounded-2xl border border-[#1e232d] bg-[#13161c]";
const HOVER = "hover:bg-[#1a1f29]";

type Pill = { label: string; prefix: string; color: string; dot: string; title: string };

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red";
}) {
  const valueColor =
    tone === "green" ? "text-emerald-500" : tone === "red" ? "text-rose-500" : "text-foreground";
  return (
    <div className={`${CARD} p-5`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold sm:text-3xl ${valueColor}`}>{value}</p>
    </div>
  );
}

function SideSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm font-medium hover:bg-[#1a1f29]">
        <span>
          {title} <span className="text-xs text-muted-foreground">({count})</span>
        </span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function CalendarPage() {
  const { data: subjects = [] } = useSubjects();
  const { data: decks = [] } = useDecks();
  const { data: disciplines = [] } = useDisciplines();
  const { data: logs = [] } = useQuestionLogs();
  const { data: reviews = [] } = useReviews();
  const { data: deckSessions = [] } = useDeckSessions();
  const { data: snapshots = [] } = useSubjectPrioritySnapshots();

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(dayKey(new Date()));

  const now = new Date();
  const today = startOfDay(now);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const disciplineById = new Map(disciplines.map((d) => [d.id, d]));

  // --- Métricas ---
  const todaySubjects = subjects.filter((s) => s.next_review_at && isSameDay(new Date(s.next_review_at), now));
  const todayDecks = decks.filter((d) => d.next_review_at && isSameDay(new Date(d.next_review_at), now));
  const overdueSubjects = subjects.filter((s) => s.next_review_at && new Date(s.next_review_at).getTime() < today.getTime());
  const overdueDecks = decks.filter((d) => d.next_review_at && new Date(d.next_review_at).getTime() < today.getTime());

  const reviewsToday = todaySubjects.length + todayDecks.length;
  const overdueCount = overdueSubjects.length + overdueDecks.length;
  const completedCount = reviews.length + deckSessions.length;
  const totalQuestions = logs.reduce((a, l) => a + l.total, 0);
  const totalCorrect = logs.reduce((a, l) => a + l.correct, 0);
  const avgAccuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // Distribuição de desempenho pelas 5 Grandes Áreas (CORE_AREAS).
  const areaProgress = CORE_AREAS.map((area) => {
    const areaSubjects = subjects.filter((s) => {
      const d = disciplineById.get(s.discipline_id);
      return d ? area.specialties.includes(d.name) : false;
    });
    const studied = areaSubjects.filter((s) => s.first_studied_at).length;
    const pct = areaSubjects.length ? Math.round((studied / areaSubjects.length) * 100) : 0;
    return { area: area.area, total: areaSubjects.length, studied, pct };
  }).filter((a) => a.total > 0);

  // --- Pílulas por dia (agendado no SRS) ---
  const pillsByDay = new Map<string, Pill[]>();
  const addPill = (k: string, pill: Pill) => {
    const list = pillsByDay.get(k) ?? [];
    list.push(pill);
    pillsByDay.set(k, list);
  };
  const pushScheduled = (name: string, at: string) => {
    const k = dayKey(new Date(at));
    const overdue = new Date(at).getTime() < today.getTime();
    addPill(k, {
      label: name,
      prefix: overdue ? "!" : "✓",
      title: `${name} · ${overdue ? "atrasada" : "em dia"} · ${formatDate(at)}`,
      color: overdue ? "bg-rose-500/15 text-rose-500" : "bg-emerald-500/15 text-emerald-500",
      dot: overdue ? "bg-rose-500" : "bg-emerald-500",
    });
  };
  for (const s of subjects) if (s.next_review_at) pushScheduled(s.name, s.next_review_at);
  for (const d of decks) if (d.next_review_at) pushScheduled(d.name, d.next_review_at);

  const completedByDay = new Map<string, number>();
  const bumpCompleted = (at: string) => {
    const k = dayKey(new Date(at));
    completedByDay.set(k, (completedByDay.get(k) ?? 0) + 1);
  };
  for (const r of reviews) bumpCompleted(r.reviewed_at);
  for (const ds of deckSessions) bumpCompleted(ds.reviewed_at);

  // --- Grade mensal (7 colunas, Dom a Sáb) ---
  const monthCursor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const gridStart = startOfWeekSunday(monthCursor);
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const totalCells = Math.ceil((monthCursor.getDay() + daysInMonth) / 7) * 7;
  const gridDays = Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i));
  const monthLabel = monthCursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const selectedPills = selectedDay ? pillsByDay.get(selectedDay) ?? [] : [];

  // --- Painel lateral ---
  const upcoming = [
    ...subjects
      .filter((s) => s.next_review_at && new Date(s.next_review_at).getTime() > today.getTime())
      .map((s) => ({ key: `s:${s.id}`, name: s.name, at: s.next_review_at as string, subjectId: s.id as string | null })),
    ...decks
      .filter((d) => d.next_review_at && new Date(d.next_review_at).getTime() > today.getTime())
      .map((d) => ({ key: `d:${d.id}`, name: d.name, at: d.next_review_at as string, subjectId: null as string | null })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const priority = snapshots
    .map((snap) => ({ snap, subject: subjectById.get(snap.subject_id) }))
    .filter((x): x is { snap: (typeof snapshots)[number]; subject: Subject } => Boolean(x.subject))
    .sort((a, b) => b.snap.priority_score - a.snap.priority_score)
    .slice(0, 6);

  const reviewRow = (item: { key: string; name: string; at: string; subjectId: string | null }, overdue: boolean) => {
    const cls = `flex items-center gap-2 rounded-lg border border-[#1e232d] bg-[#13161c] px-3 py-2 ${HOVER}`;
    const dot = `h-2 w-2 shrink-0 rounded-full ${overdue ? "bg-rose-500" : "bg-emerald-500"}`;
    const dateColor = `shrink-0 text-xs ${overdue ? "text-rose-500" : "text-muted-foreground"}`;
    const inner = (
      <>
        <span className={dot} />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        <span className={dateColor}>{formatDate(item.at)}</span>
      </>
    );
    return item.subjectId ? (
      <Link key={item.key} to="/assuntos/$id" params={{ id: item.subjectId }} search={{ tipo: "questoes" }} className={cls}>
        {inner}
      </Link>
    ) : (
      <Link key={item.key} to="/baralhos" className={cls}>
        {inner}
      </Link>
    );
  };

  return (
    <div className="-mx-4 -my-6 min-h-screen space-y-5 bg-[#0a0c10] px-4 py-6 sm:-mx-6 sm:px-6">
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Hoje" value={String(reviewsToday)} tone="green" />
        <MetricCard label="Atrasadas" value={String(overdueCount)} tone={overdueCount > 0 ? "red" : "default"} />
        <MetricCard label="Concluídas" value={String(completedCount)} />
        <MetricCard label="Acerto médio" value={totalQuestions ? `${avgAccuracy}%` : "—"} />
      </div>

      {/* Barra horizontal das 5 Grandes Áreas */}
      <div className={`${CARD} p-5`}>
        <h2 className="font-display text-base font-semibold">Grandes Áreas</h2>
        {areaProgress.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum assunto registrado ainda.</p>
        ) : (
          <div className="mt-4 flex gap-3 overflow-x-auto">
            {areaProgress.map((a) => (
              <div key={a.area} className="min-w-[110px] flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{a.area}</span>
                  <span className="shrink-0 text-muted-foreground">{a.pct}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#1e232d]">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${a.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold">
                {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <button className="rounded-lg border border-[#1e232d] px-2 py-1" onClick={() => setMonthOffset((m) => m - 1)}>
                  ←
                </button>
                <button className="rounded-lg border border-[#1e232d] px-2 py-1" onClick={() => setMonthOffset(0)}>
                  Hoje
                </button>
                <button className="rounded-lg border border-[#1e232d] px-2 py-1" onClick={() => setMonthOffset((m) => m + 1)}>
                  →
                </button>
              </div>
            </div>
            <div className="mt-4 mb-2 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => (
                <p key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d}
                </p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {gridDays.map((day) => {
                const k = dayKey(day);
                const pills = pillsByDay.get(k) ?? [];
                const completed = completedByDay.get(k) ?? 0;
                const inMonth = day.getMonth() === monthCursor.getMonth();
                const isToday = isSameDay(day, now);
                const isSelected = selectedDay === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedDay(k)}
                    className={`relative min-h-[56px] rounded-lg border p-1 text-left transition-colors ${
                      isSelected || isToday
                        ? "border-emerald-500 ring-1 ring-emerald-500"
                        : "border-[#1e232d] hover:border-muted-foreground"
                    } ${inMonth ? "bg-[#13161c]" : "bg-[#0d0f14] opacity-50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-semibold ${isToday ? "text-emerald-500" : ""}`}>
                        {day.getDate()}
                      </span>
                      {completed > 0 && (
                        <span className="text-[9px] font-semibold text-emerald-500">✓{completed}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {pills.slice(0, 3).map((p, i) => (
                        <span
                          key={i}
                          className={`truncate rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${p.color}`}
                          title={p.title}
                        >
                          {p.prefix} {p.label}
                        </span>
                      ))}
                      {pills.length > 3 && (
                        <span className="px-1 text-[9px] font-medium leading-none text-muted-foreground">
                          +{pills.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`${CARD} p-5`}>
            <h2 className="font-display text-base font-semibold">
              {selectedDay
                ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Selecione um dia"}
            </h2>
            {selectedPills.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma revisão agendada neste dia.</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                {selectedPills.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-[#1e232d] bg-[#13161c] px-3 py-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className={`${CARD} p-3`}>
            <h2 className="px-2 pt-2 font-display text-base font-semibold">Revisões</h2>
            <div className="divide-y divide-[#1e232d]">
              <SideSection title="Hoje" count={reviewsToday}>
                <div className="space-y-2 pb-2 text-sm">
                  {reviewsToday === 0 && <p className="py-2 text-center text-sm text-muted-foreground">Nenhuma revisão hoje.</p>}
                  {todaySubjects.map((s) =>
                    reviewRow({ key: `s:${s.id}`, name: s.name, at: s.next_review_at as string, subjectId: s.id }, false),
                  )}
                  {todayDecks.map((d) =>
                    reviewRow({ key: `d:${d.id}`, name: d.name, at: d.next_review_at as string, subjectId: null }, false),
                  )}
                </div>
              </SideSection>
              <SideSection title="Atrasadas" count={overdueCount}>
                <div className="space-y-2 pb-2 text-sm">
                  {overdueCount === 0 && <p className="py-2 text-center text-sm text-muted-foreground">Nada atrasado. 🎉</p>}
                  {overdueSubjects.map((s) =>
                    reviewRow({ key: `s:${s.id}`, name: s.name, at: s.next_review_at as string, subjectId: s.id }, true),
                  )}
                  {overdueDecks.map((d) =>
                    reviewRow({ key: `d:${d.id}`, name: d.name, at: d.next_review_at as string, subjectId: null }, true),
                  )}
                </div>
              </SideSection>
              <SideSection title="Próximas" count={upcoming.length}>
                <div className="space-y-2 pb-2 text-sm">
                  {upcoming.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">Nenhuma próxima revisão.</p>}
                  {upcoming.slice(0, 12).map((item) => reviewRow(item, false))}
                </div>
              </SideSection>
              <SideSection title="Prioridade alta" count={priority.length} defaultOpen={false}>
                <div className="space-y-2 pb-2 text-sm">
                  {priority.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">Sem prioridade calculada ainda.</p>}
                  {priority.map(({ snap, subject }) => (
                    <Link
                      key={subject.id}
                      to="/assuntos/$id"
                      params={{ id: subject.id }}
                      search={{ tipo: "questoes" }}
                      className={`flex items-center gap-2 rounded-lg border border-[#1e232d] bg-[#13161c] px-3 py-2 ${HOVER}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                      <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-500">
                        {snap.priority_score}
                      </span>
                    </Link>
                  ))}
                </div>
              </SideSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
