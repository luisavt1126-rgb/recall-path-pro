import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId, startSubjectCycle } from "@/lib/actions";
import { recalculateSubjectPriority } from "@/lib/priorityEngine.service";
import { CORE_AREAS } from "@/lib/areas";
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
import { QuestionErrorSection, type QuestionErrorData } from "@/components/QuestionErrorSection";
import { reconcileErrorsAfterQuestionReview } from "@/lib/errorReconciliation";
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

/** Garante que as especialidades (classificadores) existam, sem duplicar. */
function useSeedCoreAreas(disciplines: { id: string; name: string }[], ready: boolean) {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    const expected = new Set(
      CORE_AREAS.flatMap((a) => a.specialties).map((n) => n.trim().toLowerCase()),
    );
    const actual = new Set(disciplines.map((d) => d.name.trim().toLowerCase()));
    const needsReseed =
      expected.size !== actual.size || [...expected].some((n) => !actual.has(n));
    if (!needsReseed) return;
    ran.current = true;
    (async () => {
      try {
        const userId = await requireUserId();
        await supabase.from("disciplines").delete().eq("user_id", userId);
        const all = CORE_AREAS.flatMap((a) =>
          a.specialties.map((name) => ({ user_id: userId, name })),
        );
        const { error } = await supabase.from("disciplines").insert(all);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["disciplines"] });
      } catch (e) {
        ran.current = false;
        toast.error((e as Error).message);
      }
    })();
  }, [disciplines, ready, qc]);
}

function SubjectsPage() {
  const qc = useQueryClient();
  const { data: disciplines = [], isSuccess: disciplinesLoaded } = useDisciplines();
  const { data: subjects = [] } = useSubjects();
  const { data: logs = [] } = useQuestionLogs();
  const stats = questionStatsBySubject(logs);

  const [subjectName, setSubjectName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [specialtyName, setSpecialtyName] = useState("");
  const [prep, setPrep] = useState<Record<PrepKey, boolean>>({
    video_watched_at: false,
    summary_ready_at: false,
    deck_ready_at: false,
  });
  const [questionsDone, setQuestionsDone] = useState(false);
  const [questionsTotal, setQuestionsTotal] = useState("");
  const [questionsCorrect, setQuestionsCorrect] = useState("");
  const [questionsMinutes, setQuestionsMinutes] = useState("");
  const [errorData, setErrorData] = useState<QuestionErrorData | null>(null);
  const [subtopicsInput, setSubtopicsInput] = useState("");
  const [confirmClear, setConfirmClear] = useState("");

  useSeedCoreAreas(disciplines, disciplinesLoaded);

  // Especialidades (hardcoded) do nível selecionado.
  const selectedAreaSpecialties =
    CORE_AREAS.find((a) => a.area === areaName)?.specialties ?? [];

  const addSubject = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const specialtyDiscipline = disciplines.find((d) => d.name === specialtyName);
      if (!specialtyDiscipline) throw new Error("Especialidade não encontrada. Recarregue a página.");
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("subjects")
        .insert({
          user_id: userId,
          discipline_id: specialtyDiscipline.id,
          name: subjectName.trim(),
          video_watched_at: prep.video_watched_at ? now : null,
          summary_ready_at: prep.summary_ready_at ? now : null,
          deck_ready_at: prep.deck_ready_at ? now : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const id = data.id;

      const subtopicNames = subtopicsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (subtopicNames.length > 0) {
        const { error: subtopicsError } = await supabase.from("subject_subtopics").insert(
          subtopicNames.map((n) => ({ user_id: userId, subject_id: id, name: n })),
        );
        if (subtopicsError) throw subtopicsError;
      }

      const hasContact =
        prep.video_watched_at || prep.summary_ready_at || prep.deck_ready_at || questionsDone;

      if (questionsDone) {
        const { error: questionsError } = await supabase.from("question_logs").insert({
          user_id: userId,
          subject_id: id,
          discipline_id: specialtyDiscipline.id,
          total: Number(questionsTotal),
          correct: Number(questionsCorrect),
        });
        if (questionsError) throw questionsError;

        const questionsPct =
          Number(questionsTotal) > 0
            ? Math.round((Number(questionsCorrect) / Number(questionsTotal)) * 100)
            : 0;
        await reconcileErrorsAfterQuestionReview(
          userId,
          id,
          questionsPct,
          errorData
            ? {
                subtopicId: errorData.subtopicId || null,
                errorCount: Number(questionsTotal) - Number(questionsCorrect),
                reason: errorData.reason,
                note: errorData.note.trim() || null,
              }
            : null,
        );

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
      setSpecialtyName("");
      setPrep({ video_watched_at: false, summary_ready_at: false, deck_ready_at: false });
      setQuestionsDone(false);
      setQuestionsTotal("");
      setQuestionsCorrect("");
      setQuestionsMinutes("");
      setErrorData(null);
      setSubtopicsInput("");
      qc.invalidateQueries();
      toast.success("Assunto criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSubject = useMutation({
    mutationFn: async (subjectId: string) => {
      const { data: decks } = await supabase.from("anki_decks").select("id").eq("subject_id", subjectId);
      const deckIds = (decks ?? []).map((d) => d.id);
      if (deckIds.length > 0) {
        await supabase.from("deck_sessions").delete().in("deck_id", deckIds);
      }
      await supabase.from("anki_decks").delete().eq("subject_id", subjectId);
      await supabase.from("study_sessions").delete().eq("subject_id", subjectId);
      await supabase.from("question_logs").delete().eq("subject_id", subjectId);
      await supabase.from("question_errors").delete().eq("subject_id", subjectId);
      await supabase.from("reviews").delete().eq("subject_id", subjectId);
      await supabase.from("subject_priority_snapshots").delete().eq("subject_id", subjectId);
      const { error } = await supabase.from("subjects").delete().eq("id", subjectId);
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
      await supabase.from("question_errors").delete().eq("user_id", userId);
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
              if (!subjectName.trim() || !areaName || !specialtyName) return;
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
                value={areaName}
                onChange={(e) => {
                  setAreaName(e.target.value);
                  setSpecialtyName("");
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
                onChange={(e) => setSpecialtyName(e.target.value)}
                required
                disabled={!areaName}
              >
                <option value="">Selecione</option>
                {selectedAreaSpecialties.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Assunto">
                <input
                  className={inputClass}
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="Ex.: Fibrilação Atrial"
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
              {questionsDone && Number(questionsTotal) > Number(questionsCorrect) && (
                <QuestionErrorSection
                  subjectId=""
                  errorCount={Number(questionsTotal) - Number(questionsCorrect)}
                  onChange={setErrorData}
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <Field label="Subassuntos (separados por vírgula)">
                <input
                  className={inputClass}
                  value={subtopicsInput}
                  onChange={(e) => setSubtopicsInput(e.target.value)}
                  placeholder="Ex.: DM em adultos, Medicamentos, Insulinoterapia"
                />
              </Field>
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

      {subjects.length > 0 && CORE_AREAS.map(({ area, specialties }) => {
        const areaSpecialties = specialties
          .map((name) => disciplines.find((d) => d.name === name))
          .filter((d): d is NonNullable<typeof d> => Boolean(d));
        const hasSubjects = areaSpecialties.some(
          (spec) => subjects.some((s) => s.discipline_id === spec.id),
        );
        return (
          <Panel key={area} title={area}>
            {!hasSubjects ? (
              <Empty>Nenhum assunto ainda.</Empty>
            ) : (
              areaSpecialties.map((spec) => {
                const specSubjects = subjects.filter((s) => s.discipline_id === spec.id);
                if (specSubjects.length === 0) return null;
                return (
                  <div key={spec.id} className="mb-3 last:mb-0">
                    <p className="text-sm font-semibold text-muted-foreground">{spec.name}</p>
                    <div className="mt-1 space-y-2">
                      {specSubjects.map((subject) => (
                        <div key={subject.id} className="rounded-xl border border-border p-3">
                          <SubjectRow subjectId={subject.id} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </Panel>
        );
      })}

      <Panel title="Limpar assuntos">
        <p className="text-sm text-muted-foreground">
          Apaga todos os assuntos e seus dados vinculados (revisões, questões, sessões,
          baralhos e snapshots). As áreas/especialidades permanecem. Esta ação não pode ser desfeita.
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

  function SubjectRow({ subjectId }: { subjectId: string }) {
    const subject = subjects.find((s) => s.id === subjectId)!;
    const s = stats.get(subjectId) ?? EMPTY_STATS;
    const mastery = displayMastery(subject, subjects);
    return (
      <div className="flex items-start gap-2">
        <Link
          to="/assuntos/$id"
          params={{ id: subject.id }}
          className="block min-w-0 flex-1 rounded-lg px-1 py-1 transition-colors hover:bg-secondary"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{subject.name}</p>
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
              domínio {mastery}% · {subject.review_count} revisões · próxima{" "}
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
