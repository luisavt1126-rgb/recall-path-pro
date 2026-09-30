import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  useSubjects,
  useDecks,
  useQuestionLogs,
  useStudySessions,
  useReviews,
  useDeckSessions,
  useSubjectPrioritySnapshots,
  type Subject,
} from "@/lib/data";
import { RATING_LABEL, type Rating } from "@/lib/srs";
import { Panel, Empty, Stat } from "@/components/bits";
import { addDays, formatDate, formatHours, isSameDay, startOfWeek } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário · Residuum" },
      { name: "description", content: "Dashboard mensal de revisões e histórico de estudos." },
      { property: "og:title", content: "Calendário · Residuum" },
      { property: "og:description", content: "Revisões espaçadas e histórico de estudos do mês." },
    ],
  }),
  component: CalendarPage,
});

type DayEventType = "questoes" | "revisao" | "flashcards" | "estudo" | "checklist" | "srs";

type DayEvent = {
  key: string;
  type: DayEventType;
  title: string;
  detail: string;
  at: string;
  subjectId?: string;
  deckId?: string;
};

const TYPE_LABEL: Record<DayEventType, string> = {
  questoes: "Q",
  revisao: "R",
  flashcards: "A",
  estudo: "E",
  checklist: "✓",
  srs: "R",
};

const TYPE_CHIP: Record<DayEventType, string> = {
  questoes: "bg-brand/10 text-brand",
  revisao: "bg-violet/10 text-violet",
  flashcards: "bg-sage/10 text-sage",
  estudo: "bg-amber/10 text-amber",
  checklist: "bg-muted text-muted-foreground",
  srs: "bg-rose/10 text-rose",
};

const TYPE_DOT: Record<DayEventType, string> = {
  questoes: "bg-brand",
  revisao: "bg-violet",
  flashcards: "bg-sage",
  estudo: "bg-amber",
  checklist: "bg-muted-foreground",
  srs: "bg-rose",
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const dayKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function CalendarPage() {
  const { data: subjects = [] } = useSubjects();
  const { data: decks = [] } = useDecks();
  const { data: logs = [] } = useQuestionLogs();
  const { data: sessions = [] } = useStudySessions();
  const { data: reviews = [] } = useReviews();
  const { data: deckSessions = [] } = useDeckSessions();
  const { data: snapshots = [] } = useSubjectPrioritySnapshots();

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(dayKey(new Date()));

  const now = new Date();
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const subjectName = (id: string | null) => (id ? subjectById.get(id)?.name ?? "—" : "Geral");
  const deckName = (id: string) => deckById.get(id)?.name ?? "—";

  // --- Métricas ---
  const todaySubjects = subjects.filter((s) => s.next_review_at && isSameDay(new Date(s.next_review_at), now));
  const todayDecks = decks.filter((d) => d.next_review_at && isSameDay(new Date(d.next_review_at), now));
  const overdueSubjects = subjects.filter((s) => s.next_review_at && new Date(s.next_review_at).getTime() < now.getTime());
  const overdueDecks = decks.filter((d) => d.next_review_at && new Date(d.next_review_at).getTime() < now.getTime());

  const reviewsToday = todaySubjects.length + todayDecks.length;
  const overdueCount = overdueSubjects.length + overdueDecks.length;
  const completedCount = reviews.length + deckSessions.length;
  const totalQuestions = logs.reduce((a, l) => a + l.total, 0);
  const totalCorrect = logs.reduce((a, l) => a + l.correct, 0);
  const avgAccuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const totalMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
  const totalCards = deckSessions.reduce((a, d) => a + d.cards_reviewed, 0);

  // --- Eventos por dia ---
  const allEvents: DayEvent[] = [
    ...logs.map((l) => ({
      key: `q:${l.id}`,
      type: "questoes" as const,
      title: subjectName(l.subject_id),
      detail: `${l.correct}/${l.total} questões`,
      at: l.created_at,
      subjectId: l.subject_id ?? undefined,
    })),
    ...reviews.map((r) => ({
      key: `r:${r.id}`,
      type: "revisao" as const,
      title: subjectName(r.subject_id),
      detail: `Revisão · ${RATING_LABEL[r.rating as Rating] ?? r.rating}`,
      at: r.reviewed_at,
      subjectId: r.subject_id,
    })),
    ...deckSessions.map((d) => ({
      key: `d:${d.id}`,
      type: "flashcards" as const,
      title: deckName(d.deck_id),
      detail: `${d.cards_reviewed} cards`,
      at: d.reviewed_at,
      deckId: d.deck_id,
    })),
    ...sessions.map((s) => ({
      key: `s:${s.id}`,
      type: "estudo" as const,
      title: subjectName(s.subject_id),
      detail: `Estudo · ${formatHours(s.minutes)}`,
      at: s.started_at,
      subjectId: s.subject_id ?? undefined,
    })),
    ...subjects.flatMap((s) => [
      ...(s.video_watched_at
        ? [{ key: `v:${s.id}`, type: "checklist" as const, title: s.name, detail: "Vídeoaula", at: s.video_watched_at, subjectId: s.id }]
        : []),
      ...(s.summary_ready_at
        ? [{ key: `m:${s.id}`, type: "checklist" as const, title: s.name, detail: "Resumo", at: s.summary_ready_at, subjectId: s.id }]
        : []),
      ...(s.deck_ready_at
        ? [{ key: `b:${s.id}`, type: "checklist" as const, title: s.name, detail: "Baralho", at: s.deck_ready_at, subjectId: s.id }]
        : []),
    ]),
    ...subjects
      .filter((s) => s.next_review_at)
      .map((s) => ({
        key: `srs:${s.id}`,
        type: "srs" as const,
        title: s.name,
        detail: "Revisão SRS",
        at: s.next_review_at as string,
        subjectId: s.id,
      })),
    ...decks
      .filter((d) => d.next_review_at)
      .map((d) => ({
        key: `srsd:${d.id}`,
        type: "srs" as const,
        title: d.name,
        detail: "Revisão SRS",
        at: d.next_review_at as string,
        deckId: d.id,
      })),
  ];

  const eventsByDay = new Map<string, DayEvent[]>();
  for (const e of allEvents) {
    const k = dayKey(new Date(e.at));
    const list = eventsByDay.get(k) ?? [];
    list.push(e);
    eventsByDay.set(k, list);
  }

  // --- Grade mensal ---
  const monthCursor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const gridStart = startOfWeek(monthCursor);
  const gridDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthLabel = monthCursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];

  // --- Painel lateral ---
  const upcoming = [
    ...subjects
      .filter((s) => s.next_review_at && new Date(s.next_review_at).getTime() > now.getTime())
      .map((s) => ({ key: `s:${s.id}`, name: s.name, at: s.next_review_at as string, kind: "subject" as const, subjectId: s.id })),
    ...decks
      .filter((d) => d.next_review_at && new Date(d.next_review_at).getTime() > now.getTime())
      .map((d) => ({ key: `d:${d.id}`, name: d.name, at: d.next_review_at as string, kind: "deck" as const, subjectId: null })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const priority = snapshots
    .map((snap) => ({ snap, subject: subjectById.get(snap.subject_id) }))
    .filter((x): x is { snap: (typeof snapshots)[number]; subject: Subject } => Boolean(x.subject))
    .sort((a, b) => b.snap.priority_score - a.snap.priority_score)
    .slice(0, 8);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Revisões hoje" value={String(reviewsToday)} tone="brand" />
        <Stat label="Atrasadas" value={String(overdueCount)} tone={overdueCount > 0 ? "rose" : "default"} />
        <Stat label="Concluídas" value={String(completedCount)} />
        <Stat label="Acerto médio" value={totalQuestions ? `${avgAccuracy}%` : "—"} />
        <Stat label="Horas estudadas" value={`${(totalMinutes / 60).toFixed(1).replace(".", ",")}h`} />
        <Stat label="Flashcards feitos" value={String(totalCards)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel
            title={monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            action={
              <div className="flex items-center gap-2 text-xs">
                <button className="rounded-lg border border-border px-2 py-1" onClick={() => setMonthOffset((m) => m - 1)}>
                  ←
                </button>
                <button className="rounded-lg border border-border px-2 py-1" onClick={() => setMonthOffset(0)}>
                  Hoje
                </button>
                <button className="rounded-lg border border-border px-2 py-1" onClick={() => setMonthOffset((m) => m + 1)}>
                  →
                </button>
              </div>
            }
          >
            <div className="mb-2 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => (
                <p key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d}
                </p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {gridDays.map((day) => {
                const k = dayKey(day);
                const events = eventsByDay.get(k) ?? [];
                const inMonth = day.getMonth() === monthCursor.getMonth();
                const isToday = isSameDay(day, now);
                const isSelected = selectedDay === k;
                const overdue = events.some((e) => e.type === "srs" && new Date(e.at).getTime() < now.getTime());
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedDay(k)}
                    className={`relative min-h-[52px] rounded-lg border p-1 text-left transition-colors ${
                      isSelected
                        ? "border-brand ring-1 ring-brand"
                        : isToday
                          ? "border-brand/50"
                          : "border-border hover:border-muted-foreground"
                    } ${inMonth ? "bg-card" : "bg-muted/30 opacity-50"}`}
                  >
                    <span className={`text-[11px] font-semibold ${isToday ? "text-brand" : ""}`}>{day.getDate()}</span>
                    <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${overdue ? "bg-rose" : "bg-transparent"}`} />
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {events.slice(0, 3).map((e) => (
                        <span
                          key={e.key}
                          className={`rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${TYPE_CHIP[e.type]}`}
                          title={`${e.title} · ${e.detail}`}
                        >
                          {TYPE_LABEL[e.type]}
                        </span>
                      ))}
                      {events.length > 3 && (
                        <span className="rounded px-1 py-0.5 text-[9px] font-medium leading-none text-muted-foreground">
                          +{events.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title={
              selectedDay
                ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Selecione um dia"
            }
          >
            {selectedEvents.length === 0 ? (
              <Empty>Nenhuma atividade neste dia.</Empty>
            ) : (
              <div className="space-y-2 text-sm">
                {selectedEvents.map((e) => {
                  const inner = (
                    <>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[e.type]}`} />
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.detail}</span>
                    </>
                  );
                  const cls = "flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-secondary";
                  if (e.subjectId) {
                    return (
                      <Link key={e.key} to="/assuntos/$id" params={{ id: e.subjectId }} className={cls}>
                        {inner}
                      </Link>
                    );
                  }
                  if (e.deckId) {
                    return (
                      <Link key={e.key} to="/baralhos" className={cls}>
                        {inner}
                      </Link>
                    );
                  }
                  return (
                    <div key={e.key} className={cls}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Hoje">
            {reviewsToday === 0 ? (
              <Empty>Nenhuma revisão hoje.</Empty>
            ) : (
              <div className="space-y-2 text-sm">
                {todaySubjects.map((s) => (
                  <Link key={s.id} to="/assuntos/$id" params={{ id: s.id }} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-secondary">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-violet" />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  </Link>
                ))}
                {todayDecks.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sage" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Atrasadas (${overdueCount})`}>
            {overdueCount === 0 ? (
              <Empty>Nada atrasado. 🎉</Empty>
            ) : (
              <div className="space-y-2 text-sm">
                {overdueSubjects.slice(0, 8).map((s) => (
                  <Link key={s.id} to="/assuntos/$id" params={{ id: s.id }} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-secondary">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose" />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="text-xs text-rose">{formatDate(s.next_review_at)}</span>
                  </Link>
                ))}
                {overdueDecks.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-rose">{formatDate(d.next_review_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Próximas revisões (SRS)">
            {upcoming.length === 0 ? (
              <Empty>Nenhuma próxima revisão.</Empty>
            ) : (
              <div className="space-y-2 text-sm">
                {upcoming.slice(0, 10).map((item) => (
                  <div key={item.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${item.kind === "subject" ? "bg-violet" : "bg-sage"}`} />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(item.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Prioridade alta">
            {priority.length === 0 ? (
              <Empty>Sem prioridade calculada ainda.</Empty>
            ) : (
              <div className="space-y-2 text-sm">
                {priority.map(({ snap, subject }) => (
                  <Link key={subject.id} to="/assuntos/$id" params={{ id: subject.id }} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-secondary">
                    <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                    <span className="text-xs text-muted-foreground">{snap.priority_score}</span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
