import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  requireUserId,
  startSubjectCycle,
  nudgeMasteryFromQuestions,
} from "@/lib/actions";
import { useDisciplines, useQuestionLogs, useSubjects } from "@/lib/data";
import { recalculateSubjectPriority } from "@/lib/priorityEngine.service";
import { Panel, Stat, Empty, Field, inputClass, buttonClass } from "@/components/bits";
import { formatDate, toDateInputValue, dateInputToIso } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/questoes")({
  head: () => ({
    meta: [
      { title: "Questões · Residuum" },
      {
        name: "description",
        content: "Registre questões por assunto e banca e acompanhe sua taxa de acerto.",
      },
      { property: "og:title", content: "Questões · Residuum" },
      { property: "og:description", content: "Desempenho em questões de residência médica." },
    ],
  }),
  component: QuestionsPage,
});

function QuestionsPage() {
  const qc = useQueryClient();
  const { data: logs = [] } = useQuestionLogs();
  const { data: subjects = [] } = useSubjects();
  const { data: disciplines = [] } = useDisciplines();

  const [subjectId, setSubjectId] = useState("");
  const [banca, setBanca] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [total, setTotal] = useState("10");
  const [correct, setCorrect] = useState("7");
  const [date, setDate] = useState("");

  useEffect(() => {
    setDate(toDateInputValue(new Date()));
  }, []);

  const addLog = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const subject = subjects.find((s) => s.id === subjectId);
      const { error } = await supabase.from("question_logs").insert({
        user_id: userId,
        subject_id: subjectId || null,
        discipline_id: subject?.discipline_id ?? null,
        banca: banca.trim() || null,
        year: year ? Number(year) : null,
        total: Number(total),
        correct: Number(correct),
        created_at: dateInputToIso(date),
      });
      if (error) throw error;
      if (subjectId) {
        await startSubjectCycle(subjectId);
        const t = Number(total);
        if (t > 0) await nudgeMasteryFromQuestions(subjectId, (Number(correct) / t) * 100);
      }

      if (subjectId) {
        void recalculateSubjectPriority(userId, subjectId).catch((err) => {
          console.warn("Falha ao recalcular prioridade do assunto", subjectId, err);
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      if (Number(correct) < Number(total)) {
        toast.success("Questões registradas · anote os erros no caderno");
      } else {
        toast.success("Questões registradas");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalQuestions = logs.reduce((a, l) => a + l.total, 0);
  const totalCorrect = logs.reduce((a, l) => a + l.correct, 0);
  const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const byBanca = new Map<string, { total: number; correct: number }>();
  for (const log of logs) {
    const key = log.banca?.trim() || "Sem banca";
    const entry = byBanca.get(key) ?? { total: 0, correct: 0 };
    entry.total += log.total;
    entry.correct += log.correct;
    byBanca.set(key, entry);
  }

  const worst = [...byBanca.entries()]
    .map(([name, v]) => ({ name, ...v, acc: Math.round((v.correct / v.total) * 100) }))
    .sort((a, b) => a.acc - b.acc);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthBySubject = new Map<string, { total: number; correct: number }>();
  for (const log of logs) {
    if (!log.subject_id) continue;
    if (new Date(log.created_at) < monthStart) continue;
    const entry = monthBySubject.get(log.subject_id) ?? { total: 0, correct: 0 };
    entry.total += log.total;
    entry.correct += log.correct;
    monthBySubject.set(log.subject_id, entry);
  }
  const monthRanked = [...monthBySubject.entries()]
    .map(([id, v]) => ({
      id,
      name: subjects.find((s) => s.id === id)?.name ?? "Assunto",
      total: v.total,
      acc: Math.round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => b.acc - a.acc);
  const monthBest = monthRanked.slice(0, 5);
  const monthWorst = [...monthRanked].reverse().slice(0, 5);
  const monthLabel = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });


  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Questões feitas" value={String(totalQuestions)} />
        <Stat label="Acertos" value={String(totalCorrect)} tone="brand" />
        <Stat label="Taxa de acerto" value={`${accuracy}%`} progress={accuracy} tone="brand" />
        <Stat label="Erros" value={String(totalQuestions - totalCorrect)} tone="rose" />
      </div>

      <Panel title="Registrar bloco de questões">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (Number(correct) > Number(total)) {
              toast.error("Acertos não podem passar do total");
              return;
            }
            addLog.mutate();
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Assunto">
            <select
              className={inputClass}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Geral</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Banca">
            <input
              className={inputClass}
              value={banca}
              onChange={(e) => setBanca(e.target.value)}
              placeholder="ENAMED, USP, UNIFESP…"
            />
          </Field>
          <Field label="Ano">
            <input
              className={inputClass}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Data">
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Total">
            <input
              className={inputClass}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Acertos">
            <input
              className={inputClass}
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <div className="lg:col-span-3">
            <button className={buttonClass}>Salvar registro</button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Relatório do mês"
        action={
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {monthLabel}
          </span>
        }
      >
        {monthRanked.length === 0 ? (
          <Empty>Nenhuma questão registrada neste mês ainda.</Empty>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {(
              [
                { label: "🟢 Melhores assuntos", rows: monthBest, good: true },
                { label: "🔴 Assuntos mais frágeis", rows: monthWorst, good: false },
              ] as const
            ).map((block) => (
              <div key={block.label}>
                <p className="text-xs font-semibold text-muted-foreground">{block.label}</p>
                <div className="mt-2 space-y-2 text-sm">
                  {block.rows.map((row) => (
                    <div key={row.id} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 truncate text-xs">{row.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${block.good ? "bg-brand" : "bg-rose"}`}
                          style={{ width: `${row.acc}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                        {row.acc}% · {row.total}q
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>


      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Desempenho por banca">
          {worst.length === 0 ? (
            <Empty>Sem registros ainda.</Empty>
          ) : (
            <div className="space-y-2 text-sm">
              {worst.map((b) => (
                <div key={b.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs">{b.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${b.acc < 60 ? "bg-rose" : "bg-brand"}`}
                      style={{ width: `${b.acc}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {b.acc}% · {b.total}q
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Últimos registros">
          {logs.length === 0 ? (
            <Empty>Nenhum bloco registrado.</Empty>
          ) : (
            <div className="space-y-2 text-sm">
              {logs.slice(0, 12).map((log) => {
                const subject = subjects.find((s) => s.id === log.subject_id);
                const discipline = disciplines.find((d) => d.id === log.discipline_id);
                const acc = Math.round((log.correct / log.total) * 100);
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {subject?.name ?? discipline?.name ?? "Geral"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.banca ?? "—"} {log.year ?? ""} · {formatDate(log.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold ${acc < 60 ? "text-rose" : "text-brand"}`}
                    >
                      {log.correct}/{log.total} · {acc}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
