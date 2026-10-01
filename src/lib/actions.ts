import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { scheduleReview, nextDeckInterval, type Rating, type SrsState } from "@/lib/srs";
import type { AnkiDeck, Subject } from "@/lib/data";
import { recalculateSubjectPriority } from "@/lib/priorityEngine.service";

export async function requireUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada");
  return data.user.id;
}

export function useRateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ subject, rating, minutes, activityType }: { subject: Subject; rating: Rating; minutes?: number; activityType?: string }) => {
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

      if (minutes && minutes > 0) {
        const { error: sessionError } = await supabase.from("study_sessions").insert({
          user_id: userId,
          subject_id: subject.id,
          activity_type: activityType ?? "revisao",
          minutes,
          started_at: now,
        });
        if (sessionError) throw sessionError;
      }

      void recalculateSubjectPriority(userId, subject.id).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", subject.id, err);
      });

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

      if (input.subject_id) {
        void recalculateSubjectPriority(userId, input.subject_id).catch((err) => {
          console.warn("Falha ao recalcular prioridade do assunto", input.subject_id, err);
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Sessão de estudo registrada");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

type PrepField = "video_watched_at" | "summary_ready_at" | "deck_ready_at";

/**
 * Inicia o ciclo de revisão espaçada de um assunto caso ele ainda esteja zerado.
 * Preenche first_studied_at (se vazio) e agenda a primeira revisão em D+1
 * (se ainda não houver next_review_at). Nunca sobrescreve ciclos em andamento.
 */
export async function startSubjectCycle(subjectId: string, at?: string) {
  const now = at ?? new Date().toISOString();
  const { data: subject } = await supabase
    .from("subjects")
    .select("first_studied_at, next_review_at, interval_days")
    .eq("id", subjectId)
    .maybeSingle();
  if (!subject) return;

  const patch: Partial<Subject> = {};
  if (!subject["first_studied_at"]) patch.first_studied_at = now;
  if (!subject["next_review_at"]) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    patch.next_review_at = next.toISOString();
    if (!Number(subject["interval_days"])) patch.interval_days = 1;
  }
  if (Object.keys(patch).length === 0) return;
  await supabase.from("subjects").update(patch).eq("id", subjectId);
}

/**
 * Marca/desmarca um item do checklist de preparo do assunto.
 * Ao marcar pela primeira vez, inicia o ciclo de revisão do assunto.
 */
export function useSetSubjectPrep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      subject,
      field,
      done,
    }: {
      subject: Subject;
      field: PrepField;
      done: boolean;
    }) => {
      const now = new Date().toISOString();
      const patch: Partial<Subject> = { [field]: done ? now : null };
      const { error } = await supabase.from("subjects").update(patch).eq("id", subject.id);
      if (error) throw error;
      if (done) await startSubjectCycle(subject.id, now);

      void recalculateSubjectPriority(subject.user_id, subject.id).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", subject.id, err);
      });

      return done;
    },
    onSuccess: (done) => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success(done ? "Marcado como pronto" : "Marcação removida");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Edita a data de um item do checklist de preparo (registro retroativo).
 * Se a nova data for anterior ao first_studied_at atual, recua o primeiro estudo.
 */
export function useSetSubjectPrepDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      subject,
      field,
      date,
    }: {
      subject: Subject;
      field: PrepField;
      date: string; // yyyy-mm-dd
    }) => {
      const iso = new Date(`${date}T12:00:00`).toISOString();
      const patch: Partial<Subject> = { [field]: iso };
      if (!subject.first_studied_at || iso < subject.first_studied_at) {
        patch.first_studied_at = iso;
      }
      const { error } = await supabase.from("subjects").update(patch).eq("id", subject.id);
      if (error) throw error;
      await startSubjectCycle(subject.id, iso);

      void recalculateSubjectPriority(subject.user_id, subject.id).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", subject.id, err);
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Data atualizada");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}




const clampMastery = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Puxa o domínio do assunto levemente em direção à taxa de acerto do bloco
 * (peso 0.8 para o domínio atual, 0.2 para o bloco).
 */
export async function nudgeMasteryFromQuestions(subjectId: string, accuracyPct: number) {
  const { data: subject } = await supabase
    .from("subjects")
    .select("mastery")
    .eq("id", subjectId)
    .maybeSingle();
  if (!subject) return;
  const current = Number(subject["mastery"] ?? 0);
  await supabase
    .from("subjects")
    .update({ mastery: clampMastery(current * 0.8 + accuracyPct * 0.2) })
    .eq("id", subjectId);
}

/** Ajusta o domínio do assunto em +/- delta pontos, limitado a 0–100. */
export async function nudgeMastery(subjectId: string, delta: number) {
  const { data: subject } = await supabase
    .from("subjects")
    .select("mastery")
    .eq("id", subjectId)
    .maybeSingle();
  if (!subject) return;
  await supabase
    .from("subjects")
    .update({ mastery: clampMastery(Number(subject["mastery"] ?? 0) + delta) })
    .eq("id", subjectId);
}

/**
 * Registra uma sessão de baralho (Anki/Flashcards) informando apenas a
 * quantidade planejada, a quantidade feita e se a sessão foi concluída —
 * sem contagem de erros nem rating manual (esse dado é inviável de extrair
 * do Anki durante o estudo).
 *
 * - Concluída (completed = true, ou feitos >= planejados): expande o intervalo
 *   do SRS e agenda a próxima revisão.
 * - Não concluída: reseta o intervalo para D+1, mantendo o baralho nas
 *   pendências da Tela Hoje e do Calendário.
 */
export function useRateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deck,
      cards_planned,
      cards_done,
      completed,
      minutes,
    }: {
      deck: AnkiDeck;
      cards_planned: number;
      cards_done: number;
      completed: boolean;
      minutes?: number;
    }) => {
      const userId = await requireUserId();
      const now = new Date();
      const planned = Number(cards_planned) || 0;
      const done = Number(cards_done) || 0;
      const effectiveCompleted = completed || (planned > 0 && done >= planned);
      const rating: Rating = effectiveCompleted ? "facil" : "muito_dificil";
      const interval = nextDeckInterval(Number(deck.interval_days), rating);

      const { error } = await supabase.from("deck_sessions").insert({
        user_id: userId,
        deck_id: deck.id,
        cards_reviewed: done,
        rating,
      });
      if (error) throw error;

      const { error: updateError } = await supabase
        .from("anki_decks")
        .update({
          interval_days: interval,
          last_review_at: now.toISOString(),
          next_review_at: new Date(now.getTime() + interval * 86_400_000).toISOString(),
          status: effectiveCompleted ? "revisao" : "reforco",
        })
        .eq("id", deck.id);
      if (updateError) throw updateError;

      if (minutes && minutes > 0) {
        const { error: sessionError } = await supabase.from("study_sessions").insert({
          user_id: userId,
          subject_id: deck.subject_id,
          activity_type: "anki",
          minutes,
          started_at: now.toISOString(),
        });
        if (sessionError) throw sessionError;
      }

      if (deck.subject_id) {
        await startSubjectCycle(deck.subject_id, now.toISOString());
        void recalculateSubjectPriority(userId, deck.subject_id).catch((err) => {
          console.warn("Falha ao recalcular prioridade do assunto", deck.subject_id, err);
        });
      }

      return { interval, rating };
    },
    onSuccess: ({ interval }) => {
      qc.invalidateQueries();
      toast.success(`Sessão registrada · próxima em ${interval} dia(s)`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
