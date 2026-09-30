// Orquestração do motor de prioridade: carrega os dados reais de um assunto,
// monta os inputs (priorityEngine.input), calcula (priorityEngine) e persiste
// (priorityEngine.upsert). Único arquivo desta etapa que toca no Supabase.
//
// Isolado e sem consumidores: nenhuma tela chama esta função ainda.

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { computePrioritySnapshot, type PrioritySnapshotResult } from "./priorityEngine";
import { upsertSubjectPrioritySnapshot } from "./priorityEngine.upsert";
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
      (e): RawQuestionError => ({ createdAt: e.created_at, errorCount: e.error_count, reason: e.reason }),
    ),
    now,
  });

  const result = computePrioritySnapshot(input);
  await upsertSubjectPrioritySnapshot(userId, subjectId, result);
  return result;
}

export type RecalculateAllResult = {
  total: number;
  success: number;
  failures: Array<{ subjectId: string; error: string }>;
};

/**
 * Recalcula e persiste o snapshot de todos os assuntos do usuário, um a um.
 * Falhas individuais não interrompem o lote: são coletadas e devolvidas no
 * resumo. Isolada, sem consumidores no frontend.
 *
 * @param userId id do usuário autenticado
 * @param now instante de referência para todos os cálculos (default: agora)
 */
export async function recalculateAllSubjects(
  userId: string,
  now: Date = new Date(),
): Promise<RecalculateAllResult> {
  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("id")
    .eq("user_id", userId);
  if (error) throw error;

  const list = subjects ?? [];
  const failures: Array<{ subjectId: string; error: string }> = [];
  let success = 0;

  for (const subject of list) {
    try {
      await recalculateSubjectPriority(userId, subject.id, now);
      success += 1;
    } catch (err) {
      failures.push({
        subjectId: subject.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { total: list.length, success, failures };
}
