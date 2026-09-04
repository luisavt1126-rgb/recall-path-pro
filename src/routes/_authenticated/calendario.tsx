import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId, useRateDeck, useRateSubject } from "@/lib/actions";
import {
  EVENT_CATEGORIES,
  categoryMeta,
  useDecks,
  useEvents,
  useSubjects,
  type AgendaEvent,
  type AnkiDeck,
  type Subject,
} from "@/lib/data";
import { RATINGS, RATING_LABEL, type Rating } from "@/lib/srs";
import { Panel, Empty, Field, inputClass, buttonClass, ghostButtonClass } from "@/components/bits";
import { addDays, formatTime, isSameDay, longDate, startOfWeek } from "@/lib/format";
import { MEDCURSO_AREAS, PLAN_TAG, generateMedcursoPlan } from "@/lib/medcurso";
import { URGENCY_META, dayUrgency } from "@/lib/priority";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

/** Item unificado da agenda: compromisso manual ou revisão SRS agendada. */
type CalItem = {
  key: string;
  kind: "event" | "subject" | "deck";
  at: string;
  title: string;
  color: string;
  label: string;
  duration: number | null;
  done: boolean;
  event?: AgendaEvent;
  subject?: Subject;
  deck?: AnkiDeck;
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário · Residuum" },
      {
        name: "description",
        content: "Agenda semanal de estudos, revisões, aulas da faculdade e cursinho.",
      },
      { property: "og:title", content: "Calendário · Residuum" },
      { property: "og:description", content: "Planeje a semana inteira de estudos." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const qc = useQueryClient();
  const { data: events = [] } = useEvents();
  const { data: subjects = [] } = useSubjects();
  const { data: decks = [] } = useDecks();
  const rateSubject = useRateSubject();
  const rateDeck = useRateDeck();
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"dia" | "semana" | "mes">("semana");
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("estudar");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("19:00");
  const [duration, setDuration] = useState("60");
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setCategory("estudar");
    setSubjectId("");
    setDate(new Date().toISOString().slice(0, 10));
    setTime("19:00");
    setDuration("60");
  };

  const startEdit = (event: AgendaEvent) => {
    const at = new Date(event.starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditingId(event.id);
    setTitle(event.title);
    setCategory(event.category);
    setSubjectId(event.subject_id ?? "");
    setDate(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`);
    setTime(`${pad(at.getHours())}:${pad(at.getMinutes())}`);
    setDuration(String(event.duration_min));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [planStart, setPlanStart] = useState(new Date().toISOString().slice(0, 10));
  const [planDays, setPlanDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [planLessonTime, setPlanLessonTime] = useState("19:00");
  const [planReviewTime, setPlanReviewTime] = useState("07:30");
  const [planAreas, setPlanAreas] = useState<string[]>([...MEDCURSO_AREAS]);

  const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const now = new Date();
  const monthCursor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthGridStart = startOfWeek(monthCursor);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i));
  const monthLabel = monthCursor.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  /** Compromissos manuais + revisões virtuais (assuntos e baralhos) do dia. */
  const itemsForDay = (day: Date): CalItem[] => {
    const list: CalItem[] = [];
    for (const e of events) {
      if (!isSameDay(new Date(e.starts_at), day)) continue;
      const meta = categoryMeta(e.category);
      list.push({
        key: `e:${e.id}`,
        kind: "event",
        at: e.starts_at,
        title: e.title,
        color: meta.color,
        label: meta.label,
        duration: e.duration_min,
        done: e.status === "concluido",
        event: e,
      });
    }
    for (const s of subjects) {
      if (!s.next_review_at || !isSameDay(new Date(s.next_review_at), day)) continue;
      list.push({
        key: `s:${s.id}`,
        kind: "subject",
        at: s.next_review_at,
        title: `Revisão: ${s.name}`,
        color: "bg-violet",
        label: "Revisão SRS · assunto",
        duration: null,
        done: false,
        subject: s,
      });
    }
    for (const d of decks) {
      if (!d.next_review_at || !isSameDay(new Date(d.next_review_at), day)) continue;
      list.push({
        key: `d:${d.id}`,
        kind: "deck",
        at: d.next_review_at,
        title: `Revisão: ${d.name}`,
        color: "bg-sage",
        label: "Revisão SRS · baralho",
        duration: null,
        done: false,
        deck: d,
      });
    }
    return list.sort((a, b) => a.at.localeCompare(b.at));
  };

  const dayCursor = addDays(new Date(), dayOffset);
  const dayCursorItems = itemsForDay(dayCursor);

  const rateItem = (item: CalItem, rating: Rating) => {
    if (item.kind === "subject" && item.subject) {
      rateSubject.mutate({ subject: item.subject, rating });
    } else if (item.kind === "deck" && item.deck) {
      rateDeck.mutate({ deck: item.deck, rating });
    }
  };


  const saveEvent = useMutation({
    mutationFn: async () => {
      const startsAt = new Date(`${date}T${time}:00`);
      const payload = {
        title: title.trim(),
        category,
        subject_id: subjectId || null,
        starts_at: startsAt.toISOString(),
        duration_min: Number(duration),
      };
      if (editingId) {
        const { error } = await supabase.from("events").update(payload).eq("id", editingId);
        if (error) throw error;
        return true;
      }
      const userId = await requireUserId();
      const { error } = await supabase.from("events").insert({ ...payload, user_id: userId });
      if (error) throw error;
      return false;
    },
    onSuccess: (edited) => {
      resetForm();
      qc.invalidateQueries();
      toast.success(edited ? "Compromisso atualizado" : "Compromisso adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("events").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Compromisso removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const planEvents = events.filter((e) => e.plan_tag === PLAN_TAG);

  const generatePlan = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const [y, m, d] = planStart.split("-").map(Number);
      const plan = generateMedcursoPlan({
        startDate: new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1),
        weekdays: planDays,
        lessonTime: planLessonTime,
        reviewTime: planReviewTime,
        areas: planAreas,
      });
      // regera do zero: apaga o plano anterior antes de inserir o novo
      const { error: delError } = await supabase
        .from("events")
        .delete()
        .eq("plan_tag", PLAN_TAG);
      if (delError) throw delError;
      const rows = plan.map((e) => ({ ...e, user_id: userId }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("events").insert(rows.slice(i, i + 200));
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries();
      toast.success(`Cronograma Medcurso gerado: ${count} compromissos`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearPlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").delete().eq("plan_tag", PLAN_TAG);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Cronograma Medcurso removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Panel
        title="Cronograma Medcurso automático"
        action={
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {planEvents.length} itens no plano
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">
          Gera as aulas do ciclo Medgrupo/Medcurso nos dias escolhidos e já agenda as
          revisões em D+1, 3, 8, 17, 35 e 70 (retenção de 95%).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Início">
            <input
              type="date"
              className={inputClass}
              value={planStart}
              onChange={(e) => setPlanStart(e.target.value)}
            />
          </Field>
          <Field label="Hora da aula">
            <input
              type="time"
              className={inputClass}
              value={planLessonTime}
              onChange={(e) => setPlanLessonTime(e.target.value)}
            />
          </Field>
          <Field label="Hora da revisão">
            <input
              type="time"
              className={inputClass}
              value={planReviewTime}
              onChange={(e) => setPlanReviewTime(e.target.value)}
            />
          </Field>
          <div className="flex items-end gap-2">
            <button
              className={buttonClass}
              disabled={generatePlan.isPending}
              onClick={() => generatePlan.mutate()}
            >
              {planEvents.length ? "Regerar plano" : "Gerar cronograma"}
            </button>
            <button
              className={ghostButtonClass}
              disabled={!planEvents.length || clearPlan.isPending}
              onClick={() => clearPlan.mutate()}
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Dias de aula</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((day, index) => {
              const active = planDays.includes(index);
              return (
                <button
                  key={day}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    active ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground"
                  }`}
                  onClick={() =>
                    setPlanDays((d) =>
                      d.includes(index) ? d.filter((x) => x !== index) : [...d, index],
                    )
                  }
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Grandes áreas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MEDCURSO_AREAS.map((area) => {
              const active = planAreas.includes(area);
              return (
                <button
                  key={area}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    active ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground"
                  }`}
                  onClick={() =>
                    setPlanAreas((a) =>
                      a.includes(area) ? a.filter((x) => x !== area) : [...a, area],
                    )
                  }
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title={editingId ? "Editar compromisso" : "Novo compromisso"}>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) saveEvent.mutate();
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <div className="lg:col-span-2">
            <Field label="Título">
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Bloco de questões ENAMED"
              />
            </Field>
          </div>
          <Field label="Categoria">
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assunto">
            <select
              className={inputClass}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Hora">
              <input
                type="time"
                className={inputClass}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            <Field label="Min">
              <input
                className={inputClass}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 lg:col-span-6">
            <button className={buttonClass} disabled={saveEvent.isPending}>
              {editingId ? "Salvar alterações" : "Adicionar à agenda"}
            </button>
            {editingId && (
              <button type="button" className={ghostButtonClass} onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel
        title={
          viewMode === "dia"
            ? longDate(dayCursor)
            : viewMode === "semana"
              ? `Semana de ${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
              : monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
        }
        action={
          <div className="flex items-center gap-2 text-xs">
            <div className="flex overflow-hidden rounded-lg border border-border">
              {(["dia", "semana", "mes"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`px-2.5 py-1 font-medium ${
                    viewMode === mode
                      ? "bg-brand/10 text-brand"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === "dia" ? "Dia" : mode === "semana" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
            <button
              className="rounded-lg border border-border px-2 py-1"
              onClick={() =>
                viewMode === "dia"
                  ? setDayOffset((d) => d - 1)
                  : viewMode === "semana"
                    ? setWeekOffset((w) => w - 1)
                    : setMonthOffset((m) => m - 1)
              }
            >
              ←
            </button>
            <button
              className="rounded-lg border border-border px-2 py-1"
              onClick={() =>
                viewMode === "dia"
                  ? setDayOffset(0)
                  : viewMode === "semana"
                    ? setWeekOffset(0)
                    : setMonthOffset(0)
              }
            >
              Hoje
            </button>
            <button
              className="rounded-lg border border-border px-2 py-1"
              onClick={() =>
                viewMode === "dia"
                  ? setDayOffset((d) => d + 1)
                  : viewMode === "semana"
                    ? setWeekOffset((w) => w + 1)
                    : setMonthOffset((m) => m + 1)
              }
            >
              →
            </button>
          </div>
        }

      >
        {viewMode === "dia" ? (
          <div className="space-y-2 text-sm">
            {dayCursorEvents.length === 0 && <Empty>Nenhum compromisso neste dia.</Empty>}
            {dayCursorEvents.map((event) => {
              const meta = categoryMeta(event.category);
              const done = event.status === "concluido";
              const u = URGENCY_META[dayUrgency(event.starts_at, done)];
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <span className={`h-10 w-1 shrink-0 rounded-full ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${done ? "line-through opacity-60" : ""}`}>
                      {formatTime(event.starts_at)} · {event.title}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={`h-1.5 w-1.5 rounded-full ${u.dot}`} />
                      {meta.label} · {event.duration_min} min · {done ? "concluído" : event.status}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button
                      className="text-brand"
                      onClick={() =>
                        toggleStatus.mutate({
                          id: event.id,
                          status: done ? "pendente" : "concluido",
                        })
                      }
                    >
                      {done ? "Reabrir" : "Concluir"}
                    </button>
                    <button
                      className="text-muted-foreground hover:text-rose"
                      onClick={() => removeEvent.mutate(event.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === "mes" ? (
          <>
            <div className="mb-2 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => (
                <p
                  key={d}
                  className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthDays.map((day) => {
                const inMonth = day.getMonth() === monthCursor.getMonth();
                const isToday = isSameDay(day, new Date());
                const dayEvents = events
                  .filter((e) => isSameDay(new Date(e.starts_at), day))
                  .sort((a, b) => {
                    const rank = { atrasado: 0, proximo: 1, em_dia: 2 } as const;
                    const ra = rank[dayUrgency(a.starts_at, a.status === "concluido")];
                    const rb = rank[dayUrgency(b.starts_at, b.status === "concluido")];
                    return ra - rb || a.starts_at.localeCompare(b.starts_at);
                  });
                const critical = dayEvents[0];
                const criticalUrgency = critical
                  ? dayUrgency(critical.starts_at, critical.status === "concluido")
                  : null;
                const heat =
                  !inMonth
                    ? "bg-muted/40 text-muted-foreground/50"
                    : criticalUrgency === "atrasado"
                      ? "bg-rose text-white"
                      : criticalUrgency === "proximo"
                        ? "bg-amber text-amber-950"
                        : criticalUrgency === "em_dia"
                          ? "bg-sage text-white"
                          : "bg-muted text-muted-foreground";
                const count = dayEvents.length;
                return (
                  <Popover key={day.toISOString()}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`group relative aspect-square w-full rounded-lg p-1 text-left transition-transform active:scale-95 ${heat} ${
                          isToday ? "ring-2 ring-brand ring-offset-1" : ""
                        }`}
                      >
                        <span className="absolute left-1.5 top-1 text-[10px] font-semibold leading-none">
                          {day.getDate()}
                        </span>
                        {count > 1 && (
                          <span className="absolute bottom-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/90 px-1 text-[9px] font-bold text-foreground shadow-sm">
                            {count}
                          </span>
                        )}
                        {count === 1 && (
                          <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-white/90 shadow-sm" />
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="center"
                      side="top"
                      className="w-64 space-y-2 p-3"
                    >
                      <p className="text-xs font-semibold text-foreground">
                        {day.toLocaleDateString("pt-BR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                      {count === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum compromisso.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {dayEvents.map((event) => {
                            const done = event.status === "concluido";
                            const u = URGENCY_META[dayUrgency(event.starts_at, done)];
                            return (
                              <div
                                key={event.id}
                                className="flex items-start gap-2 rounded-md border border-border bg-card p-2 text-[11px]"
                              >
                                <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${u.dot}`} />
                                <div className="min-w-0 flex-1">
                                  <p className={`truncate font-medium ${done ? "line-through opacity-60" : ""}`}>
                                    {event.title}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {formatTime(event.starts_at)} · {event.duration_min}min
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              {(Object.keys(URGENCY_META) as Array<keyof typeof URGENCY_META>).map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${URGENCY_META[k].dot}`} />
                  {URGENCY_META[k].emoji} {URGENCY_META[k].label}
                </span>
              ))}
            </div>
          </>
        ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {days.map((day) => {
            const dayEvents = events
              .filter((e) => isSameDay(new Date(e.starts_at), day))
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                className={`rounded-xl border p-3 ${
                  isToday ? "border-brand bg-brand/5" : "border-border"
                }`}
              >
                <p className="text-xs font-semibold">
                  {day.toLocaleDateString("pt-BR", { weekday: "short" })}{" "}
                  <span className="text-muted-foreground">{day.getDate()}</span>
                </p>
                <div className="mt-2 space-y-2">
                  {dayEvents.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Livre</p>
                  )}
                  {dayEvents.map((event) => {
                    const meta = categoryMeta(event.category);
                    const done = event.status === "concluido";
                    return (
                      <div
                        key={event.id}
                        className="rounded-lg border border-border p-2 text-[11px]"
                      >
                        <div className="flex items-start gap-1.5">
                          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${meta.color}`} />
                          <p className={`flex-1 font-medium ${done ? "line-through opacity-60" : ""}`}>
                            {event.title}
                          </p>
                        </div>
                        <p className="mt-0.5 pl-3 text-muted-foreground">
                          {formatTime(event.starts_at)} · {event.duration_min}min
                        </p>
                        <div className="mt-1 flex gap-2 pl-3">
                          <button
                            className="text-brand"
                            onClick={() =>
                              toggleStatus.mutate({
                                id: event.id,
                                status: done ? "pendente" : "concluido",
                              })
                            }
                          >
                            {done ? "Reabrir" : "Concluir"}
                          </button>
                          <button
                            className="text-muted-foreground hover:text-rose"
                            onClick={() => removeEvent.mutate(event.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </Panel>

      <Panel title={longDate(new Date())}>
        {events.filter((e) => isSameDay(new Date(e.starts_at), new Date())).length === 0 ? (
          <Empty>Nenhum compromisso hoje.</Empty>
        ) : (
          <p className="text-sm text-muted-foreground">
            Você tem{" "}
            {events.filter((e) => isSameDay(new Date(e.starts_at), new Date())).length}{" "}
            compromisso(s) hoje.
          </p>
        )}
      </Panel>
    </>
  );
}
