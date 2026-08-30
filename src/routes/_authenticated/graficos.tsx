import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ACTIVITY_TYPES,
  useDisciplines,
  useProfile,
  useQuestionLogs,
  useStudySessions,
  useSubjects,
} from "@/lib/data";
import { Panel, Stat, Empty } from "@/components/bits";
import { addDays, decimalHours, startOfDay, startOfWeek } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/graficos")({
  head: () => ({
    meta: [
      { title: "Gráficos · Residuum" },
      {
        name: "description",
        content: "Horas por dia, semana e mês, distribuição por disciplina e evolução em questões.",
      },
      { property: "og:title", content: "Gráficos · Residuum" },
      { property: "og:description", content: "Analise a evolução dos seus estudos." },
    ],
  }),
  component: ChartsPage,
});

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
};

function ChartsPage() {
  const { data: sessions = [] } = useStudySessions();
  const { data: logs = [] } = useQuestionLogs();
  const { data: disciplines = [] } = useDisciplines();
  const { data: subjects = [] } = useSubjects();
  const { data: profile } = useProfile();
  const [range, setRange] = useState<"dia" | "semana" | "mes">("dia");

  const today = startOfDay(new Date());
  const goal = Number(profile?.weekly_goal_hours ?? 30);

  const daily = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    const minutes = sessions
      .filter((s) => startOfDay(new Date(s.started_at)).getTime() === day.getTime())
      .reduce((a, s) => a + s.minutes, 0);
    return {
      label: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      horas: Number((minutes / 60).toFixed(1)),
    };
  });

  const weekly = Array.from({ length: 10 }, (_, i) => {
    const start = addDays(startOfWeek(today), -7 * (9 - i));
    const end = addDays(start, 7);
    const minutes = sessions
      .filter((s) => {
        const d = new Date(s.started_at);
        return d >= start && d < end;
      })
      .reduce((a, s) => a + s.minutes, 0);
    return {
      label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      horas: Number((minutes / 60).toFixed(1)),
      meta: goal,
    };
  });

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const base = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const minutes = sessions
      .filter((s) => {
        const d = new Date(s.started_at);
        return d >= base && d < next;
      })
      .reduce((a, s) => a + s.minutes, 0);
    return {
      label: base.toLocaleDateString("pt-BR", { month: "short" }),
      horas: Number((minutes / 60).toFixed(1)),
    };
  });

  const series = range === "dia" ? daily : range === "semana" ? weekly : monthly;

  const byDiscipline = disciplines
    .map((d) => {
      const minutes = sessions
        .filter((s) => s.discipline_id === d.id)
        .reduce((a, s) => a + s.minutes, 0);
      return { name: d.name, horas: Number((minutes / 60).toFixed(1)) };
    })
    .filter((d) => d.horas > 0)
    .sort((a, b) => b.horas - a.horas);

  const byActivity = ACTIVITY_TYPES.map((a) => {
    const minutes = sessions
      .filter((s) => s.activity_type === a.value)
      .reduce((a2, s) => a2 + s.minutes, 0);
    return { name: a.label, horas: Number((minutes / 60).toFixed(1)) };
  }).filter((a) => a.horas > 0);

  const accuracyTrend = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(startOfWeek(today), -7 * (7 - i));
    const end = addDays(start, 7);
    const weekLogs = logs.filter((l) => {
      const d = new Date(l.created_at);
      return d >= start && d < end;
    });
    const total = weekLogs.reduce((a, l) => a + l.total, 0);
    const correct = weekLogs.reduce((a, l) => a + l.correct, 0);
    return {
      label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      acerto: total ? Math.round((correct / total) * 100) : 0,
      questoes: total,
    };
  });

  const totalMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
  const masteryAvg = subjects.length
    ? Math.round(subjects.reduce((a, s) => a + s.mastery, 0) / subjects.length)
    : 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Horas totais" value={`${decimalHours(totalMinutes)} h`} tone="brand" />
        <Stat label="Assuntos" value={String(subjects.length)} />
        <Stat label="Domínio médio" value={`${masteryAvg}%`} progress={masteryAvg} />
        <Stat
          label="Última semana"
          value={`${weekly[weekly.length - 1]?.horas ?? 0} h`}
          hint={`meta ${goal} h`}
        />
      </div>

      <Panel
        title="Horas estudadas"
        action={
          <div className="flex gap-1 text-xs">
            {(["dia", "semana", "mes"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-2 py-1 ${
                  range === r ? "bg-brand text-brand-foreground" : "border border-border"
                }`}
              >
                {r === "dia" ? "Por dia" : r === "semana" ? "Por semana" : "Por mês"}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="fillHoras" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" width={28} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} h`, "Horas"]} />
              <Area
                dataKey="horas"
                stroke="var(--brand)"
                strokeWidth={2}
                fill="url(#fillHoras)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Horas por disciplina">
          {byDiscipline.length === 0 ? (
            <Empty>Registre sessões para ver a distribuição.</Empty>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDiscipline} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip
                    cursor={{ fill: "var(--secondary)" }}
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [`${v} h`, "Horas"]}
                  />
                  <Bar dataKey="horas" radius={[0, 6, 6, 0]}>
                    {byDiscipline.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "var(--brand)" : "var(--accent)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Evolução da taxa de acerto">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyTrend}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" width={28} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Acerto"]} />
                <Line
                  dataKey="acerto"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--brand)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Horas por tipo de atividade">
        {byActivity.length === 0 ? (
          <Empty>Sem dados ainda.</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            {byActivity.map((a) => {
              const max = Math.max(...byActivity.map((x) => x.horas));
              return (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs">{a.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(a.horas / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {a.horas} h
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
