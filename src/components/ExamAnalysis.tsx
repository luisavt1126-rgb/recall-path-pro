import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { analyzeExam } from "@/lib/exam-analysis.functions";
import { extractPdfText } from "@/lib/pdf-text";
import {
  questionStatsBySubject,
  useExamAnalyses,
  useExamTopics,
  useQuestionLogs,
  useSubjects,
  type ExamTopic,
} from "@/lib/data";
import { Panel, Stat, Empty, Field, inputClass, buttonClass, ghostButtonClass } from "@/components/bits";
import { formatDate, startOfWeek } from "@/lib/format";

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function AreaGroup({
  area,
  topics,
  errorFor,
}: {
  area: string;
  topics: ExamTopic[];
  errorFor: (topic: ExamTopic) => number | null;
}) {
  const [open, setOpen] = useState(true);
  const bySubject = new Map<string, ExamTopic[]>();
  for (const topic of topics) {
    bySubject.set(topic.subject, [...(bySubject.get(topic.subject) ?? []), topic]);
  }
  const areaPct = topics.reduce((sum, t) => sum + Number(t.incidence_pct), 0);

  return (
    <div className="rounded-xl border border-border">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-medium">{area}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">
            {areaPct.toFixed(1)}% da prova
          </span>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {[...bySubject.entries()]
            .sort(
              (a, b) =>
                b[1].reduce((s, t) => s + Number(t.incidence_pct), 0) -
                a[1].reduce((s, t) => s + Number(t.incidence_pct), 0),
            )
            .map(([subject, subjectTopics]) => (
              <div key={subject}>
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>{subject}</span>
                  <span className="text-muted-foreground">
                    {subjectTopics
                      .reduce((s, t) => s + Number(t.incidence_pct), 0)
                      .toFixed(1)}
                    %
                  </span>
                </div>
                <div className="mt-1 space-y-1">
                  {subjectTopics.map((topic) => {
                    const err = errorFor(topic);
                    return (
                      <div
                        key={topic.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {topic.topic ?? topic.subject}
                        </span>
                        <span className="text-muted-foreground">
                          {topic.question_count} q · {Number(topic.incidence_pct).toFixed(1)}%
                        </span>
                        <span
                          className={
                            err === null
                              ? "text-muted-foreground"
                              : err >= 40
                                ? "font-medium text-rose"
                                : "text-sage"
                          }
                        >
                          {err === null ? "sem dados" : `${err}% erro`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function ExamAnalysisPanel() {
  const qc = useQueryClient();
  const runAnalysis = useServerFn(analyzeExam);
  const { data: analyses = [] } = useExamAnalyses();
  const { data: topics = [] } = useExamTopics();
  const { data: subjects = [] } = useSubjects();
  const { data: logs = [] } = useQuestionLogs();

  const [mode, setMode] = useState<"pdf" | "banca">("pdf");
  const [title, setTitle] = useState("");
  const [banca, setBanca] = useState("");
  const [year, setYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string>("");

  const stats = useMemo(() => questionStatsBySubject(logs), [logs]);

  const errorBySubjectName = useMemo(() => {
    const map = new Map<string, number>();
    for (const subject of subjects) {
      const stat = stats.get(subject.id);
      if (stat && stat.total > 0) {
        map.set(norm(subject.name), Math.round((stat.errors / stat.total) * 100));
      }
    }
    return map;
  }, [subjects, stats]);

  const errorFor = (topic: ExamTopic) => {
    const direct = errorBySubjectName.get(norm(topic.topic ?? ""));
    if (direct !== undefined) return direct;
    const bySubject = errorBySubjectName.get(norm(topic.subject));
    if (bySubject !== undefined) return bySubject;
    for (const [name, value] of errorBySubjectName) {
      if (norm(topic.subject).includes(name) || name.includes(norm(topic.subject))) return value;
    }
    return null;
  };

  const currentId = selected || analyses[0]?.id || "";
  const current = analyses.find((a) => a.id === currentId);
  const currentTopics = topics.filter((t) => t.analysis_id === currentId);

  const areas = useMemo(() => {
    const map = new Map<string, ExamTopic[]>();
    for (const topic of currentTopics) {
      map.set(topic.area, [...(map.get(topic.area) ?? []), topic]);
    }
    return [...map.entries()].sort(
      (a, b) =>
        b[1].reduce((s, t) => s + Number(t.incidence_pct), 0) -
        a[1].reduce((s, t) => s + Number(t.incidence_pct), 0),
    );
  }, [currentTopics]);

  const gapData = useMemo(
    () =>
      currentTopics
        .map((t) => ({
          name: (t.topic ?? t.subject).slice(0, 22),
          incidencia: Number(t.incidence_pct),
          erro: errorFor(t) ?? 0,
          risco: Number(t.incidence_pct) * ((errorFor(t) ?? 0) / 100),
        }))
        .sort((a, b) => b.risco - a.risco)
        .slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTopics, errorBySubjectName],
  );

  const evolution = useMemo(() => {
    const buckets = new Map<string, { total: number; correct: number }>();
    for (const log of logs) {
      const key = startOfWeek(new Date(log.created_at)).toISOString().slice(0, 10);
      const entry = buckets.get(key) ?? { total: 0, correct: 0 };
      entry.total += log.total;
      entry.correct += log.correct;
      buckets.set(key, entry);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([week, value]) => ({
        semana: formatDate(week),
        acertos: Math.round((value.correct / value.total) * 100),
        questoes: value.total,
      }));
  }, [logs]);

  const analyze = useMutation({
    mutationFn: async () => {
      let text: string | undefined;
      if (mode === "pdf") {
        if (!file) throw new Error("Selecione o PDF da prova.");
        text = await extractPdfText(file);
      }
      return runAnalysis({
        data: {
          title: title.trim() || file?.name.replace(/\.pdf$/i, "") || `${banca} ${year}`.trim(),
          banca: banca.trim(),
          year: year ? Number(year) : null,
          source: mode,
          ...(text ? { text } : {}),
        },
      });
    },
    onSuccess: (result) => {
      setFile(null);
      setSelected(result.analysisId);
      qc.invalidateQueries({ queryKey: ["exam_analyses"] });
      qc.invalidateQueries({ queryKey: ["exam_topics"] });
      toast.success(`Análise pronta: ${result.topics} tópicos mapeados`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAnalysis = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_analyses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected("");
      qc.invalidateQueries({ queryKey: ["exam_analyses"] });
      qc.invalidateQueries({ queryKey: ["exam_topics"] });
      toast.success("Análise removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Analisar prova">
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                  mode === "pdf" ? "border-brand bg-brand/10 text-brand" : "border-border"
                }`}
                onClick={() => setMode("pdf")}
              >
                Enviar PDF
              </button>
              <button
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                  mode === "banca" ? "border-brand bg-brand/10 text-brand" : "border-border"
                }`}
                onClick={() => setMode("banca")}
              >
                Só a banca
              </button>
            </div>

            {mode === "pdf" && (
              <Field label="PDF da prova">
                <input
                  type="file"
                  accept="application/pdf"
                  className={inputClass}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Field>
            )}

            <Field label="Nome da prova">
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ENAMED 2025"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Banca">
                <input
                  className={inputClass}
                  value={banca}
                  onChange={(e) => setBanca(e.target.value)}
                  placeholder="INEP, AMRIGS, USP..."
                />
              </Field>
              <Field label="Ano">
                <input
                  className={inputClass}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  inputMode="numeric"
                  placeholder="2025"
                />
              </Field>
            </div>

            <button
              className={buttonClass}
              disabled={analyze.isPending}
              onClick={() => analyze.mutate()}
            >
              {analyze.isPending ? "Analisando..." : "Mapear incidência"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              {mode === "pdf"
                ? "A IA lê o texto do PDF e classifica cada questão em grande área → assunto → tópico."
                : "Sem o PDF, a IA estima o padrão histórico da banca. Use como referência, não como contagem exata."}
            </p>
          </div>
        </Panel>

        <Panel
          title={current ? current.title : "Incidência por área"}
          className="lg:col-span-2"
          action={
            analyses.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  className={`${inputClass} w-auto`}
                  value={currentId}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {analyses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                      {a.year ? ` (${a.year})` : ""}
                    </option>
                  ))}
                </select>
                <button className={ghostButtonClass} onClick={() => removeAnalysis.mutate(currentId)}>
                  Remover
                </button>
              </div>
            ) : undefined
          }
        >
          {!current ? (
            <Empty>Envie um PDF ou informe uma banca para gerar a primeira análise.</Empty>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat label="Questões mapeadas" value={String(current.total_questions || currentTopics.reduce((s, t) => s + t.question_count, 0))} />
                <Stat label="Grandes áreas" value={String(areas.length)} />
                <Stat label="Tópicos" value={String(currentTopics.length)} />
                <Stat
                  label="Origem"
                  value={current.source === "pdf" ? "PDF" : "Banca"}
                  hint={current.source === "pdf" ? "contagem real" : "estimativa"}
                />
              </div>
              {current.summary && (
                <p className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
                  {current.summary}
                </p>
              )}
              <div className="space-y-2">
                {areas.map(([area, areaTopics]) => (
                  <AreaGroup key={area} area={area} topics={areaTopics} errorFor={errorFor} />
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Onde eu mais perco pontos">
          {gapData.length === 0 ? (
            <Empty>Analise uma prova para ver o cruzamento com seus erros.</Empty>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gapData} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis dataKey="name" type="category" width={130} fontSize={10} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="incidencia" name="Incidência %" fill="var(--color-brand)" radius={3} />
                  <Bar dataKey="erro" name="Meu erro %" fill="var(--color-rose)" radius={3}>
                    {gapData.map((entry) => (
                      <Cell key={entry.name} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Minha evolução em questões">
          {evolution.length === 0 ? (
            <Empty>Registre blocos de questões para acompanhar a evolução.</Empty>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolution} margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="semana" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="acertos"
                    name="Acertos %"
                    stroke="var(--color-brand)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
