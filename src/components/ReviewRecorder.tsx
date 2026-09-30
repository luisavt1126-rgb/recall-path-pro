import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId, useRateSubject } from "@/lib/actions";
import type { Subject } from "@/lib/data";
import { RATING_LABEL, type Rating } from "@/lib/srs";
import { buttonClass, ghostButtonClass, inputClass } from "@/components/bits";
import { QuestionErrorSection, type QuestionErrorSpec } from "@/components/QuestionErrorSection";
import { reconcileErrorsAfterQuestionReview } from "@/lib/errorReconciliation";

type ReviewType = "questoes" | "anki";

const REVIEW_TYPES: { value: ReviewType; icon: string; label: string }[] = [
  { value: "questoes", icon: "❓", label: "Questões" },
  { value: "anki", icon: "🃏", label: "Anki / Flashcards" },
];

/** Converte o percentual de acerto no rating interno do SRS (0–100). */
export function percentToRating(pct: number): Rating {
  if (pct < 50) return "muito_dificil";
  if (pct < 70) return "dificil";
  if (pct < 85) return "bom";
  return "facil";
}

/** Converte a conclusão da sessão de Anki/Flashcards no rating do SRS. */
export function ankiCompletionToRating(
  concluiu: boolean | null,
  planned: number,
  done: number,
): Rating | null {
  if (concluiu === null) return null;
  if (concluiu === false) return "muito_dificil";
  if (planned > 0 && done >= planned) return "facil";
  return "bom";
}

/**
 * Fluxo de "Registrar revisão" separado por tipo:
 * - Questões: desempenho real (fez/acertou → % → rating).
 * - Anki/Flashcards: execução e regularidade (concluiu a sessão?).
 * Videoaula/resumo não entram aqui — ficam no checklist de preparo do assunto.
 */
export function ReviewRecorder({
  subject,
  initialType,
}: {
  subject: Subject;
  initialType?: ReviewType;
}) {
  const rate = useRateSubject();

  const [type, setType] = useState<ReviewType | null>(initialType ?? null);
  const [total, setTotal] = useState("");
  const [correct, setCorrect] = useState("");
  const [planned, setPlanned] = useState("");
  const [done, setDone] = useState("");
  const [concluiu, setConcluiu] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState("");
  const [errorData, setErrorData] = useState<QuestionErrorSpec[] | null>(null);

  const reset = () => {
    setType(null);
    setTotal("");
    setCorrect("");
    setPlanned("");
    setDone("");
    setConcluiu(null);
    setMinutes("");
    setErrorData(null);
  };

  const minutesNum = Number(minutes);
  const minutesValue = Number.isFinite(minutesNum) && minutesNum > 0 ? minutesNum : 0;

  const submit = async (rating: Rating, activityType: string) => {
    try {
      if (activityType === "questoes") {
        const userId = await requireUserId();
        const { error: logError } = await supabase.from("question_logs").insert({
          user_id: userId,
          subject_id: subject.id,
          total: totalNum,
          correct: correctNum,
        });
        if (logError) throw logError;

        const reviewPct = totalNum > 0 ? Math.round((correctNum / totalNum) * 100) : 0;
        await reconcileErrorsAfterQuestionReview(
          userId,
          subject.id,
          reviewPct,
          errorData
            ? errorData.map((spec) => ({
                errorCount: spec.errorCount,
                reason: spec.reason,
                what: spec.what || null,
                subtopicName: spec.subtopicName || null,
                status: spec.status,
              }))
            : null,
        );
      }
      rate.mutate({ subject, rating, minutes: minutesValue, activityType });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar revisão");
    }
  };

  const totalNum = Number(total);
  const correctNum = Number(correct);
  const validQuestions =
    total.trim() !== "" &&
    totalNum > 0 &&
    correct.trim() !== "" &&
    correctNum >= 0 &&
    correctNum <= totalNum;
  const pct = validQuestions ? Math.round((correctNum / totalNum) * 100) : null;

  const ankiRating = ankiCompletionToRating(concluiu, Number(planned), Number(done));

  return (
    <div className="space-y-3">
      {type === null && (
        <div className="flex flex-wrap gap-2">
          {REVIEW_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={ghostButtonClass}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      {type === "questoes" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="Quantas fez?"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              aria-label="Quantas questões fez"
            />
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="Quantas acertou?"
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
              aria-label="Quantas questões acertou"
            />
          </div>
          {pct !== null && (
            <p className="text-sm text-muted-foreground">
              Acerto: {pct}% → {RATING_LABEL[percentToRating(pct)]}
            </p>
          )}
          <input
            className={inputClass}
            inputMode="numeric"
            placeholder="Tempo (min) — opcional"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            aria-label="Tempo em minutos (opcional)"
          />
          {validQuestions && totalNum - correctNum > 0 && (
            <QuestionErrorSection
              subjectId={subject.id}
              errorCount={totalNum - correctNum}
              onChange={setErrorData}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!validQuestions || rate.isPending}
              onClick={() => pct !== null && submit(percentToRating(pct), "questoes")}
              className={buttonClass}
            >
              Registrar revisão
            </button>
            <button type="button" onClick={reset} className={ghostButtonClass}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {type === "anki" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="Cards planejados hoje"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              aria-label="Cards planejados hoje"
            />
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="Cards feitos"
              value={done}
              onChange={(e) => setDone(e.target.value)}
              aria-label="Cards feitos"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Concluiu a sessão?</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setConcluiu(true)}
                className={concluiu === true ? buttonClass : ghostButtonClass}
              >
                Sim
              </button>
              <button
                type="button"
                onClick={() => setConcluiu(false)}
                className={concluiu === false ? buttonClass : ghostButtonClass}
              >
                Não
              </button>
            </div>
          </div>
          <input
            className={inputClass}
            inputMode="numeric"
            placeholder="Tempo (min) — opcional"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            aria-label="Tempo em minutos (opcional)"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={concluiu === null || rate.isPending}
              onClick={() => ankiRating !== null && submit(ankiRating, "flashcards")}
              className={buttonClass}
            >
              Registrar revisão
            </button>
            <button type="button" onClick={reset} className={ghostButtonClass}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
