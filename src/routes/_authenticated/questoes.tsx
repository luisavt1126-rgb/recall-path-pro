import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import { useDisciplines, useQuestionLogs, useSubjects } from "@/lib/data";
import { Panel, Stat, Empty, Field, inputClass, buttonClass } from "@/components/bits";
import { formatDate } from "@/lib/format";

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
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Questões registradas");
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
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
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
          <div className="lg:col-span-5">
            <button className={buttonClass}>Salvar registro</button>
          </div>
        </form>
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
