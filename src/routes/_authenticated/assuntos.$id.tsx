import { createFileRoute, Link } from "@tanstack/react-router";
import {
  EMPTY_STATS,
  questionStatsBySubject,
  useDisciplines,
  useQuestionLogs,
  useReviews,
  useStudySessions,
  useSubjects,
} from "@/lib/data";
import { RATING_LABEL, type Rating } from "@/lib/srs";
import { useRateSubject } from "@/lib/actions";
import { Panel, Stat, Empty, buttonClass, ghostButtonClass } from "@/components/bits";
import { formatDate, formatDateTime, formatHours } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/assuntos/$id")({
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

const RATINGS: Rating[] = ["muito_dificil", "dificil", "bom", "facil"];

function SubjectDetail() {
  const { id } = Route.useParams();
  const { data: subjects = [] } = useSubjects();
  const { data: disciplines = [] } = useDisciplines();
  const { data: sessions = [] } = useStudySessions();
  const { data: logs = [] } = useQuestionLogs();
  const { data: reviews = [] } = useReviews(id);
  const rate = useRateSubject();

  const subject = subjects.find((s) => s.id === id);
  if (!subject) return <Empty>Assunto não encontrado.</Empty>;

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
          {discipline?.name ?? "Sem disciplina"} · incidência em provas{" "}
          {subject.exam_incidence}/5
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Domínio" value={`${subject.mastery}%`} progress={subject.mastery} tone="brand" />
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

      <Panel title="Registrar revisão">
        <p className="text-sm text-muted-foreground">
          Como foi a recuperação deste conteúdo? O intervalo é recalculado para manter cerca
          de 90% de retenção.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {RATINGS.map((rating) => (
            <button
              key={rating}
              disabled={rate.isPending}
              onClick={() => rate.mutate({ subject, rating })}
              className={rating === "bom" ? buttonClass : ghostButtonClass}
            >
              {RATING_LABEL[rating]}
            </button>
          ))}
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
