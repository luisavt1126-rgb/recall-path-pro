import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ACTIVITY_TYPES, useStudySessions, useSubjects } from "@/lib/data";
import { useLogStudySession } from "@/lib/actions";
import { Panel, Stat, Empty, Field, inputClass, buttonClass, ghostButtonClass } from "@/components/bits";
import { formatDateTime, formatHours, isSameDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/temporizador")({
  head: () => ({
    meta: [
      { title: "Temporizador · Residuum" },
      {
        name: "description",
        content: "Pomodoro e cronômetro livre com registro automático de horas por assunto.",
      },
      { property: "og:title", content: "Temporizador · Residuum" },
      { property: "og:description", content: "Conte o tempo real de estudo e registre sessões." },
    ],
  }),
  component: TimerPage,
});

type Mode = { value: string; label: string; minutes: number };

const MODES: Mode[] = [
  { value: "pomodoro", label: "Pomodoro 25 min", minutes: 25 },
  { value: "longo", label: "Foco 50 min", minutes: 50 },
  { value: "pausa", label: "Pausa 5 min", minutes: 5 },
  { value: "livre", label: "Cronômetro livre", minutes: 0 },
];

const DEFAULT_MODE: Mode = MODES[0]!;

function TimerPage() {
  const { data: subjects = [] } = useSubjects();
  const { data: sessions = [] } = useStudySessions();
  const log = useLogStudySession();

  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [seconds, setSeconds] = useState(DEFAULT_MODE.minutes * 60);
  const [running, setRunning] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [activity, setActivity] = useState("estudo");
  const startRef = useRef<Date | null>(null);

  const [manualMinutes, setManualMinutes] = useState("60");
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualSubject, setManualSubject] = useState("");
  const [manualActivity, setManualActivity] = useState("estudo");
  const [manualNotes, setManualNotes] = useState("");

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSeconds((s) => (mode.value === "livre" ? s + 1 : Math.max(0, s - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, mode.value]);

  const elapsedMinutes =
    mode.value === "livre" ? Math.round(seconds / 60) : mode.minutes - Math.ceil(seconds / 60);

  const finish = () => {
    setRunning(false);
    const minutes = Math.max(1, elapsedMinutes);
    const subject = subjects.find((s) => s.id === subjectId);
    log.mutate({
      subject_id: subjectId || null,
      discipline_id: subject?.discipline_id ?? null,
      activity_type: activity,
      minutes,
      started_at: (startRef.current ?? new Date()).toISOString(),
    });
    startRef.current = null;
    setSeconds(mode.value === "livre" ? 0 : mode.minutes * 60);
  };

  const today = new Date();
  const todaySessions = sessions.filter((s) => isSameDay(new Date(s.started_at), today));
  const todayMinutes = todaySessions.reduce((a, s) => a + s.minutes, 0);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Hoje" value={formatHours(todayMinutes)} tone="brand" />
        <Stat label="Sessões hoje" value={String(todaySessions.length)} />
        <Stat
          label="Média por sessão"
          value={todaySessions.length ? formatHours(todayMinutes / todaySessions.length) : "—"}
        />
        <Stat label="Modo atual" value={mode.label.split(" ")[0] ?? mode.label} hint={mode.label} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Temporizador">
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={m.value === mode.value ? buttonClass : ghostButtonClass}
                onClick={() => {
                  setMode(m);
                  setRunning(false);
                  setSeconds(m.minutes * 60);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="mt-6 text-center font-display text-6xl font-semibold tabular-nums">
            {mm}:{ss}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Field label="Assunto">
              <select
                className={inputClass}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">Sem assunto</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Atividade">
              <select
                className={inputClass}
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              >
                {ACTIVITY_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={buttonClass}
              onClick={() => {
                if (!running && !startRef.current) startRef.current = new Date();
                setRunning((r) => !r);
              }}
            >
              {running ? "Pausar" : "Iniciar"}
            </button>
            <button className={ghostButtonClass} onClick={finish} disabled={elapsedMinutes < 1}>
              Encerrar e registrar
            </button>
            <button
              className={ghostButtonClass}
              onClick={() => {
                setRunning(false);
                startRef.current = null;
                setSeconds(mode.minutes * 60);
              }}
            >
              Zerar
            </button>
          </div>
        </Panel>

        <Panel title="Lançamento manual de horas">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const subject = subjects.find((s) => s.id === manualSubject);
              log.mutate({
                subject_id: manualSubject || null,
                discipline_id: subject?.discipline_id ?? null,
                activity_type: manualActivity,
                minutes: Number(manualMinutes),
                started_at: new Date(`${manualDate}T12:00:00`).toISOString(),
                notes: manualNotes.trim() || null,
              });
              setManualNotes("");
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Field label="Data">
              <input
                type="date"
                className={inputClass}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </Field>
            <Field label="Minutos">
              <input
                className={inputClass}
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Assunto">
              <select
                className={inputClass}
                value={manualSubject}
                onChange={(e) => setManualSubject(e.target.value)}
              >
                <option value="">Sem assunto</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Atividade">
              <select
                className={inputClass}
                value={manualActivity}
                onChange={(e) => setManualActivity(e.target.value)}
              >
                {ACTIVITY_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observações">
                <input
                  className={inputClass}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Ex.: aula do Med sobre choque"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <button className={buttonClass}>Registrar horas</button>
            </div>
          </form>
        </Panel>
      </div>

      <Panel title="Últimas sessões">
        {sessions.length === 0 ? (
          <Empty>Nenhuma sessão registrada ainda.</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {sessions.slice(0, 15).map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {subjects.find((s) => s.id === session.subject_id)?.name ?? "Sem assunto"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(session.started_at)} ·{" "}
                    {ACTIVITY_TYPES.find((a) => a.value === session.activity_type)?.label ??
                      session.activity_type}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-brand">
                  {formatHours(session.minutes)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
