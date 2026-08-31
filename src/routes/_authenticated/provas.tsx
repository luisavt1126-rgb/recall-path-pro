import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import { useExams, EXAM_STATUS, type Exam } from "@/lib/data";
import {
  Panel,
  Stat,
  Empty,
  Field,
  inputClass,
  buttonClass,
  ghostButtonClass,
} from "@/components/bits";
import { daysBetween, startOfDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/provas")({
  head: () => ({
    meta: [
      { title: "Provas · Residuum" },
      {
        name: "description",
        content:
          "Acompanhe as provas de residência: datas, bancas, prazos de inscrição e contagem regressiva.",
      },
      { property: "og:title", content: "Provas · Residuum" },
      {
        property: "og:description",
        content: "Calendário de provas, inscrições e contagem regressiva para a residência.",
      },
    ],
  }),
  component: ExamsPage,
});

function longExamDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  const text = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function countdown(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  return daysBetween(date, startOfDay(new Date()));
}

const statusMeta: Record<string, string> = {
  planejada: "bg-secondary text-muted-foreground",
  inscrito: "bg-brand/10 text-brand",
  realizada: "bg-sage/10 text-sage",
  cancelada: "bg-rose/10 text-rose",
};

function ExamsPage() {
  const qc = useQueryClient();
  const { data: exams = [] } = useExams();
  const [title, setTitle] = useState("");
  const [banca, setBanca] = useState("");
  const [examDate, setExamDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const createExam = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const { error } = await supabase.from("exams").insert({
        user_id: userId,
        title: title.trim(),
        banca: banca.trim() || null,
        exam_date: examDate,
        registration_deadline: deadline || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setBanca("");
      setExamDate("");
      setDeadline("");
      setLocation("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Prova cadastrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ exam, status }: { exam: Exam; status: string }) => {
      const { error } = await supabase.from("exams").update({ status }).eq("id", exam.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exams"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeExam = useMutation({
    mutationFn: async (exam: Exam) => {
      const { error } = await supabase.from("exams").delete().eq("id", exam.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Prova removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = exams.filter((e) => e.status !== "cancelada" && e.status !== "realizada");
  const upcoming = active
    .filter((e) => countdown(e.exam_date) >= 0)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  const past = exams
    .filter((e) => !upcoming.includes(e))
    .sort((a, b) => b.exam_date.localeCompare(a.exam_date));
  const next = upcoming[0];
  const openDeadlines = active.filter(
    (e) => e.registration_deadline && countdown(e.registration_deadline) >= 0,
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Provas cadastradas" value={String(exams.length)} />
        <Stat label="Próximas" value={String(upcoming.length)} hint="ainda por vir" />
        <Stat
          label="Contagem regressiva"
          value={next ? `${countdown(next.exam_date)} d` : "—"}
          tone="brand"
          hint={next?.title ?? "sem prova agendada"}
        />
        <Stat
          label="Inscrições abertas"
          value={String(openDeadlines.length)}
          tone="rose"
          hint="prazos a vencer"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Nova prova">
          <div className="space-y-3">
            <Field label="Nome da prova">
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ENAMED 2026"
              />
            </Field>
            <Field label="Banca / instituição">
              <input
                className={inputClass}
                value={banca}
                onChange={(e) => setBanca(e.target.value)}
                placeholder="INEP, AMRIGS, USP..."
              />
            </Field>
            <Field label="Data da prova">
              <input
                type="date"
                className={inputClass}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </Field>
            <Field label="Prazo de inscrição">
              <input
                type="date"
                className={inputClass}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
            <Field label="Local">
              <input
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Boa Vista - RR"
              />
            </Field>
            <Field label="Anotações">
              <textarea
                className={`${inputClass} min-h-20`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Conteúdo cobrado, número de vagas, taxa..."
              />
            </Field>
            <button
              className={buttonClass}
              disabled={!title.trim() || !examDate || createExam.isPending}
              onClick={() => createExam.mutate()}
            >
              Cadastrar prova
            </button>
          </div>
        </Panel>

        <Panel title="Próximas provas" className="lg:col-span-2">
          <div className="space-y-3 text-sm">
            {upcoming.length === 0 && <Empty>Nenhuma prova futura cadastrada.</Empty>}
            {upcoming.map((exam) => {
              const days = countdown(exam.exam_date);
              const deadlineDays = exam.registration_deadline
                ? countdown(exam.registration_deadline)
                : null;
              return (
                <div key={exam.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{exam.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {longExamDate(exam.exam_date)}
                        {exam.banca && ` · ${exam.banca}`}
                        {exam.location && ` · ${exam.location}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          statusMeta[exam.status] ?? statusMeta["planejada"]
                        }`}
                      >
                        {EXAM_STATUS.find((s) => s.value === exam.status)?.label ?? exam.status}
                      </span>
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                        {days === 0 ? "é hoje!" : `faltam ${days} dias`}
                      </span>
                    </div>
                  </div>

                  {deadlineDays !== null && (
                    <p
                      className={`mt-2 text-xs ${
                        deadlineDays <= 7 ? "font-medium text-rose" : "text-muted-foreground"
                      }`}
                    >
                      Inscrição até {longExamDate(exam.registration_deadline!)} (
                      {deadlineDays >= 0 ? `${deadlineDays} dias` : "prazo encerrado"})
                    </p>
                  )}
                  {exam.notes && (
                    <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                      {exam.notes}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className={`${inputClass} w-auto`}
                      value={exam.status}
                      onChange={(e) =>
                        updateStatus.mutate({ exam, status: e.target.value })
                      }
                    >
                      {EXAM_STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className={ghostButtonClass}
                      onClick={() => removeExam.mutate(exam)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Histórico e arquivadas">
        <div className="space-y-2 text-sm">
          {past.length === 0 && <Empty>Nada por aqui ainda.</Empty>}
          {past.map((exam) => (
            <div
              key={exam.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
            >
              <div>
                <p className="font-medium">{exam.title}</p>
                <p className="text-xs text-muted-foreground">
                  {longExamDate(exam.exam_date)}
                  {exam.banca && ` · ${exam.banca}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    statusMeta[exam.status] ?? statusMeta["planejada"]
                  }`}
                >
                  {EXAM_STATUS.find((s) => s.value === exam.status)?.label ?? exam.status}
                </span>
                <button className={ghostButtonClass} onClick={() => removeExam.mutate(exam)}>
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
