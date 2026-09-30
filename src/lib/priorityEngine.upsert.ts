// Persistência isolada do motor de prioridade.
//
// Única parte do motor que toca no Supabase. Não é conectada ao frontend:
// chame `computePrioritySnapshot` antes e passe o resultado para cá.

import { supabase } from "@/integrations/supabase/client";
import type { PrioritySnapshotResult } from "./priorityEngine";

/**
 * Grava/atualiza o snapshot de prioridade de um assunto em
 * `subject_priority_snapshots` (uma linha por usuário/assunto).
 *
 * @param userId id do usuário autenticado (dono do snapshot)
 * @param subjectId id do assunto
 * @param result resultado devolvido por `computePrioritySnapshot`
 */
export async function upsertSubjectPrioritySnapshot(
  userId: string,
  subjectId: string,
  result: PrioritySnapshotResult,
): Promise<void> {
  const { error } = await supabase.from("subject_priority_snapshots").upsert(
    {
      user_id: userId,
      subject_id: subjectId,
      priority_score: result.priorityScore,
      knowledge_state: result.knowledgeState,
      reason: result.reason,
      question_score: result.questionScore,
      overdue_score: result.overdueScore,
      error_score: result.errorScore,
      stability_score: result.stabilityScore,
      recent_questions: result.recentQuestions,
      recent_accuracy: result.recentAccuracy,
      historical_questions: result.historicalQuestions,
      historical_accuracy: result.historicalAccuracy,
      sample_confidence: result.sampleConfidence,
      sample_is_estimated: result.sampleIsEstimated,
      engine_version: result.engineVersion,
    },
    { onConflict: "user_id,subject_id" },
  );

  if (error) throw error;
}
