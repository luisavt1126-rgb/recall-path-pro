import { useEffect, useState } from "react";
import { ERROR_REASONS, useSubjectSubtopics } from "@/lib/data";
import { ERROR_STATUSES, ERROR_STATUS_LABEL } from "@/lib/errorStatus";
import { Combobox } from "@/components/Combobox";
import { Field, inputClass } from "@/components/bits";

/** Um registro de erro a ser criado (bloco = 1 com errorCount; itemizado = 1 por erro). */
export type QuestionErrorSpec = {
  errorCount: number;
  reason: string;
  what: string;
  subtopicName: string;
  /** Status explícito ou null (automático: recorrente/ativo). */
  status: string | null;
};

type ItemDraft = {
  reason: string;
  what: string;
  subtopicName: string;
  status: string;
};

const WHAT_MAX = 280;
const WHAT_PLACEHOLDER = "O que eu errei / o que lembrar? Ex.: GBS rastreia entre 35-37 sem com swab vaginal e anal";

const emptyItem = (): ItemDraft => ({
  reason: ERROR_REASONS[0],
  what: "",
  subtopicName: "",
  status: "ativo",
});

function makeItems(n: number, prev?: ItemDraft[]): ItemDraft[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => prev?.[i] ?? emptyItem());
}

/**
 * Seção opcional "Registrar esses erros no caderno de erros?" com dois modos:
 * - Em bloco: um único registro com errorCount = total de erros;
 * - Erro por erro: um registro por erro, com motivo/what/subassunto/status.
 * Notifica o pai via `onChange` (lista de especs ou null quando desmarcado).
 */
export function QuestionErrorSection({
  subjectId,
  errorCount,
  onChange,
}: {
  subjectId: string;
  errorCount: number;
  onChange: (specs: QuestionErrorSpec[] | null) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"block" | "itemized">("block");
  const [reason, setReason] = useState<string>(ERROR_REASONS[0]);
  const [what, setWhat] = useState("");
  const [subtopicName, setSubtopicName] = useState("");
  const [items, setItems] = useState<ItemDraft[]>(() => makeItems(errorCount));

  const { data: subtopics = [] } = useSubjectSubtopics(subjectId);
  const subtopicOptions = subtopics.map((t) => ({ value: t.name, label: t.name }));

  useEffect(() => {
    setItems((prev) => makeItems(errorCount, prev));
  }, [errorCount]);

  const specs: QuestionErrorSpec[] | null = !enabled
    ? null
    : mode === "block"
      ? [
          {
            errorCount,
            reason,
            what: what.trim(),
            subtopicName: subtopicName.trim(),
            status: null,
          },
        ]
      : items.map((it) => ({
          errorCount: 1,
          reason: it.reason,
          what: it.what.trim(),
          subtopicName: it.subtopicName.trim(),
          status: it.status,
        }));

  useEffect(() => {
    onChange(specs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mode, reason, what, subtopicName, items, errorCount]);

  const patchItem = (i: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-[var(--brand)]"
        />
        <span>
          Registrar esses {errorCount} erro{errorCount === 1 ? "" : "s"} no caderno de erros?
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-1 rounded-lg bg-secondary p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("block")}
              className={`flex-1 rounded-md px-2 py-1 font-medium ${mode === "block" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Em bloco
            </button>
            <button
              type="button"
              onClick={() => setMode("itemized")}
              className={`flex-1 rounded-md px-2 py-1 font-medium ${mode === "itemized" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Erro por erro
            </button>
          </div>

          {mode === "block" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Motivo do erro">
                <select
                  className={inputClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {ERROR_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subassunto (opcional)">
                <Combobox
                  value={subtopicName}
                  onChange={setSubtopicName}
                  options={subtopicOptions}
                  placeholder="Buscar ou digitar subassunto..."
                  emptyText="Nenhum subassunto."
                  allowCreate
                  createLabel={(q) => `Usar "${q}"`}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="O que eu errei / o que lembrar? (opcional)">
                  <textarea
                    className={`${inputClass} min-h-[60px]`}
                    value={what}
                    maxLength={WHAT_MAX}
                    onChange={(e) => setWhat(e.target.value)}
                    placeholder={WHAT_PLACEHOLDER}
                  />
                  <p className="mt-1 text-right text-[10px] text-muted-foreground">
                    {what.length}/{WHAT_MAX}
                  </p>
                </Field>
              </div>
            </div>
          )}

          {mode === "itemized" && (
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-lg border border-border p-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Erro {i + 1}
                  </p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <Field label="Motivo">
                      <select
                        className={inputClass}
                        value={it.reason}
                        onChange={(e) => patchItem(i, { reason: e.target.value })}
                      >
                        {ERROR_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select
                        className={inputClass}
                        value={it.status}
                        onChange={(e) => patchItem(i, { status: e.target.value })}
                      >
                        {ERROR_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ERROR_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Subassunto (opcional)">
                      <Combobox
                        value={it.subtopicName}
                        onChange={(v) => patchItem(i, { subtopicName: v })}
                        options={subtopicOptions}
                        placeholder="Buscar ou digitar..."
                        emptyText="Nenhum subassunto."
                        allowCreate
                        createLabel={(q) => `Usar "${q}"`}
                      />
                    </Field>
                    <div className="sm:col-span-1">
                      <Field label="O que eu errei / o que lembrar?">
                        <textarea
                          className={`${inputClass} min-h-[44px]`}
                          value={it.what}
                          maxLength={WHAT_MAX}
                          onChange={(e) => patchItem(i, { what: e.target.value })}
                          placeholder={WHAT_PLACEHOLDER}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
