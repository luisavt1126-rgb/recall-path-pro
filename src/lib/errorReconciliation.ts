import { supabase } from "@/integrations/supabase/client";
import { nextStatusOnGoodReview, normalizeStatus, statusForNewError } from "./errorStatus";

export type NewQuestionError = {
  errorCount: number;
  reason: string;
  what?: string | null;
  subtopicId?: string | null;
  subtopicName?: string | null;
  /** Status explícito (ativo/em_melhora/resolvido/recorrente). Ausente = automático. */
  status?: string | null;
};

/**
 * Reconcilia o status dos erros após registrar uma revisão por questões:
 * - cria um ou mais erros (se informados), cada um com status explícito ou
 *   "recorrente" (quando já existe erro para o mesmo assunto) / "ativo";
 * - se a acurácia (pct) for >= 80%, avança o status dos erros ativos/recorrentes
 *   ("ativo"/"recorrente" -> "em_melhora", "em_melhora" -> "resolvido").
 *
 * Não dispara recálculo — quem chama já o faz em segundo plano.
 */
export async function reconcileErrorsAfterQuestionReview(
  userId: string,
  subjectId: string,
  pct: number,
  newErrors: NewQuestionError[] | null,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("question_errors")
    .select("*")
    .eq("subject_id", subjectId);
  if (fetchError) throw fetchError;

  const existing = data ?? [];
  const nonResolved = existing.filter((e) => normalizeStatus(e.status) !== "resolvido");

  if (newErrors && newErrors.length > 0) {
    for (const ne of newErrors) {
      const status = ne.status
        ? normalizeStatus(ne.status)
        : statusForNewError(nonResolved.length > 0);
      const { error } = await supabase.from("question_errors").insert({
        user_id: userId,
        subject_id: subjectId,
        subtopic_id: ne.subtopicId || null,
        subtopic_name: ne.subtopicName?.trim() || null,
        error_count: ne.errorCount,
        reason: ne.reason,
        what: ne.what?.trim() || null,
        status,
      });
      if (error) throw error;
    }
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
