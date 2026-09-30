import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import { recalculateSubjectPriority } from "@/lib/priorityEngine.service";
import {
  ERROR_REASONS,
  useSubjects,
  useSubjectSubtopics,
  useDisciplines,
  useQuestionLogs,
  useQuestionErrors,
  useSubjectPrioritySnapshots,
} from "@/lib/data";
import { CORE_AREAS } from "@/lib/areas";
import { ERROR_STATUSES, ERROR_STATUS_LABEL, ERROR_STATUS_WEIGHT, normalizeStatus } from "@/lib/errorStatus";
import { Panel, Empty, Field, inputClass, buttonClass, ghostButtonClass } from "@/components/bits";
import { Combobox } from "@/components/Combobox";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/erros")({
  head: () => ({
    meta: [
      { title: "Caderno de erros · Residuum" },
      { name: "description", content: "Erros das questões e assuntos mais fracos." },
      { property: "og:title", content: "Caderno de erros · Residuum" },
      { property: "og:description", content: "Transforme os erros em prioridade de revisão." },
    ],
  }),
  component: ErrosPage,
});

function ErrosPage() {
  const qc = useQueryClient();
  const { data: subjects = [] } = useSubjects();
  const { data: disciplines = [] } = useDisciplines();
  const { data: logs = [] } = useQuestionLogs();
  const { data: errors = [] } = useQuestionErrors();
  const { data: snapshots = [] } = useSubjectPrioritySnapshots();

  const now = new Date();
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // Formulário
  const [areaName, setAreaName] = useState("");
  const [specialtyName, setSpecialtyName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [subtopicName, setSubtopicName] = useState("");
  const [errorCount, setErrorCount] = useState("1");
  const [reason, setReason] = useState<string>(ERROR_REASONS[0]);
  const [note, setNote] = useState("");
  const [what, setWhat] = useState("");
  const [status, setStatus] = useState<string>("ativo");
  const [editingId, setEditingId] = useState<string | null>(null);

  const specialtyDiscipline = disciplines.find((d) => d.name === specialtyName);
  const filteredSubjects = specialtyDiscipline
    ? subjects.filter((s) => s.discipline_id === specialtyDiscipline.id)
    : [];

  const { data: subtopics = [] } = useSubjectSubtopics(subjectId || undefined);

  const resetForm = () => {
    setEditingId(null);
    setAreaName("");
    setSpecialtyName("");
    setSubjectId("");
    setSubtopicName("");
    setErrorCount("1");
    setReason(ERROR_REASONS[0]);
    setNote("");
    setWhat("");
    setStatus("ativo");
  };

  const saveError = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();

      // Resolve o assunto: usa o existente ou cria um novo na especialidade selecionada.
      let resolvedSubjectId = subjectId;
      if (!subjectById.has(subjectId)) {
        const discipline = disciplines.find((d) => d.name === specialtyName);
        if (!discipline) throw new Error("Selecione a especialidade.");
        const { data: created, error: createError } = await supabase
          .from("subjects")
          .insert({ user_id: userId, discipline_id: discipline.id, name: subjectId.trim() })
          .select("id")
          .single();
        if (createError) throw createError;
        resolvedSubjectId = created.id;
      }

      const payload = {
        subject_id: resolvedSubjectId,
        subtopic_name: subtopicName.trim() || null,
        error_count: Number(errorCount) || 1,
        reason,
        note: note.trim() || null,
        what: what.trim() || null,
        status,
      };
      if (editingId) {
        const { error } = await supabase.from("question_errors").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("question_errors").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
      void recalculateSubjectPriority(userId, resolvedSubjectId).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", resolvedSubjectId, err);
      });
    },
    onSuccess: () => {
      resetForm();
      qc.invalidateQueries({ queryKey: ["question_errors"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success(editingId ? "Erro atualizado" : "Erro registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeError = useMutation({
    mutationFn: async ({ id, subjectId }: { id: string; subjectId: string }) => {
      const userId = await requireUserId();
      const { error } = await supabase.from("question_errors").delete().eq("id", id);
      if (error) throw error;
      void recalculateSubjectPriority(userId, subjectId).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", subjectId, err);
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question_errors"] });
      toast.success("Erro removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markResolved = useMutation({
    mutationFn: async ({ id, subjectId }: { id: string; subjectId: string }) => {
      const userId = await requireUserId();
      const { error } = await supabase.from("question_errors").update({ status: "resolvido" }).eq("id", id);
      if (error) throw error;
      void recalculateSubjectPriority(userId, subjectId).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", subjectId, err);
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question_errors"] });
      toast.success("Erro marcado como resolvido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const STATUS_BADGE_CLASS: Record<ReturnType<typeof normalizeStatus>, string> = {
    ativo: "rounded-full bg-rose/10 px-2 py-0.5 text-xs font-semibold text-rose",
    em_melhora: "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600",
    resolvido: "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600",
    recorrente: "rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-600",
  };

  // --- Assuntos fracos ---
  const monthAgo = now.getTime() - 30 * 86_400_000;
  const statsBySubject = new Map<string, { total: number; correct: number; recentErrors: number; errorEntries: number }>();
  for (const l of logs) {
    if (!l.subject_id) continue;
    const st = statsBySubject.get(l.subject_id) ?? { total: 0, correct: 0, recentErrors: 0, errorEntries: 0 };
    st.total += l.total;
    st.correct += l.correct;
    if (new Date(l.created_at).getTime() > monthAgo) st.recentErrors += l.total - l.correct;
    statsBySubject.set(l.subject_id, st);
  }
  for (const e of errors) {
    const weight = ERROR_STATUS_WEIGHT[normalizeStatus(e.status)];
    if (weight <= 0) continue;
    const st = statsBySubject.get(e.subject_id) ?? { total: 0, correct: 0, recentErrors: 0, errorEntries: 0 };
    st.errorEntries += e.error_count * weight;
    if (new Date(e.created_at).getTime() > monthAgo) st.recentErrors += e.error_count * weight;
    statsBySubject.set(e.subject_id, st);
  }
  const snapshotBySubject = new Map(snapshots.map((s) => [s.subject_id, s]));

  const weak = subjects
    .map((s) => {
      const st = statsBySubject.get(s.id) ?? { total: 0, correct: 0, recentErrors: 0, errorEntries: 0 };
      const accuracy = st.total ? Math.round((st.correct / st.total) * 100) : null;
      const errorsCount = st.total - st.correct;
      const overdueDays = s.next_review_at
        ? Math.max(0, Math.floor((now.getTime() - new Date(s.next_review_at).getTime()) / 86_400_000))
        : 0;
      const snap = snapshotBySubject.get(s.id);
      const score =
        (accuracy === null ? 0 : (100 - accuracy) * 1.5) +
        errorsCount * 0.5 +
        st.recentErrors * 2 +
        st.errorEntries * 3 +
        overdueDays * 0.5 +
        (snap ? snap.priority_score * 0.5 : 0);
      return { subject: s, accuracy, errors: errorsCount, recentErrors: st.recentErrors, errorEntries: st.errorEntries, overdueDays, score };
    })
    .filter((x) => x.errors > 0 || x.errorEntries > 0 || x.overdueDays > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const errorSubject = (e: { subject_id: string; subtopic_name: string | null }) => {
    const subject = subjectById.get(e.subject_id)?.name ?? "—";
    return e.subtopic_name ? `${subject} › ${e.subtopic_name}` : subject;
  };

  return (
    <>
      <Panel title="Assuntos fracos">
        {weak.length === 0 ? (
          <Empty>Nenhum assunto fraco ainda. Registre questões e erros para ver o ranking.</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {weak.map(({ subject, accuracy, errors, recentErrors, errorEntries, overdueDays, score }) => (
              <Link
                key={subject.id}
                to="/assuntos/$id"
                params={{ id: subject.id }}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-secondary"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{subject.name}</span>
                <span className="text-xs text-muted-foreground">
                  {accuracy === null ? "—" : `${accuracy}%`} · {errors} erros · {recentErrors} recentes
                  {errorEntries > 0 ? ` · ${errorEntries} no caderno` : ""}
                  {overdueDays > 0 ? ` · ${overdueDays}d atraso` : ""}
                </span>
                <span className="rounded-full bg-rose/10 px-2 py-0.5 text-xs font-semibold text-rose">
                  {Math.round(score)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={editingId ? "Editar erro" : "Registrar erro"}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (subjectId) saveError.mutate();
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Grande área">
            <select
              className={inputClass}
              value={areaName}
              onChange={(e) => {
                setAreaName(e.target.value);
                setSpecialtyName("");
                setSubjectId("");
                setSubtopicName("");
              }}
              required
            >
              <option value="">Selecione</option>
              {CORE_AREAS.map((a) => (
                <option key={a.area} value={a.area}>
                  {a.area}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Especialidade">
            <select
              className={inputClass}
              value={specialtyName}
              onChange={(e) => {
                setSpecialtyName(e.target.value);
                setSubjectId("");
                setSubtopicName("");
              }}
              required
              disabled={!areaName}
            >
              <option value="">Selecione</option>
              {(CORE_AREAS.find((a) => a.area === areaName)?.specialties ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assunto">
            <Combobox
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setSubtopicName("");
              }}
              options={filteredSubjects.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Buscar ou digitar assunto..."
              emptyText="Nenhum assunto nesta especialidade."
              allowCreate
              createLabel={(q) => `Criar assunto "${q}"`}
            />
          </Field>
          <Field label="Subassunto (opcional)">
            <Combobox
              value={subtopicName}
              onChange={setSubtopicName}
              options={subtopics.map((t) => ({ value: t.name, label: t.name }))}
              placeholder="Buscar ou digitar subassunto..."
              emptyText="Nenhum subassunto."
              allowCreate
              createLabel={(q) => `Usar "${q}"`}
            />
          </Field>
          <Field label="Quantidade de erros">
            <input
              className={inputClass}
              inputMode="numeric"
              value={errorCount}
              onChange={(e) => setErrorCount(e.target.value)}
            />
          </Field>
          <Field label="Motivo">
            <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {ERROR_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Observação (opcional)">
              <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: confundi HAS com ICC" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="O que eu errei / o que lembrar? (opcional)">
              <textarea
                className={`${inputClass} min-h-[60px]`}
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder="Ex.: sempre trocar a conduta na hipertensão gestacional"
              />
            </Field>
          </div>
          <Field label="Status">
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              {ERROR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ERROR_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button className={buttonClass} disabled={!subjectId || saveError.isPending}>
              {editingId ? "Salvar alterações" : "Adicionar erro"}
            </button>
            {editingId && (
              <button type="button" className={ghostButtonClass} onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel title={`Caderno de erros (${errors.length})`}>
        {errors.length === 0 ? (
          <Empty>Nenhum erro registrado ainda.</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {errors.map((e) => (
              <div key={e.id} className="flex items-start gap-2 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium">{errorSubject(e)}</p>
                    <span className={`shrink-0 ${STATUS_BADGE_CLASS[normalizeStatus(e.status)]}`}>
                      {ERROR_STATUS_LABEL[normalizeStatus(e.status)]}
                    </span>
                  </div>
                  {e.what && <p className="mt-1 text-sm">💭 {e.what}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.error_count} erro(s) · {e.reason}
                    {e.note ? ` · "${e.note}"` : ""} · {formatDate(e.created_at)}
                  </p>
                </div>
                {normalizeStatus(e.status) !== "resolvido" && (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                    onClick={() => markResolved.mutate({ id: e.id, subjectId: e.subject_id })}
                  >
                    Marcar resolvido
                  </button>
                )}
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditingId(e.id);
                    const subject = subjectById.get(e.subject_id);
                    const discipline = disciplines.find((d) => d.id === subject?.discipline_id);
                    const area = CORE_AREAS.find((a) => a.specialties.includes(discipline?.name ?? ""));
                    setAreaName(area?.area ?? "");
                    setSpecialtyName(discipline?.name ?? "");
                    setSubjectId(e.subject_id);
                    setSubtopicName(e.subtopic_name ?? "");
                    setErrorCount(String(e.error_count));
                    setReason(e.reason);
                    setNote(e.note ?? "");
                    setWhat(e.what ?? "");
                    setStatus(normalizeStatus(e.status));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground hover:text-rose"
                  onClick={() => removeError.mutate({ id: e.id, subjectId: e.subject_id })}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
