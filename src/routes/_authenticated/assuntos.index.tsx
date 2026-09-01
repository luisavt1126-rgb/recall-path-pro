import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import {
  EMPTY_STATS,
  questionStatsBySubject,
  useDisciplines,
  useQuestionLogs,
  useSubjects,
} from "@/lib/data";
import { questionPriority } from "@/lib/priority";
import { Panel, PriorityTag, Field, inputClass, buttonClass, Empty } from "@/components/bits";
import { PrepIcons } from "@/components/SubjectPrep";
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

function SubjectsPage() {
  const qc = useQueryClient();
  const { data: disciplines = [] } = useDisciplines();
  const { data: subjects = [] } = useSubjects();
  const { data: logs = [] } = useQuestionLogs();
  const stats = questionStatsBySubject(logs);

  const [subjectName, setSubjectName] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [parentId, setParentId] = useState("");
  const [incidence, setIncidence] = useState(3);

  useSeedCoreDisciplines(disciplines);

  // Somente as 5 grandes áreas ficam disponíveis para novos assuntos.
  const coreDisciplines = CORE_DISCIPLINES.map((name) =>
    disciplines.find((d) => d.name.trim().toLowerCase() === name.toLowerCase()),
  ).filter((d): d is NonNullable<typeof d> => Boolean(d));

  const addSubject = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const { error } = await supabase.from("subjects").insert({
        user_id: userId,
        discipline_id: disciplineId,
        parent_id: parentId || null,
        name: subjectName.trim(),
        exam_incidence: incidence,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubjectName("");
      setParentId("");
      qc.invalidateQueries();
      toast.success("Assunto criado");
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
              if (subjectName.trim() && disciplineId) addSubject.mutate();
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Field label="Disciplina">
              <select
                className={inputClass}
                value={disciplineId}
                onChange={(e) => setDisciplineId(e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assunto pai (opcional)">
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
            <Field label="Nome">
              <input
                className={inputClass}
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="Ex.: Insuficiência cardíaca"
              />
            </Field>
            <Field label={`Incidência em provas: ${incidence}`}>
              <input
                type="range"
                min={1}
                max={5}
                value={incidence}
                onChange={(e) => setIncidence(Number(e.target.value))}
                className="w-full accent-[var(--brand)]"
              />
            </Field>
            <div className="sm:col-span-2">
              <button className={buttonClass}>Adicionar assunto</button>
            </div>
          </form>
        </Panel>
      </div>

      {disciplines.length === 0 && <Empty>Cadastre sua primeira disciplina acima.</Empty>}

      {disciplines.map((discipline) => {
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
    </>
  );

  function SubjectRow({ subjectId, nested = false }: { subjectId: string; nested?: boolean }) {
    const subject = subjects.find((s) => s.id === subjectId)!;
    const s = stats.get(subjectId) ?? EMPTY_STATS;
    return (
      <Link
        to="/assuntos/$id"
        params={{ id: subject.id }}
        className="block rounded-lg px-1 py-1 transition-colors hover:bg-secondary"
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
              style={{ width: `${subject.mastery}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            domínio {subject.mastery}% · {subject.review_count} revisões · próxima{" "}
            {formatDate(subject.next_review_at)}
            {s.accuracy !== null && ` · questões ${s.accuracy}%`}
          </p>
        </div>
      </Link>
    );
  }
}
