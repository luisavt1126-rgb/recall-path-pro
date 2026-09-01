import { createFileRoute, Link } from "@tanstack/react-router";
import {
  EMPTY_STATS,
  questionStatsBySubject,
  useDisciplines,
  useQuestionLogs,
  useSubjects,
} from "@/lib/data";
import { questionPriority } from "@/lib/priority";
import { RATING_LABEL, TARGET_RETENTION, type Rating } from "@/lib/srs";
import { useRateSubject } from "@/lib/actions";
import { Panel, PriorityTag, Stat, Empty, buttonClass, ghostButtonClass } from "@/components/bits";
import { addDays, formatDate, isSameDay } from "@/lib/format";
import { PriorityRankings } from "@/components/PriorityRankings";

export const Route = createFileRoute("/_authenticated/revisoes")({
  head: () => ({
    meta: [
      { title: "Revisões · Residuum" },
      {
        name: "description",
        content: "Fila de revisão espaçada com meta de 90% de retenção por assunto.",
      },
      { property: "og:title", content: "Revisões · Residuum" },
      { property: "og:description", content: "Revise no momento certo, antes de esquecer." },
    ],
  }),
  component: ReviewsPage,
});

const RATINGS: Rating[] = ["muito_dificil", "dificil", "bom", "facil"];

function ReviewsPage() {
  const { data: subjects = [] } = useSubjects();
  const { data: disciplines = [] } = useDisciplines();
  const { data: logs = [] } = useQuestionLogs();
  const rate = useRateSubject();
  const stats = questionStatsBySubject(logs);
  const today = new Date();

  const items = subjects
    .map((subject) => {
      const s = stats.get(subject.id) ?? EMPTY_STATS;
      const { score, level } = questionPriority({
        accuracy: s.accuracy,
        total: s.total,
        recentErrors: s.recentErrors,
        exam_incidence: subject.exam_incidence,
      });
      return { subject, score, level };
    })
    .sort((a, b) => b.score - a.score);

  const overdue = items.filter(
    (i) => i.subject.next_review_at && new Date(i.subject.next_review_at) < today,
  );
  const dueToday = items.filter(
    (i) => i.subject.next_review_at && isSameDay(new Date(i.subject.next_review_at), today),
  );
  const upcoming = items.filter(
    (i) =>
      i.subject.next_review_at &&
      new Date(i.subject.next_review_at) > today &&
      new Date(i.subject.next_review_at) <= addDays(today, 7),
  );
  const never = items.filter((i) => !i.subject.next_review_at);
  const queue = [...overdue, ...dueToday, ...never];

  const disciplineName = (id: string) =>
    disciplines.find((d) => d.id === id)?.name ?? "Sem disciplina";

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Atrasadas" value={String(overdue.length)} tone="rose" />
        <Stat label="Para hoje" value={String(dueToday.length)} tone="brand" />
        <Stat label="Próximos 7 dias" value={String(upcoming.length)} />
        <Stat
          label="Meta de retenção"
          value={`${Math.round(TARGET_RETENTION * 100)}%`}
          hint="intervalos ajustados automaticamente"
        />
      </div>

      <Panel title="Fila de revisão">
        {queue.length === 0 ? (
          <Empty>Tudo em dia. Nenhuma revisão pendente 🎉</Empty>
        ) : (
          <div className="space-y-3">
            {queue.map(({ subject, level }) => (
              <div key={subject.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to="/assuntos/$id"
                      params={{ id: subject.id }}
                      className="font-medium hover:text-brand"
                    >
                      {subject.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {disciplineName(subject.discipline_id)} · domínio {subject.mastery}% ·
                      prevista {formatDate(subject.next_review_at)}
                    </p>
                  </div>
                  <PriorityTag level={level} />
                </div>
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
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Programadas para os próximos 7 dias">
        {upcoming.length === 0 ? (
          <Empty>Nada agendado para a próxima semana.</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {upcoming.map(({ subject }) => (
              <div
                key={subject.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <span className="truncate">{subject.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(subject.next_review_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    
      <div className="grid gap-5 lg:grid-cols-2">
        <PriorityRankings limit={6} />
      </div>
    </>
  );
}
