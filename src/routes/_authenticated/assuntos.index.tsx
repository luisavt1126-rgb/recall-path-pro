import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId, startSubjectCycle } from "@/lib/actions";
import { recalculateSubjectPriority } from "@/lib/priorityEngine.service";
import {
  EMPTY_STATS,
  questionStatsBySubject,
  displayMastery,
  useDisciplines,
  useQuestionLogs,
  useSubjects,
} from "@/lib/data";
import { questionPriority } from "@/lib/priority";
import { Panel, PriorityTag, Field, inputClass, buttonClass, Empty } from "@/components/bits";
import { PrepIcons, PREP_ITEMS, type PrepKey } from "@/components/SubjectPrep";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/assuntos/")({
  head: () => ({
    meta: [
      { title: "Assuntos · Residuum" },
      {
        name: "description",
        content: "Disciplinas, assuntos e subassuntos com domínio, revisões e desempenho.",
      },
      { property: "og:title", content: "Assuntos · Residuum" },
      { property: "og:description", content: "Organize disciplina → assunto → subassunto." },
    ],
  }),
  component: SubjectsPage,
});

/** As 5 grandes áreas fixas da medicina (não editáveis pela interface). */
const CORE_DISCIPLINES = [
  "Clínica Médica",
  "Cirurgia",
  "Ginecologia e Obstetrícia",
  "Pediatria",
  "Medicina Preventiva",
] as const;

/** Garante que as 5 grandes áreas existam para o usuário, sem duplicar por nome. */
function useSeedCoreDisciplines(disciplines: { name: string }[], ready: boolean) {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    const existing = new Set(disciplines.map((d) => d.name.trim().toLowerCase()));
    const missing = CORE_DISCIPLINES.filter((n) => !existing.has(n.toLowerCase()));
    if (missing.length === 0) return;
    ran.current = true;
    (async () => {
      try {
        const userId = await requireUserId();
        const { error } = await supabase
          .from("disciplines")
          .insert(missing.map((name) => ({ user_id: userId, name })));
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["disciplines"] });
      } catch (e) {
        ran.current = false;
        toast.error((e as Error).message);
      }
    })();
  }, [disciplines, ready, qc]);
}

/** Coleta um assunto e todos os seus descendentes (subassuntos). */
function collectSubjectIds(
  subjects: { id: string; parent_id: string | null }[],
  rootId: string,
): string[] {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const s of subjects) {
      if (s.parent_id && ids.has(s.parent_id) && !ids.has(s.id)) {
        ids.add(s.id);
        added = true;
      }
    }
  }
  return [...ids];
}

function SubjectsPage() {
  const qc = useQueryClient();
  const { data: disciplines = [], isSuccess: disciplinesLoaded } = useDisciplines();
  const { data: subjects = [] } = useSubjects();
  const { data: logs = [] } = useQuestionLogs();
  const stats = questionStatsBySubject(logs);

  const [subjectName, setSubjectName] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [parentId, setParentId] = useState("");
  const [prep, setPrep] = useState<Record<PrepKey, boolean>>({
    video_watched_at: false,
    summary_ready_at: false,
    deck_ready_at: false,
  });
  const [questionsDone, setQuestionsDone] = useState(false);
  const [questionsTotal, setQuestionsTotal] = useState("");
  const [questionsCorrect, setQuestionsCorrect] = useState("");
  const [questionsMinutes, setQuestionsMinutes] = useState("");
  const [confirmClear, setConfirmClear] = useState("");

  useSeedCoreDisciplines(disciplines, disciplinesLoaded);

  // Somente as 5 grandes áreas ficam disponíveis para novos assuntos.
  const coreDisciplines = CORE_DISCIPLINES.map((name) =>
    disciplines.find((d) => d.name.trim().toLowerCase() === name.toLowerCase()),
  ).filter((d): d is NonNullable<typeof d> => Boolean(d));

  const addSubject = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("subjects")
        .insert({
          user_id: userId,
          discipline_id: disciplineId,
          parent_id: parentId || null,
          name: subjectName.trim(),
          video_watched_at: prep.video_watched_at ? now : null,
          summary_ready_at: prep.summary_ready_at ? now : null,
          deck_ready_at: prep.deck_ready_at ? now : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const id = data.id;

      const hasContact =
        prep.video_watched_at || prep.summary_ready_at || prep.deck_ready_at || questionsDone;

      if (questionsDone) {
        const { error: questionsError } = await supabase.from("question_logs").insert({
          user_id: userId,
          subject_id: id,
          discipline_id: disciplineId,
          total: Number(questionsTotal),
          correct: Number(questionsCorrect),
        });
        if (questionsError) throw questionsError;

        const minutes = Number(questionsMinutes);
        if (Number.isFinite(minutes) && minutes > 0) {
          const { error: sessionError } = await supabase.from("study_sessions").insert({
            user_id: userId,
            subject_id: id,
            activity_type: "questoes",
            minutes,
            started_at: now,
          });
          if (sessionError) throw sessionError;
        }
      }

      if (hasContact) {
        await startSubjectCycle(id, now);
      }

      void recalculateSubjectPriority(userId, id).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", id, err);
      });

      return id;
    },
    onSuccess: () => {
      setSubjectName("");
      setParentId("");
      setPrep({ video_watched_at: false, summary_ready_at: false, deck_ready_at: false });
      setQuestionsDone(false);
      setQuestionsTotal("");
      setQuestionsCorrect("");
      setQuestionsMinutes("");
      qc.invalidateQueries();
      toast.success("Assunto criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSubject = useMutation({
    mutationFn: async (subjectId: string) => {
      const ids = collectSubjectIds(subjects, subjectId);

      const { data: decks } = await supabase.from("anki_decks").select("id").in("subject_id", ids);
      const deckIds = (decks ?? []).map((d) => d.id);
      if (deckIds.length > 0) {
        await supabase.from("deck_sessions").delete().in("deck_id", deckIds);
      }
      await supabase.from("anki_decks").delete().in("subject_id", ids);
      await supabase.from("study_sessions").delete().in("subject_id", ids);
      await supabase.from("question_logs").delete().in("subject_id", ids);
      await supabase.from("reviews").delete().in("subject_id", ids);
      await supabase.from("subject_priority_snapshots").delete().in("subject_id", ids);
      const { error } = await supabase.from("subjects").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Assunto excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearAllSubjects = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      await supabase.from("deck_sessions").delete().eq("user_id", userId);
      await supabase.from("anki_decks").delete().eq("user_id", userId);
      await supabase.from("study_sessions").delete().eq("user_id", userId);
      await supabase.from("question_logs").delete().eq("user_id", userId);
      await supabase.from("reviews").delete().eq("user_id", userId);
      await supabase.from("subject_priority_snapshots").delete().eq("user_id", userId);
      const { error } = await supabase.from("subjects").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmClear("");
      qc.invalidateQueries();
      toast.success("Todos os assuntos foram removidos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const levelOf = (subjectId: string) => {
    const subject = subjects.find((s) => s.id === subjectId)!;
    const s = stats.get(subjectId) ?? EMPTY_STATS;
    return questionPriority({
      accuracy: s.accuracy,
      total: s.total,
      recentErrors: s.recentErrors,
      exam_incidence: subject.exam_incidence,
    }).level;
  };

  return (
    <>
      <div className="grid gap-5">
        <Panel title="Novo assunto / subassunto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!subjectName.trim() || !disciplineId) return;
              if (questionsDone) {
                const t = Number(questionsTotal);
                const c = Number(questionsCorrect);
                if (t <= 0 || c < 0 || c > t) {
                  toast.error("Confira as questões: total > 0 e acertos entre 0 e o total");
                  return;
                }
              }
              addSubject.mutate();
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Field label="Grande área">
              <select
                className={inputClass}
                value={disciplineId}
                onChange={(e) => setDisciplineId(e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {coreDisciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Especialidade (opcional)">
              <select
                className={inputClass}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Nenhum</option>
                {subjects
                  .filter((s) => s.discipline_id === disciplineId && !s.parent_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Nome">
                <input
                  className={inputClass}
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="Ex.: Insuficiência cardíaca"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Preparo inicial (opcional)</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {PREP_ITEMS.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={prep[item.key]}
                      onChange={(e) =>
                        setPrep((p) => ({ ...p, [item.key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                    <span>
                      {item.icon} {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={questionsDone}
                  onChange={(e) => setQuestionsDone(e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                <span>❓ Fiz questões no primeiro contato</span>
              </label>
              {questionsDone && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="Quantas questões fiz?"
                    value={questionsTotal}
                    onChange={(e) => setQuestionsTotal(e.target.value)}
                    aria-label="Quantas questões fiz"
                  />
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="Quantas acertei?"
                    value={questionsCorrect}
                    onChange={(e) => setQuestionsCorrect(e.target.value)}
                    aria-label="Quantas questões acertei"
                  />
                  <input
                    className={`${inputClass} sm:col-span-2`}
                    inputMode="numeric"
                    placeholder="Tempo (min) — opcional"
                    value={questionsMinutes}
                    onChange={(e) => setQuestionsMinutes(e.target.value)}
                    aria-label="Tempo em minutos (opcional)"
                  />
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <button className={buttonClass}>Adicionar assunto</button>
            </div>
          </form>
        </Panel>
      </div>

      {disciplines.length === 0 && <Empty>Cadastre sua primeira disciplina acima.</Empty>}

      {disciplines.length > 0 && subjects.length === 0 && (
        <Empty>Nenhum assunto cadastrado ainda. Adicione seu primeiro assunto.</Empty>
      )}

      {subjects.length > 0 && disciplines.map((discipline) => {
        const roots = subjects.filter(
          (s) => s.discipline_id === discipline.id && !s.parent_id,
        );
        return (
          <Panel key={discipline.id} title={discipline.name}>
            {roots.length === 0 ? (
              <Empty>Nenhum assunto ainda.</Empty>
            ) : (
              <div className="space-y-2">
                {roots.map((subject) => {
                  const children = subjects.filter((s) => s.parent_id === subject.id);
                  return (
                    <div key={subject.id} className="rounded-xl border border-border p-3">
                      <SubjectRow subjectId={subject.id} />
                      {children.length > 0 && (
                        <div className="mt-2 space-y-2 border-l border-border pl-3">
                          {children.map((child) => (
                            <SubjectRow key={child.id} subjectId={child.id} nested />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        );
      })}

      <Panel title="Limpar assuntos">
        <p className="text-sm text-muted-foreground">
          Apaga todos os assuntos e seus dados vinculados (revisões, questões, sessões,
          baralhos e snapshots). As 5 grandes áreas permanecem. Esta ação não pode ser desfeita.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className={inputClass}
            value={confirmClear}
            onChange={(e) => setConfirmClear(e.target.value)}
            placeholder="Digite LIMPAR para confirmar"
            aria-label="Digite LIMPAR para confirmar"
          />
          <button
            type="button"
            className={buttonClass}
            disabled={confirmClear.trim().toUpperCase() !== "LIMPAR" || clearAllSubjects.isPending}
            onClick={() => clearAllSubjects.mutate()}
          >
            Limpar todos os assuntos
          </button>
        </div>
      </Panel>
    </>
  );

  function SubjectRow({ subjectId, nested = false }: { subjectId: string; nested?: boolean }) {
    const subject = subjects.find((s) => s.id === subjectId)!;
    const s = stats.get(subjectId) ?? EMPTY_STATS;
    const mastery = displayMastery(subject, subjects);
    const hasChildren = subjects.some((c) => c.parent_id === subject.id);
    return (
      <div className="flex items-start gap-2">
        <Link
          to="/assuntos/$id"
          params={{ id: subject.id }}
          className="block min-w-0 flex-1 rounded-lg px-1 py-1 transition-colors hover:bg-secondary"
        >
          <div className="flex items-start justify-between gap-2">
            <p className={`font-medium ${nested ? "text-sm" : ""}`}>{subject.name}</p>
            <div className="flex shrink-0 items-center gap-2">
              <PrepIcons subject={subject} />
              <PriorityTag level={levelOf(subject.id)} />
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${mastery}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              domínio {mastery}%{hasChildren ? " (média dos subtópicos)" : ""} · {subject.review_count} revisões · próxima{" "}
              {formatDate(subject.next_review_at)}
              {s.accuracy !== null && ` · questões ${s.accuracy}%`}
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Excluir "${subject.name}" e todos os dados vinculados?`)) {
              deleteSubject.mutate(subject.id);
            }
          }}
          disabled={deleteSubject.isPending}
          className="mt-1 shrink-0 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-rose"
          title="Excluir assunto"
          aria-label={`Excluir ${subject.name}`}
        >
          Excluir
        </button>
      </div>
    );
  }
}
