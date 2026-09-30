import { useState } from "react";
import { ERROR_REASONS, useSubjectSubtopics } from "@/lib/data";
import { Field, inputClass } from "@/components/bits";

export type QuestionErrorData = {
  reason: string;
  note: string;
  subtopicId: string;
};

/**
 * Seção opcional "Registrar esses erros no caderno de erros?".
 * Aparece quando há erros (acertos < total). Gerencia o próprio estado e
 * notifica o pai via `onChange` (null quando desmarcado).
 */
export function QuestionErrorSection({
  subjectId,
  errorCount,
  onChange,
}: {
  subjectId: string;
  errorCount: number;
  onChange: (data: QuestionErrorData | null) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [reason, setReason] = useState<string>(ERROR_REASONS[0]);
  const [note, setNote] = useState("");
  const [subtopicId, setSubtopicId] = useState("");
  const { data: subtopics = [] } = useSubjectSubtopics(subjectId);

  const emit = (nextEnabled: boolean, nextReason: string, nextNote: string, nextSubtopicId: string) => {
    onChange(
      nextEnabled
        ? { reason: nextReason, note: nextNote, subtopicId: nextSubtopicId }
        : null,
    );
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            emit(e.target.checked, reason, note, subtopicId);
          }}
          className="h-4 w-4 accent-[var(--brand)]"
        />
        <span>
          Registrar esses {errorCount} erro{errorCount === 1 ? "" : "s"} no caderno de erros?
        </span>
      </label>

      {enabled && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Field label="Motivo do erro">
            <select
              className={inputClass}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                emit(enabled, e.target.value, note, subtopicId);
              }}
            >
              {ERROR_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          {subtopics.length > 0 && (
            <Field label="Subassunto (opcional)">
              <select
                className={inputClass}
                value={subtopicId}
                onChange={(e) => {
                  setSubtopicId(e.target.value);
                  emit(enabled, reason, note, e.target.value);
                }}
              >
                <option value="">Nenhum</option>
                {subtopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className={subtopics.length > 0 ? "sm:col-span-2" : ""}>
            <Field label="Observação (opcional)">
              <input
                className={inputClass}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  emit(enabled, reason, e.target.value, subtopicId);
                }}
                placeholder="Ex.: confundi conceitos"
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
