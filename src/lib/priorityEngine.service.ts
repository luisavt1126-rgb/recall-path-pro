// Orquestração do motor de prioridade: carrega os dados reais de um assunto,
// monta os inputs (priorityEngine.input), calcula (priorityEngine) e persiste
// (priorityEngine.upsert). Único arquivo do motor que lê do Supabase.

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { computePrioritySnapshot, type PrioritySnapshotResult } from "./priorityEngine";
import {
  upsertSubjectPrioritySnapshot,
  upsertSubjectPrioritySnapshots,
} from "./priorityEngine.upsert";
import { buildAllPriorityInputs } from "./priorityEngine.batch";
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

type DeckSessionRow = Database["public"]["Tables"]["deck_sessions"]["Row"];

/**
 * Recalcula e persiste o snapshot de prioridade de um assunto.
 *
 * @param userId id do usuário autenticado (deve ser o `auth.uid()` atual; as
 *   consultas dependem da RLS para restringir o escopo ao próprio usuário).
 * @param subjectId id do assunto
 * @param now instante de referência (default: agora)
 */
export async function recalculateSubjectPriority(
  userId: string,
  subjectId: string,
  now: Date = new Date(),
): Promise<PrioritySnapshotResult> {
  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("*")
    .eq("id", subjectId)
    .maybeSingle();
  if (subjectError) throw subjectError;
  if (!subject) throw new Error(`Assunto não encontrado: ${subjectId}`);

  const { data: questionLogs, error: questionError } = await supabase
    .from("question_logs")
    .select("*")
    .eq("subject_id", subjectId);
  if (questionError) throw questionError;

  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("*")
    .eq("subject_id", subjectId);
  if (reviewsError) throw reviewsError;

  const { data: studySessions, error: studyError } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("subject_id", subjectId);
  if (studyError) throw studyError;

  const { data: decks, error: decksError } = await supabase
    .from("anki_decks")
    .select("*")
    .eq("subject_id", subjectId);
  if (decksError) throw decksError;

  const deckIds = (decks ?? []).map((d) => d.id);
  let deckSessionRows: DeckSessionRow[] = [];
  if (deckIds.length > 0) {
    const { data, error } = await supabase
      .from("deck_sessions")
      .select("*")
      .in("deck_id", deckIds);
    if (error) throw error;
    deckSessionRows = data ?? [];
  }

  const { data: questionErrors, error: questionErrorsError } = await supabase
    .from("question_errors")
    .select("*")
    .eq("subject_id", subjectId);
  if (questionErrorsError) throw questionErrorsError;

  const rawSubject: RawSubjectContact = {
    nextReviewAt: subject.next_review_at,
    lastStudiedAt: subject.last_studied_at,
    firstStudiedAt: subject.first_studied_at,
    videoWatchedAt: subject.video_watched_at,
    summaryReadyAt: subject.summary_ready_at,
    deckReadyAt: subject.deck_ready_at,
  };

  const input = buildPriorityEngineInput({
    subject: rawSubject,
    questionLogs: (questionLogs ?? []).map(
      (q): RawQuestionLog => ({ createdAt: q.created_at, total: q.total, correct: q.correct }),
    ),
    reviews: (reviews ?? []).map(
      (r): RawReview => ({ rating: r.rating, reviewedAt: r.reviewed_at }),
    ),
    studySessions: (studySessions ?? []).map(
      (s): RawStudySession => ({ startedAt: s.started_at }),
    ),
    decks: (decks ?? []).map((d): RawDeck => ({ nextReviewAt: d.next_review_at })),
    deckSessions: deckSessionRows.map(
      (ds): RawDeckSession => ({ rating: ds.rating, reviewedAt: ds.reviewed_at }),
    ),
    questionErrors: (questionErrors ?? []).map(
      (e): RawQuestionError => ({
        createdAt: e.created_at,
        errorCount: e.error_count,
        reason: e.reason,
        status: e.status,
      }),
    ),
    now,
  });

  const result = computePrioritySnapshot(input);
  await upsertSubjectPrioritySnapshot(userId, subjectId, result);
  return result;
}

/**
 * Recalcula o snapshot de um assunto depois de uma gravação e espera terminar,
 * para que a invalidação das consultas (no `onSuccess` da mutation) já
 * encontre o valor novo. Uma falha aqui nunca derruba a gravação do usuário:
 * apenas registra o aviso — o recálculo diário corrige o snapshot depois.
 */
export async function refreshSubjectPriority(
  userId: string,
  subjectId: string,
): Promise<void> {
  try {
    await recalculateSubjectPriority(userId, subjectId);
  } catch (err) {
    console.warn("Falha ao recalcular prioridade do assunto", subjectId, err);
  }
}

export type RecalculateAllResult = {
  total: number;
  success: number;
  failures: Array<{ subjectId: string; error: string }>;
};

const PAGE_SIZE = 1000;

/** Carrega todas as linhas de uma consulta, paginando de 1.000 em 1.000. */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

/**
 * Recalcula e persiste o snapshot de todos os assuntos do usuário.
 *
 * Carrega cada tabela uma única vez (com paginação, sem os limites dos hooks
 * de tela), agrupa por assunto e grava os snapshots em lote. Usado pelo
 * recálculo diário, para que o atraso cresça com o tempo mesmo sem novos
 * registros. As consultas dependem da RLS para ficar no escopo do usuário.
 *
 * @param userId id do usuário autenticado
 * @param now instante de referência para todos os cálculos (default: agora)
 */
export async function recalculateAllSubjects(
  userId: string,
  now: Date = new Date(),
): Promise<RecalculateAllResult> {
  const [subjects, questionLogs, reviews, studySessions, decks, deckSessions, questionErrors] =
    await Promise.all([
      fetchAllPages((a, b) =>
        supabase
          .from("subjects")
          .select(
            "id, next_review_at, last_studied_at, first_studied_at, video_watched_at, summary_ready_at, deck_ready_at",
          )
          .eq("user_id", userId)
          .order("id")
          .range(a, b),
      ),
      fetchAllPages((a, b) =>
        supabase
          .from("question_logs")
          .select("subject_id, created_at, total, correct")
          .eq("user_id", userId)
          .order("id")
          .range(a, b),
      ),
      fetchAllPages((a, b) =>
        supabase
          .from("reviews")
          .select("subject_id, rating, reviewed_at")
          .eq("user_id", userId)
          .order("id")
          .range(a, b),
      ),
      fetchAllPages((a, b) =>
        supabase
          .from("study_sessions")
          .select("subject_id, started_at")
          .eq("user_id", userId)
          .order("id")
          .range(a, b),
      ),
      fetchAllPages((a, b) =>
        supabase
          .from("anki_decks")
          .select("id, subject_id, next_review_at")
          .eq("user_id", userId)
          .order("id")
          .range(a, b),
      ),
      fetchAllPages((a, b) =>
        supabase
          .from("deck_sessions")
          .select("deck_id, rating, reviewed_at")
          .eq("user_id", userId)
          .order("id")
          .range(a, b),
      ),
      fetchAllPages((a, b) =>
        supabase
          .from("question_errors")
          .select("subject_id, created_at, error_count, reason, status")
          .eq("user_id", userId)
          .order("id")
          .range(a, b),
      ),
    ]);

  const inputs = buildAllPriorityInputs({
    now,
    subjects: subjects.map((s) => ({
      id: s.id,
      nextReviewAt: s.next_review_at,
      lastStudiedAt: s.last_studied_at,
      firstStudiedAt: s.first_studied_at,
      videoWatchedAt: s.video_watched_at,
      summaryReadyAt: s.summary_ready_at,
      deckReadyAt: s.deck_ready_at,
    })),
    questionLogs: questionLogs.map((q) => ({
      subjectId: q.subject_id,
      createdAt: q.created_at,
      total: q.total,
      correct: q.correct,
    })),
    reviews: reviews.map((r) => ({
      subjectId: r.subject_id,
      rating: r.rating,
      reviewedAt: r.reviewed_at,
    })),
    studySessions: studySessions.map((s) => ({
      subjectId: s.subject_id,
      startedAt: s.started_at,
    })),
    decks: decks.map((d) => ({
      id: d.id,
      subjectId: d.subject_id,
      nextReviewAt: d.next_review_at,
    })),
    deckSessions: deckSessions.map((d) => ({
      deckId: d.deck_id,
      rating: d.rating,
      reviewedAt: d.reviewed_at,
    })),
    questionErrors: questionErrors.map((e) => ({
      subjectId: e.subject_id,
      createdAt: e.created_at,
      errorCount: e.error_count,
      reason: e.reason,
      status: e.status,
    })),
  });

  const failures: Array<{ subjectId: string; error: string }> = [];
  const results: Array<{ subjectId: string; result: PrioritySnapshotResult }> = [];
  for (const { subjectId, input } of inputs) {
    try {
      results.push({ subjectId, result: computePrioritySnapshot(input) });
    } catch (err) {
      failures.push({ subjectId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await upsertSubjectPrioritySnapshots(userId, results);

  return { total: inputs.length, success: results.length, failures };
}
