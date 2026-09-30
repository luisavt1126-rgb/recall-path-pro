import { supabase } from "@/integrations/supabase/client";
import { nextStatusOnGoodReview, normalizeStatus, statusForNewError } from "./errorStatus";

export type NewQuestionError = {
  subtopicId: string | null;
  errorCount: number;
  reason: string;
  note: string | null;
};

/**
 * Reconcilia o status dos erros após registrar uma revisão por questões:
 * - cria um novo erro (se informado) com status "recorrente" quando já existe
 *   erro para o mesmo assunto, senão "ativo";
 * - se a acurácia (pct) for >= 80%, avança o status dos erros ativos/recorrentes
 *   ("ativo"/"recorrente" -> "em_melhora", "em_melhora" -> "resolvido").
 *
 * Não dispara recálculo — quem chama já o faz em segundo plano.
 */
export async function reconcileErrorsAfterQuestionReview(
  userId: string,
  subjectId: string,
  pct: number,
  newError: NewQuestionError | null,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("question_errors")
    .select("*")
    .eq("subject_id", subjectId);
  if (fetchError) throw fetchError;

  const existing = data ?? [];
  const nonResolved = existing.filter((e) => normalizeStatus(e.status) !== "resolvido");

  if (newError) {
    const { error } = await supabase.from("question_errors").insert({
      user_id: userId,
      subject_id: subjectId,
      subtopic_id: newError.subtopicId || null,
      error_count: newError.errorCount,
      reason: newError.reason,
      note: newError.note,
      status: statusForNewError(nonResolved.length > 0),
    });
    if (error) throw error;
  }

  if (pct >= 80) {
    for (const e of nonResolved) {
      const current = normalizeStatus(e.status);
      const next = nextStatusOnGoodReview(current);
      if (next !== current) {
        await supabase.from("question_errors").update({ status: next }).eq("id", e.id);
      }
    }
  }
}
