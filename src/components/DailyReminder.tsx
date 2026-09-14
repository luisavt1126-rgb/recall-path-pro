import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import { useDecks, useSubjects } from "@/lib/data";
import { isSameDay } from "@/lib/format";

export function DailyReminder() {
  const { data: subjects = [] } = useSubjects();
  const { data: decks = [] } = useDecks();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const now = new Date();
    const dueDates = [...subjects.map((row) => row.next_review_at), ...decks.map((row) => row.next_review_at)].filter(Boolean) as string[];
    const overdue = dueDates.filter((value) => new Date(value) < new Date(now.getFullYear(), now.getMonth(), now.getDate())).length;
    const today = dueDates.filter((value) => isSameDay(new Date(value), now)).length;
    const key = now.toISOString().slice(0, 10);

    void (async () => {
      if (overdue === 0) {
        const userId = await requireUserId();
        await supabase.from("task_completions").upsert(
          { user_id: userId, task_key: "day-clear", completed_on: key },
          { onConflict: "user_id,task_key,completed_on" },
        );
      }
      if (Notification.permission !== "granted" || localStorage.getItem("daily-reminder") !== "on") return;
      if (localStorage.getItem("daily-reminder-last") === key) return;
      if (overdue + today === 0) return;
      new Notification("Residuum · Revisões de hoje", {
        body: `${overdue} atrasada(s) e ${today} prevista(s) para hoje.`,
        icon: "/pwa-192.png",
      });
      localStorage.setItem("daily-reminder-last", key);
    })();
  }, [subjects, decks]);

  return null;
}