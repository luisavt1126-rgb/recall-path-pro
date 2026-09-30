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

/** Especialidades pré-cadastradas como assuntos raiz de cada grande área. */
const CORE_SPECIALTIES: Record<(typeof CORE_DISCIPLINES)[number], string[]> = {
  "Clínica Médica": [
    "Cardiologia",
    "Pneumologia",
    "Gastroenterologia",
    "Endocrinologia",
    "Nefrologia",
    "Neurologia",
    "Hematologia",
    "Reumatologia",
    "Infectologia",
    "Dermatologia",
    "Psiquiatria",
    "Geriatria",
  ],
  Cirurgia: [
    "Cirurgia Geral",
    "Cirurgia do Trauma",
    "Urologia",
    "Ortopedia",
    "Cirurgia Vascular",
    "Oftalmologia",
    "Otorrinolaringologia",
    "Anestesiologia",
  ],
  "Ginecologia e Obstetrícia": [
    "Obstetrícia",
    "Ginecologia",
    "Pré-natal",
    "Planejamento Familiar",
  ],
  Pediatria: [
    "Neonatologia",
    "Puericultura",
    "Vacinação",
    "Emergências Pediátricas",
    "Doenças Infecciosas na Infância",
  ],
  "Medicina Preventiva": [
    "Epidemiologia",
    "SUS/Políticas Públicas",
    "Bioética",
    "Saúde da Família",
    "Vigilância em Saúde",
  ],
};

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

/**
 * Cria as especialidades padrão como assuntos raiz de cada grande área,
 * sem duplicar nomes já existentes na mesma disciplina.
 */
function useSeedCoreSpecialties(
  disciplines: { id: string; name: string }[],
  subjects: { name: string; discipline_id: string; parent_id: string | null }[],
  ready: boolean,
) {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    const rows: { discipline_id: string; name: string }[] = [];
    for (const area of CORE_DISCIPLINES) {
      const discipline = disciplines.find(
        (d) => d.name.trim().toLowerCase() === area.toLowerCase(),
      );
      if (!discipline) return; // espera as disciplinas serem criadas
      const existing = new Set(
        subjects
          .filter((s) => s.discipline_id === discipline.id)
          .map((s) => s.name.trim().toLowerCase()),
      );
      for (const name of CORE_SPECIALTIES[area]) {
        if (!existing.has(name.toLowerCase())) {
          rows.push({ discipline_id: discipline.id, name });
        }
      }
    }
    if (rows.length === 0) return;
    ran.current = true;
    (async () => {
      try {
        const userId = await requireUserId();
        const { error } = await supabase
          .from("subjects")
          .insert(rows.map((r) => ({ ...r, user_id: userId, parent_id: null })));
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["subjects"] });
      } catch (e) {
        ran.current = false;
        toast.error((e as Error).message);
      }
    })();
  }, [disciplines, subjects, ready, qc]);
}


function SubjectsPage() {
  const qc = useQueryClient();
  const { data: disciplines = [], isSuccess: disciplinesLoaded } = useDisciplines();
  const { data: subjects = [], isSuccess: subjectsLoaded } = useSubjects();
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
  const [studiedToday, setStudiedToday] = useState(false);

  useSeedCoreDisciplines(disciplines, disciplinesLoaded);
  useSeedCoreSpecialties(disciplines, subjects, disciplinesLoaded && subjectsLoaded);

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
          last_studied_at: studiedToday ? now : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const id = data.id;

      if (prep.video_watched_at || prep.summary_ready_at || prep.deck_ready_at || studiedToday) {
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
      setStudiedToday(false);
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
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={studiedToday}
                    onChange={(e) => setStudiedToday(e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  <span>📚 Já estudei hoje</span>
                </label>
              </div>
            </div>
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
    const mastery = displayMastery(subject, subjects);
    const hasChildren = subjects.some((c) => c.parent_id === subject.id);
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
    );
  }
}
