import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Panel, Empty } from "@/components/bits";
import { formatDate, formatDateTime, formatHours } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário · Residuum" },
      {
        name: "description",
        content: "Histórico de estudos e revisões dos assuntos já vistos.",
      },
      { property: "og:title", content: "Calendário · Residuum" },
      { property: "og:description", content: "O que já foi estudado e o que precisa revisar." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { data: subjects = [] } = useSubjects();
  const { data: decks = [] } = useDecks();
  const { data: logs = [] } = useQuestionLogs();
  const { data: sessions = [] } = useStudySessions();
  const { data: reviews = [] } = useReviews();
  const { data: deckSessions = [] } = useDeckSessions();
  const { data: snapshots = [] } = useSubjectPrioritySnapshots();

  const now = new Date();
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const subjectName = (id: string | null) => (id ? subjectById.get(id)?.name ?? "—" : "Geral");
  const deckName = (id: string) => deckById.get(id)?.name ?? "—";

  const isOverdue = (at: string) => new Date(at).getTime() < now.getTime();
  const isToday = (at: string) => new Date(at).toDateString() === now.toDateString();
  const isFuture = (at: string) => new Date(at).getTime() > now.getTime();

  const todaySubjects = subjects.filter((s) => s.next_review_at && isToday(s.next_review_at));
  const todayDecks = decks.filter((d) => d.next_review_at && isToday(d.next_review_at));
  const overdueSubjects = subjects.filter((s) => s.next_review_at && isOverdue(s.next_review_at));
  const overdueDecks = decks.filter((d) => d.next_review_at && isOverdue(d.next_review_at));

  const upcoming = [
    ...subjects
      .filter((s) => s.next_review_at && isFuture(s.next_review_at))
      .map((s) => ({ key: `s:${s.id}`, name: s.name, at: s.next_review_at as string, kind: "subject" as const, subjectId: s.id })),
    ...decks
      .filter((d) => d.next_review_at && isFuture(d.next_review_at))
      .map((d) => ({ key: `d:${d.id}`, name: d.name, at: d.next_review_at as string, kind: "deck" as const, subjectId: null })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const priority = snapshots
    .map((snap) => ({ snap, subject: subjectById.get(snap.subject_id) }))
    .filter((x): x is { snap: (typeof snapshots)[number]; subject: Subject } => Boolean(x.subject))
    .sort((a, b) => b.snap.priority_score - a.snap.priority_score)
    .slice(0, 10);

  // Histórico: tudo o que já aconteceu, do mais recente ao mais antigo.
  const history = [
    ...sessions.map((s) => ({
      at: s.started_at,
      title: subjectName(s.subject_id),
      detail: `Estudo · ${formatHours(s.minutes)}${s.notes ? ` · ${s.notes}` : ""}`,
    })),
    ...logs.map((l) => ({
      at: l.created_at,
      title: subjectName(l.subject_id),
      detail: `Questões · ${l.correct}/${l.total}`,
    })),
    ...deckSessions.map((d) => ({
      at: d.reviewed_at,
      title: deckName(d.deck_id),
      detail: `Flashcards · ${d.cards_reviewed} cards`,
    })),
    ...reviews.map((r) => ({
      at: r.reviewed_at,
      title: subjectName(r.subject_id),
      detail: `Revisão · ${RATING_LABEL[r.rating as Rating] ?? r.rating}`,
    })),
    ...subjects.flatMap((s) => [
      ...(s.video_watched_at
        ? [{ at: s.video_watched_at, title: s.name, detail: "Vídeoaula assistida" }]
        : []),
      ...(s.summary_ready_at
        ? [{ at: s.summary_ready_at, title: s.name, detail: "Resumo pronto" }]
        : []),
      ...(s.deck_ready_at
        ? [{ at: s.deck_ready_at, title: s.name, detail: "Baralho pronto" }]
        : []),
    ]),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const historyByDay = new Map<string, typeof history>();
  for (const item of history) {
    const day = new Date(item.at).toISOString().slice(0, 10);
    const list = historyByDay.get(day) ?? [];
    list.push(item);
    historyByDay.set(day, list);
  }

  return (
    <>
      <Panel title="Hoje">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Revisões de hoje
            </p>
            {todaySubjects.length === 0 && todayDecks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma revisão para hoje.</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                {todaySubjects.map((s) => (
                  <Link
                    key={s.id}
                    to="/assuntos/$id"
                    params={{ id: s.id }}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-secondary"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-violet" />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground">assunto</span>
                  </Link>
                ))}
                {todayDecks.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sage" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground">baralho</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Baralhos/Anki pendentes
            </p>
            {overdueDecks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum baralho pendente.</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                {overdueDecks.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-rose">vencido há {Math.ceil((now.getTime() - new Date(d.next_review_at as string).getTime()) / 86_400_000)}d</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Assuntos prioritários
            </p>
            {priority.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum assunto priorizado ainda. Estude e registre para ver a prioridade aqui.
              </p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                {priority.map(({ snap, subject }) => (
                  <Link
                    key={subject.id}
                    to="/assuntos/$id"
                    params={{ id: subject.id }}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                    <span className="text-xs text-muted-foreground">
                      prioridade {snap.priority_score}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title={`Atrasadas (${overdueSubjects.length + overdueDecks.length})`}
      >
        {overdueSubjects.length === 0 && overdueDecks.length === 0 ? (
          <Empty>Nenhuma revisão atrasada. 🎉</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {overdueSubjects.map((s) => (
              <Link
                key={s.id}
                to="/assuntos/$id"
                params={{ id: s.id }}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-secondary"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-violet" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-rose">
                  venceu {formatDate(s.next_review_at)}
                </span>
              </Link>
            ))}
            {overdueDecks.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-sage" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-xs text-rose">venceu {formatDate(d.next_review_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Próximas revisões (SRS)">
        {upcoming.length === 0 ? (
          <Empty>Nenhuma próxima revisão agendada.</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {upcoming.slice(0, 15).map((item) => (
              <div key={item.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${item.kind === "subject" ? "bg-violet" : "bg-sage"}`} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">{formatDate(item.at)}</span>
              </div>
            ))}
            {upcoming.length > 15 && (
              <p className="text-xs text-muted-foreground">
                + {upcoming.length - 15} outras próximas revisões.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Histórico">
        {history.length === 0 ? (
          <Empty>Nenhuma atividade registrada ainda.</Empty>
        ) : (
          <div className="space-y-4">
            {[...historyByDay.entries()].map(([day, items]) => (
              <div key={day}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatDate(day)}
                </p>
                <div className="mt-1.5 space-y-1.5 text-sm">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.at)} · {item.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
