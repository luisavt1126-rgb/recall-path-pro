import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { scheduleReview, type Rating, type SrsState } from "@/lib/srs";
import type { Subject } from "@/lib/data";

export async function requireUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada");
  return data.user.id;
}

export function useRateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ subject, rating }: { subject: Subject; rating: Rating }) => {
      const userId = await requireUserId();
      const state: SrsState = {
        interval_days: Number(subject.interval_days),
        ease: Number(subject.ease),
        reps: subject.reps,
        lapses: subject.lapses,
        stability: Number(subject.stability),
        difficulty: Number(subject.difficulty),
        mastery: subject.mastery,
      };
      const next = scheduleReview(state, rating);
      const now = new Date().toISOString();

      const { error: reviewError } = await supabase.from("reviews").insert({
        user_id: userId,
        subject_id: subject.id,
        rating,
        interval_before: next.interval_before,
        interval_after: next.interval_days,
      });
      if (reviewError) throw reviewError;

      const { error } = await supabase
        .from("subjects")
        .update({
          interval_days: next.interval_days,
          ease: next.ease,
          reps: next.reps,
          lapses: next.lapses,
          stability: next.stability,
          difficulty: next.difficulty,
          mastery: next.mastery,
          next_review_at: next.next_review_at,
          last_studied_at: now,
          review_count: subject.review_count + 1,
          first_studied_at: subject.first_studied_at ?? now,
        })
        .eq("id", subject.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.invalidateQueries();
      toast.success(
        `Revisão registrada · próxima em ${Math.round(next.interval_days)} dia(s)`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useLogStudySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      subject_id: string | null;
      discipline_id: string | null;
      activity_type: string;
      minutes: number;
      started_at?: string;
      notes?: string | null;
    }) => {
      const userId = await requireUserId();
      const startedAt = input.started_at ?? new Date().toISOString();
      const { error } = await supabase.from("study_sessions").insert({
        user_id: userId,
        subject_id: input.subject_id,
        discipline_id: input.discipline_id,
        activity_type: input.activity_type,
        minutes: input.minutes,
        started_at: startedAt,
        notes: input.notes ?? null,
      });
      if (error) throw error;

      if (input.subject_id) {
        const { data: subject } = await supabase
          .from("subjects")
          .select("first_studied_at")
          .eq("id", input.subject_id)
          .maybeSingle();
        await supabase
          .from("subjects")
          .update({
            last_studied_at: startedAt,
            first_studied_at: subject?.first_studied_at ?? startedAt,
          })
          .eq("id", input.subject_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Sessão de estudo registrada");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
