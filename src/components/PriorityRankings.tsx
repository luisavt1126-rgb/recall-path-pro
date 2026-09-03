import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  EMPTY_STATS,
  deckAccuracy,
  questionStatsBySubject,
  useDeckSessions,
  useDecks,
  useDisciplines,
  useQuestionLogs,
  useSubjects,
} from "@/lib/data";
import { deckPriority, questionPriority, type Reason } from "@/lib/priority";
import { Panel, PriorityTag, Empty } from "@/components/bits";
import { formatDate } from "@/lib/format";

const toneClass: Record<Reason["tone"], string> = {
  rose: "bg-rose/10 text-rose",
  amber: "bg-amber/10 text-amber",
  violet: "bg-violet/10 text-violet",
  sage: "bg-sage/10 text-sage",
};

function Reasons({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <span
          key={r.text}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass[r.tone]}`}
        >
          {r.text}
        </span>
      ))}
    </div>
  );
}

export function useDeckRanking(limit = 6) {
  const { data: decks = [] } = useDecks();
  const { data: subjects = [] } = useSubjects();
  const { data: deckSessions = [] } = useDeckSessions();
  return decks
    .map((deck) => ({
      deck,
      subjectName: subjects.find((s) => s.id === deck.subject_id)?.name ?? null,
      accuracy: deckAccuracy(deckSessions, deck.id),
      ...deckPriority({
        next_review_at: deck.next_review_at,
        last_review_at: deck.last_review_at,
        interval_days: Number(deck.interval_days),
        status: deck.status,
        accuracy: deckAccuracy(deckSessions, deck.id),
      }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}


export function useQuestionRanking(limit = 6) {
  const { data: subjects = [] } = useSubjects();
  const { data: disciplines = [] } = useDisciplines();
  const { data: logs = [] } = useQuestionLogs();
  const stats = questionStatsBySubject(logs);

  return subjects
    .map((subject) => {
      const s = stats.get(subject.id) ?? EMPTY_STATS;
      return {
        subject,
        disciplineName:
          disciplines.find((d) => d.id === subject.discipline_id)?.name ?? "Sem disciplina",
        stats: s,
        ...questionPriority({
          accuracy: s.accuracy,
          total: s.total,
          recentErrors: s.recentErrors,
          exam_incidence: subject.exam_incidence,
        }),
      };
    })
    .filter((r) => r.stats.total > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function DeckRankingList({ limit = 6 }: { limit?: number }) {
  const ranking = useDeckRanking(limit);
  if (ranking.length === 0) {
    return (
      <Empty>
        Cadastre seus baralhos em{" "}
        <Link to="/baralhos" className="text-brand">
          Baralhos
        </Link>{" "}
        para ver este ranking.
      </Empty>
    );
  }
  return (
    <div className="space-y-2.5 text-sm">
      {ranking.map(({ deck, subjectName, level, reasons }) => (
        <div key={deck.id} className="rounded-xl border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{deck.name}</p>
            <PriorityTag level={level} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {subjectName ? `${subjectName} · ` : ""}intervalo {Number(deck.interval_days)}d
            {deck.next_review_at && ` · próxima ${formatDate(deck.next_review_at)}`}
          </p>
          <Reasons reasons={reasons} />
        </div>
      ))}
    </div>
  );
}

export function QuestionRankingList({ limit = 6 }: { limit?: number }) {
  const ranking = useQuestionRanking(limit);
  if (ranking.length === 0) {
    return (
      <Empty>
        Registre blocos de questões em{" "}
        <Link to="/questoes" className="text-brand">
          Questões
        </Link>{" "}
        para ver este ranking.
      </Empty>
    );
  }
  return (
    <div className="space-y-2.5 text-sm">
      {ranking.map(({ subject, disciplineName, stats, level, errorPct, reasons }) => (
        <Link
          key={subject.id}
          to="/assuntos/$id"
          params={{ id: subject.id }}
          className="block rounded-xl border border-border p-3 transition-colors hover:bg-secondary"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">
              {disciplineName} — {subject.name}
            </p>
            <PriorityTag level={level} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {errorPct ?? 0}% de erro · {stats.total} questões · acertos {stats.accuracy ?? 0}%
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-rose"
              style={{ width: `${Math.min(100, errorPct ?? 0)}%` }}
            />
          </div>
          <Reasons reasons={reasons} />
        </Link>
      ))}
    </div>
  );
}

/** Dois rankings independentes, nunca fundidos num índice único. */
export function PriorityRankings({ limit = 5 }: { limit?: number }) {
  const [tab, setTab] = useState<"decks" | "questions">("decks");
  return (
    <>
      <Panel
        title="🃏 Baralhos do Anki para hoje"
        action={
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            atraso · último acesso · intervalo
          </span>
        }
        className="hidden lg:block"
      >
        <DeckRankingList limit={limit} />
      </Panel>

      <Panel
        title="📝 Assuntos por desempenho em questões"
        action={
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            % de erro · erros recentes · incidência
          </span>
        }
        className="hidden lg:block"
      >
        <QuestionRankingList limit={limit} />
      </Panel>

      {/* Mobile: mesmas duas listas separadas, em abas */}
      <Panel className="lg:hidden">
        <div className="mb-4 flex gap-1 rounded-xl bg-secondary p-1 text-xs font-medium">
          <button
            className={`flex-1 rounded-lg px-3 py-2 ${
              tab === "decks" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => setTab("decks")}
          >
            🃏 Baralhos
          </button>
          <button
            className={`flex-1 rounded-lg px-3 py-2 ${
              tab === "questions" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => setTab("questions")}
          >
            📝 Questões
          </button>
        </div>
        {tab === "decks" ? (
          <DeckRankingList limit={limit} />
        ) : (
          <QuestionRankingList limit={limit} />
        )}
      </Panel>
    </>
  );
}
