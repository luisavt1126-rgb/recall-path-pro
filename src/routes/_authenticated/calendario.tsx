import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import { EVENT_CATEGORIES, categoryMeta, useEvents, useSubjects } from "@/lib/data";
import { Panel, Empty, Field, inputClass, buttonClass } from "@/components/bits";
import { addDays, formatTime, isSameDay, longDate, startOfWeek } from "@/lib/format";

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
  const [weekOffset, setWeekOffset] = useState(0);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("estudar");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("19:00");
  const [duration, setDuration] = useState("60");

  const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const createEvent = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const startsAt = new Date(`${date}T${time}:00`);
      const { error } = await supabase.from("events").insert({
        user_id: userId,
        title: title.trim(),
        category,
        subject_id: subjectId || null,
        starts_at: startsAt.toISOString(),
        duration_min: Number(duration),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries();
      toast.success("Compromisso adicionado");
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

  return (
    <>
      <Panel title="Novo compromisso">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) createEvent.mutate();
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
          <div className="lg:col-span-6">
            <button className={buttonClass}>Adicionar à agenda</button>
          </div>
        </form>
      </Panel>

      <Panel
        title={`Semana de ${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`}
        action={
          <div className="flex gap-2 text-xs">
            <button
              className="rounded-lg border border-border px-2 py-1"
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              ←
            </button>
            <button
              className="rounded-lg border border-border px-2 py-1"
              onClick={() => setWeekOffset(0)}
            >
              Hoje
            </button>
            <button
              className="rounded-lg border border-border px-2 py-1"
              onClick={() => setWeekOffset((w) => w + 1)}
            >
              →
            </button>
          </div>
        }
      >
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
