import { useState } from "react";
import type { Subject } from "@/lib/data";
import { useRateSubject } from "@/lib/actions";
import { RATING_LABEL, type Rating } from "@/lib/srs";
import { buttonClass, ghostButtonClass, inputClass } from "@/components/bits";

type ReviewType = "questoes" | "flashcards" | "leitura";

const REVIEW_TYPES: { value: ReviewType; icon: string; label: string }[] = [
  { value: "questoes", icon: "❓", label: "Questões" },
  { value: "flashcards", icon: "🃏", label: "Flashcards" },
  { value: "leitura", icon: "📖", label: "Leitura/Resumo" },
];

const FLASHCARD_OPTIONS: { rating: Rating; label: string }[] = [
  { rating: "facil", label: "Fácil" },
  { rating: "bom", label: "Médio" },
  { rating: "dificil", label: "Difícil" },
  { rating: "muito_dificil", label: "Não terminei" },
];

const READING_OPTIONS: { rating: Rating; label: string }[] = [
  { rating: "facil", label: "Entendi bem" },
  { rating: "bom", label: "Entendi razoável" },
  { rating: "dificil", label: "Entendi pouco" },
];

/** Converte o percentual de acerto no rating interno do SRS (0–100). */
export function percentToRating(pct: number): Rating {
  if (pct < 50) return "muito_dificil";
  if (pct < 70) return "dificil";
  if (pct < 85) return "bom";
  return "facil";
}

/**
 * Fluxo de "Registrar revisão" baseado no tipo de revisão. O rating final é
 * convertido para o mesmo formato usado pelo SRS (again/hard/good/easy) e salvo
 * via `useRateSubject`, mantendo a lógica atual intacta.
 */
export function ReviewRecorder({ subject }: { subject: Subject }) {
  const rate = useRateSubject();
  const [type, setType] = useState<ReviewType | null>(null);
  const [total, setTotal] = useState("");
  const [correct, setCorrect] = useState("");

  const reset = () => {
    setType(null);
    setTotal("");
    setCorrect("");
  };

  const submit = (rating: Rating) => {
    rate.mutate({ subject, rating });
    reset();
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!validQuestions || rate.isPending}
              onClick={() => pct !== null && submit(percentToRating(pct))}
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

      {type === "flashcards" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Como foi a sessão?</p>
          <div className="flex flex-wrap gap-2">
            {FLASHCARD_OPTIONS.map((o) => (
              <button
                key={o.rating}
                type="button"
                disabled={rate.isPending}
                onClick={() => submit(o.rating)}
                className={o.rating === "bom" ? buttonClass : ghostButtonClass}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={reset} className={ghostButtonClass}>
            Voltar
          </button>
        </div>
      )}

      {type === "leitura" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Como foi a leitura/resumo?</p>
          <div className="flex flex-wrap gap-2">
            {READING_OPTIONS.map((o) => (
              <button
                key={o.rating}
                type="button"
                disabled={rate.isPending}
                onClick={() => submit(o.rating)}
                className={o.rating === "bom" ? buttonClass : ghostButtonClass}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={reset} className={ghostButtonClass}>
            Voltar
          </button>
        </div>
      )}
    </div>
  );
}
