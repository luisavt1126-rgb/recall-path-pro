import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  useDecks,
  useEvents,
  useProfile,
  useQuestionLogs,
  useStudySessions,
  useSubjects,
  useDisciplines,
  questionStatsBySubject,
  EMPTY_STATS,
  categoryMeta,
} from "@/lib/data";
import { priorityLevel, priorityScore } from "@/lib/priority";
import { Panel, PriorityTag, Stat, Empty } from "@/components/bits";
import {
  addDays,
  decimalHours,
  formatDate,
  formatHours,
  formatTime,
  isSameDay,
  startOfWeek,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/hoje")({
  head: () => ({
    meta: [
      { title: "Hoje · Residuum" },
      {
        name: "description",
        content: "O que estudar hoje, revisões pendentes, horas da semana e desempenho.",
      },
      { property: "og:title", content: "Hoje · Residuum" },
      { property: "og:description", content: "Painel diário dos seus estudos médicos." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: subjects = [] } = useSubjects();
  const { data: disciplines = [] } = useDisciplines();
  const { data: sessions = [] } = useStudySessions();
  const { data: logs = [] } = useQuestionLogs();
  const { data: decks = [] } = useDecks();
  const { data: events = [] } = useEvents();

  const today = new Date();
  const weekStart = startOfWeek(today);
  const todayMinutes = sessions
    .filter((s) => isSameDay(new Date(s.started_at), today))
    .reduce((a, s) => a + s.minutes, 0);
  const weekMinutes = sessions
    .filter((s) => new Date(s.started_at) >= weekStart)
    .reduce((a, s) => a + s.minutes, 0);
  const goal = Number(profile?.weekly_goal_hours ?? 30);
  const goalPct = Math.round((weekMinutes / 60 / (goal || 1)) * 100);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthLogs = logs.filter((l) => new Date(l.created_at) >= monthStart);
  const monthTotal = monthLogs.reduce((a, l) => a + l.total, 0);
  const monthCorrect = monthLogs.reduce((a, l) => a + l.correct, 0);
  const monthAccuracy = monthTotal ? Math.round((monthCorrect / monthTotal) * 100) : 0;

  const stats = questionStatsBySubject(logs);
  const disciplineName = (id: string | null) =>
    disciplines.find((d) => d.id === id)?.name ?? "Sem disciplina";

  const ranked = subjects
    .map((subject) => {
      const s = stats.get(subject.id) ?? EMPTY_STATS;
      const score = priorityScore({
        next_review_at: subject.next_review_at,
        last_studied_at: subject.last_studied_at,
        mastery: subject.mastery,
        exam_incidence: subject.exam_incidence,
        accuracy: s.accuracy,
        recentErrors: s.recentErrors,
      });
      return { subject, score, level: priorityLevel(score), stats: s };
    })
    .sort((a, b) => b.score - a.score);

  const overdue = ranked.filter(
    (r) => r.subject.next_review_at && new Date(r.subject.next_review_at) < today,
  );
  const dueToday = ranked.filter(
    (r) => r.subject.next_review_at && isSameDay(new Date(r.subject.next_review_at), today),
  );

  const todayEvents = events
    .filter((e) => isSameDay(new Date(e.starts_at), today))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const decksToday = decks
    .filter((d) => !d.next_review_at || new Date(d.next_review_at) <= addDays(today, 1))
    .slice(0, 4);

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(weekStart, -7 * (7 - i));
    const end = addDays(start, 7);
    const minutes = sessions
      .filter((s) => {
        const d = new Date(s.started_at);
        return d >= start && d < end;
      })
      .reduce((a, s) => a + s.minutes, 0);
    return {
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      horas: Number((minutes / 60).toFixed(1)),
      atual: i === 7,
    };
  });

  const topSubjects = [...stats.entries()]
    .map(([id, s]) => ({ name: subjects.find((x) => x.id === id)?.name ?? "—", ...s }))
    .filter((s) => s.total >= 5)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
    .slice(0, 5);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Hoje" value={formatHours(todayMinutes)} hint="tempo estudado" />
        <Stat
          label="Semana"
          value={`${decimalHours(weekMinutes)} h`}
          progress={goalPct}
          hint={`meta ${goal} h · ${goalPct}%`}
        />
        <Stat
          label="Revisões atrasadas"
          value={String(overdue.length)}
          tone="rose"
          hint={`${dueToday.length} para hoje`}
        />
        <Stat
          label="Acertos no mês"
          value={`${monthAccuracy}%`}
          tone="brand"
          hint={`${monthTotal} questões`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Agenda de hoje"
          className="lg:col-span-2"
          action={
            <Link to="/calendario" className="text-xs font-medium text-brand">
              Ver calendário
            </Link>
          }
        >
          <div className="space-y-2 text-sm">
            {todayEvents.length === 0 && <Empty>Nenhum compromisso hoje.</Empty>}
            {todayEvents.map((event) => {
              const meta = categoryMeta(event.category);
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <span className={`h-9 w-1 rounded-full ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {formatTime(event.starts_at)} · {event.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.duration_min} min · {event.status}
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="O que estudar hoje"
          action={
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              prioridade inteligente
            </span>
          }
        >
          <div className="flex flex-col gap-2.5 text-sm">
            {ranked.length === 0 && (
              <Empty>
                Comece cadastrando disciplinas e assuntos em{" "}
                <Link to="/assuntos" className="text-brand">
                  Assuntos
                </Link>
                .
              </Empty>
            )}
            {ranked.slice(0, 5).map(({ subject, level, stats: s }) => (
              <Link
                key={subject.id}
                to="/assuntos/$id"
                params={{ id: subject.id }}
                className="rounded-xl border border-border p-3 transition-colors hover:bg-secondary"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">
                    {disciplineName(subject.discipline_id)} — {subject.name}
                  </p>
                  <PriorityTag level={level} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  domínio {subject.mastery}%
                  {s.accuracy !== null && ` · acertos ${s.accuracy}%`}
                  {subject.next_review_at &&
                    ` · revisão ${formatDate(subject.next_review_at)}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {subject.next_review_at &&
                    new Date(subject.next_review_at) < today && (
                      <span className="rounded-full bg-rose/10 px-2 py-0.5 text-[10px] font-medium text-rose">
                        revisão atrasada{" "}
                        {Math.max(1, daysBetween(today, subject.next_review_at))}d
                      </span>
                    )}
                  {subject.mastery < 60 && (
                    <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                      domínio baixo
                    </span>
                  )}
                  {s.recentErrors >= 3 && (
                    <span className="rounded-full bg-rose/10 px-2 py-0.5 text-[10px] font-medium text-rose">
                      {s.recentErrors} erros recentes
                    </span>
                  )}
                  {s.accuracy !== null && s.total >= 5 && s.accuracy < 70 && (
                    <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium text-violet">
                      acertos abaixo de 70%
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Horas por semana"
          className="lg:col-span-2"
          action={
            <Link to="/graficos" className="text-xs font-medium text-brand">
              Ver mais períodos
            </Link>
          }
        >
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks}>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  cursor={{ fill: "var(--secondary)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "var(--foreground)",
                  }}
                  formatter={(value: number) => [`${value} h`, "Horas"]}
                />
                <Bar dataKey="horas" radius={[6, 6, 0, 0]}>
                  {weeks.map((w, i) => (
                    <Cell key={i} fill={w.atual ? "var(--brand)" : "var(--accent)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>
              Média semanal{" "}
              <b className="text-foreground">
                {(weeks.reduce((a, w) => a + w.horas, 0) / weeks.length).toFixed(1)} h
              </b>
            </span>
            <span>
              Meta <b className="text-foreground">{goal} h</b>
            </span>
            <span className="font-medium text-brand">{goalPct}% atingida</span>
          </div>
        </Panel>

        <Panel
          title="Baralhos recomendados"
          action={
            <Link to="/baralhos" className="text-xs font-medium text-brand">
              Gerenciar
            </Link>
          }
        >
          <div className="space-y-2.5 text-sm">
            {recommendations.length === 0 && (
              <Empty>Registre questões e assuntos para receber recomendações.</Empty>
            )}
            {recommendations.map((rec) => {
              const meta = DECK_KIND_META[rec.kind];
              return (
                <div key={rec.key} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium">{rec.title}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.text}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {rec.subject.name} · {rec.reason}
                  </p>
                  {rec.deck?.next_review_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      próxima: {formatDate(rec.deck.next_review_at)}
                    </p>
                  )}
                  {rec.kind === "novo" && (
                    <button
                      className="mt-2 text-xs font-medium text-brand disabled:opacity-50"
                      disabled={createDeck.isPending}
                      onClick={() => createDeck.mutate(rec)}
                    >
                      + Criar baralho para este assunto
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Relatório mensal de questões">
        {topSubjects.length === 0 ? (
          <Empty>Registre questões para ver o relatório do mês.</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {topSubjects.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-xs">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${s.accuracy ?? 0}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {s.accuracy}% · {s.total}q
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
