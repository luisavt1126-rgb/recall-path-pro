// Montagem em lote dos inputs do motor para todos os assuntos do usuário.
//
// Puro (sem Supabase): recebe as linhas já carregadas de cada tabela, agrupa
// por assunto e devolve um `PriorityEngineInput` por assunto. Assim o
// recálculo diário faz poucas consultas no total, em vez de ~7 por assunto.

import type { PriorityEngineInput } from "./priorityEngine";
import {
  buildPriorityEngineInput,
  type RawDeck,
  type RawDeckSession,
  type RawQuestionError,
  type RawQuestionLog,
  type RawReview,
  type RawStudySession,
  type RawSubjectContact,
} from "./priorityEngine.input";

export type BatchSubjectRow = RawSubjectContact & { id: string; disciplineId?: string | null };
export type BatchQuestionLogRow = RawQuestionLog & { subjectId: string | null };
export type BatchReviewRow = RawReview & { subjectId: string | null };
export type BatchStudySessionRow = RawStudySession & { subjectId: string | null };
export type BatchDeckRow = RawDeck & {
  id: string;
  subjectId: string | null;
  /** Baralho da especialidade inteira (vale quando não há aula ligada). */
  disciplineId?: string | null;
};
export type BatchDeckSessionRow = RawDeckSession & { deckId: string };
export type BatchQuestionErrorRow = RawQuestionError & { subjectId: string | null };

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue; // registros sem assunto são métricas gerais, não evidência
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export function buildAllPriorityInputs(params: {
  subjects: BatchSubjectRow[];
  questionLogs: BatchQuestionLogRow[];
  reviews: BatchReviewRow[];
  studySessions: BatchStudySessionRow[];
  decks: BatchDeckRow[];
  deckSessions: BatchDeckSessionRow[];
  questionErrors: BatchQuestionErrorRow[];
  now: Date;
}): Array<{ subjectId: string; input: PriorityEngineInput }> {
  const logsBySubject = groupBy(params.questionLogs, (r) => r.subjectId);
  const reviewsBySubject = groupBy(params.reviews, (r) => r.subjectId);
  const studyBySubject = groupBy(params.studySessions, (r) => r.subjectId);
  const decksBySubject = groupBy(params.decks, (r) => r.subjectId);
  const errorsBySubject = groupBy(params.questionErrors, (r) => r.subjectId);

  const subjectOfDeck = new Map<string, string>();
  for (const deck of params.decks) {
    if (deck.subjectId) subjectOfDeck.set(deck.id, deck.subjectId);
  }
  const deckSessionsBySubject = groupBy(
    params.deckSessions,
    (r) => subjectOfDeck.get(r.deckId) ?? null,
  );

  // Baralhos ligados só à especialidade: sessões agrupadas por disciplina.
  const disciplineOfDeck = new Map<string, string>();
  for (const deck of params.decks) {
    if (!deck.subjectId && deck.disciplineId) disciplineOfDeck.set(deck.id, deck.disciplineId);
  }
  const deckSessionsByDiscipline = groupBy(
    params.deckSessions,
    (r) => disciplineOfDeck.get(r.deckId) ?? null,
  );

  return params.subjects.map((subject) => ({
    subjectId: subject.id,
    input: buildPriorityEngineInput({
      subject,
      questionLogs: logsBySubject.get(subject.id) ?? [],
      reviews: reviewsBySubject.get(subject.id) ?? [],
      studySessions: studyBySubject.get(subject.id) ?? [],
      decks: decksBySubject.get(subject.id) ?? [],
      deckSessions: deckSessionsBySubject.get(subject.id) ?? [],
      questionErrors: errorsBySubject.get(subject.id) ?? [],
      specialtyDeckSessions: subject.disciplineId
        ? (deckSessionsByDiscipline.get(subject.disciplineId) ?? [])
        : [],
      now: params.now,
    }),
  }));
}

/**
 * Decide se o recálculo diário precisa rodar: há assunto sem snapshot, algum
 * snapshot foi calculado antes do início do dia de hoje (o atraso muda com o
 * tempo) ou foi calculado por outra versão do motor.
 */
export function needsDailyRecalculation(params: {
  subjectIds: string[];
  snapshots: Array<{ subject_id: string; calculated_at: string; engine_version: string }>;
  engineVersion: string;
  now: Date;
}): boolean {
  const { subjectIds, snapshots, engineVersion, now } = params;
  if (subjectIds.length === 0) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const bySubject = new Map(snapshots.map((s) => [s.subject_id, s]));
  return subjectIds.some((id) => {
    const snap = bySubject.get(id);
    if (!snap) return true;
    if (snap.engine_version !== engineVersion) return true;
    return new Date(snap.calculated_at).getTime() < startOfToday;
  });
}
