import { createFileRoute, Link } from "@tanstack/react-router";
import {
  EMPTY_STATS,
  questionStatsBySubject,
  displayMastery,
  useDisciplines,
  useQuestionLogs,
  useReviews,
  useStudySessions,
  useSubjects,
} from "@/lib/data";
import { RATING_LABEL, type Rating } from "@/lib/srs";
import { Panel, Stat, Empty } from "@/components/bits";
import { ReviewRecorder } from "@/components/ReviewRecorder";
import { PrepChecklist } from "@/components/SubjectPrep";
import { SubjectSubtopics } from "@/components/SubjectSubtopics";
import { formatDate, formatDateTime, formatHours } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/assuntos/$id")({
  validateSearch: (search: Record<string, unknown>): { tipo?: string | undefined } => ({
    tipo: typeof search["tipo"] === "string" ? search["tipo"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Assunto · Residuum" },
      {
        name: "description",
        content: "Histórico do assunto, domínio, revisões e desempenho em questões.",
      },
      { property: "og:title", content: "Assunto · Residuum" },
      { property: "og:description", content: "Linha do tempo e revisão espaçada do assunto." },
    ],
  }),
  component: SubjectDetail,
});

function SubjectDetail() {
  const { id } = Route.useParams();
  const { tipo } = Route.useSearch();
  const { data: subjects = [] } = useSubjects();
  const { data: disciplines = [] } = useDisciplines();
  const { data: sessions = [] } = useStudySessions();
  const { data: logs = [] } = useQuestionLogs();
  const { data: reviews = [] } = useReviews(id);

  const subject = subjects.find((s) => s.id === id);
  if (!subject) return <Empty>Assunto não encontrado.</Empty>;

  const mastery = displayMastery(subject, subjects);
  const childCount = subjects.filter((s) => s.parent_id === subject.id).length;
  const discipline = disciplines.find((d) => d.id === subject.discipline_id);
  const stats = questionStatsBySubject(logs).get(id) ?? EMPTY_STATS;
  const subjectSessions = sessions.filter((s) => s.subject_id === id);
  const totalMinutes = subjectSessions.reduce((a, s) => a + s.minutes, 0);

  const timeline = [
    ...subjectSessions.map((s) => ({
      at: s.started_at,
      title: `Sessão de ${s.activity_type}`,
      detail: `${formatHours(s.minutes)}${s.notes ? ` · ${s.notes}` : ""}`,
    })),
    ...reviews.map((r) => ({
      at: r.reviewed_at,
      title: `Revisão · ${RATING_LABEL[r.rating as Rating] ?? r.rating}`,
      detail: `intervalo ${Math.round(Number(r.interval_before))} → ${Math.round(Number(r.interval_after))} dias`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <div>
        <Link to="/assuntos" className="text-xs font-medium text-brand">
          ← Voltar aos assuntos
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold">{subject.name}</h1>
        <p className="text-sm text-muted-foreground">
          {discipline?.name ?? "Sem disciplina"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Domínio"
          value={`${mastery}%`}
          progress={mastery}
          tone="brand"
          {...(childCount > 0 ? { hint: `média de ${childCount} subtópicos` } : {})}
        />
        <Stat label="Tempo total" value={formatHours(totalMinutes)} hint={`${subjectSessions.length} sessões`} />
        <Stat
          label="Questões"
          value={stats.accuracy === null ? "—" : `${stats.accuracy}%`}
          hint={`${stats.total} feitas · ${stats.errors} erros`}
        />
        <Stat
          label="Próxima revisão"
          value={formatDate(subject.next_review_at)}
          hint={`intervalo ${Math.round(Number(subject.interval_days))} dias`}
        />
      </div>

      <Panel title="Preparo do assunto">
        <p className="mb-3 text-sm text-muted-foreground">
          Marque o que já está pronto. A primeira marcação registra automaticamente o
          primeiro estudo deste assunto.
        </p>
        <PrepChecklist subject={subject} />
      </Panel>

      <Panel title="Subassuntos">
        <p className="mb-3 text-sm text-muted-foreground">
          Organize este assunto em subassuntos (apenas organizacional, sem revisão própria).
        </p>
        <SubjectSubtopics subject={subject} />
      </Panel>

      <Panel title="Registrar revisão">
        <p className="text-sm text-muted-foreground">
          Como foi a recuperação deste conteúdo? Escolha o tipo de revisão e registre o
          desempenho real. O intervalo é recalculado para manter cerca de 90% de retenção.
        </p>
        <div className="mt-3">
          <ReviewRecorder subject={subject} initialType={tipo === "questoes" ? "questoes" : (undefined as any)} />
        </div>
      </Panel>

      <Panel title="Linha do tempo">
        {timeline.length === 0 ? (
          <Empty>Nenhum histórico ainda para este assunto.</Empty>
        ) : (
          <ol className="space-y-3 border-l border-border pl-4">
            {timeline.slice(0, 40).map((item, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand" />
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(item.at)} · {item.detail}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
