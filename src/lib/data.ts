import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type Discipline = Tables["disciplines"]["Row"];
export type Subject = Tables["subjects"]["Row"];
export type SubjectSubtopic = Tables["subject_subtopics"]["Row"];
export type SubjectPrioritySnapshot = Tables["subject_priority_snapshots"]["Row"];
export type StudySession = Tables["study_sessions"]["Row"];
export type Review = Tables["reviews"]["Row"];
export type QuestionLog = Tables["question_logs"]["Row"];
export type AnkiDeck = Tables["anki_decks"]["Row"];
export type DeckSession = Tables["deck_sessions"]["Row"];
export type TaskCompletion = Tables["task_completions"]["Row"];
export type AgendaEvent = Tables["events"]["Row"];
export type Exam = Tables["exams"]["Row"];

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const userId = await currentUserId();
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useDisciplines() {
  return useQuery({
    queryKey: ["disciplines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disciplines")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Discipline[];
    },
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Subject[];
    },
  });
}

export function useSubjectSubtopics(subjectId?: string) {
  return useQuery({
    queryKey: ["subject_subtopics", subjectId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("subject_subtopics")
        .select("*")
        .order("created_at");
      if (subjectId) query = query.eq("subject_id", subjectId);
      const { data, error } = await query;
      if (error) throw error;
      return data as SubjectSubtopic[];
    },
    enabled: Boolean(subjectId),
  });
}

export function useSubjectPrioritySnapshots() {
  return useQuery({
    queryKey: ["subject_priority_snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_priority_snapshots")
        .select("*")
        .order("priority_score", { ascending: false });
      if (error) throw error;
      return data as SubjectPrioritySnapshot[];
    },
  });
}

export function useStudySessions() {
  return useQuery({
    queryKey: ["study_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as StudySession[];
    },
  });
}

export function useQuestionLogs() {
  return useQuery({
    queryKey: ["question_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as QuestionLog[];
    },
  });
}

export function useDecks() {
  return useQuery({
    queryKey: ["anki_decks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anki_decks")
        .select("*")
        .order("next_review_at", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as AnkiDeck[];
    },
  });
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("starts_at");
      if (error) throw error;
      return data as AgendaEvent[];
    },
  });
}

export function useExams() {
  return useQuery({
    queryKey: ["exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .order("exam_date");
      if (error) throw error;
      return data as Exam[];
    },
  });
}

export const EXAM_STATUS = [
  { value: "planejada", label: "Planejada" },
  { value: "inscrito", label: "Inscrito" },
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export function useReviews(subjectId?: string) {
  return useQuery({
    queryKey: ["reviews", subjectId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("reviews")
        .select("*")
        .order("reviewed_at", { ascending: false })
        .limit(500);
      if (subjectId) query = query.eq("subject_id", subjectId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Review[];
    },
  });
}

export type SubjectStats = {
  total: number;
  correct: number;
  errors: number;
  accuracy: number | null;
  recentErrors: number;
};

export function questionStatsBySubject(logs: QuestionLog[]) {
  const map = new Map<string, SubjectStats>();
  const monthAgo = Date.now() - 30 * 86_400_000;
  for (const log of logs) {
    if (!log.subject_id) continue;
    const entry =
      map.get(log.subject_id) ??
      { total: 0, correct: 0, errors: 0, accuracy: null, recentErrors: 0 };
    entry.total += log.total;
    entry.correct += log.correct;
    entry.errors += log.total - log.correct;
    if (new Date(log.created_at).getTime() > monthAgo) {
      entry.recentErrors += log.total - log.correct;
    }
    entry.accuracy = entry.total ? Math.round((entry.correct / entry.total) * 100) : null;
    map.set(log.subject_id, entry);
  }
  return map;
}

export const EMPTY_STATS: SubjectStats = {
  total: 0,
  correct: 0,
  errors: 0,
  accuracy: null,
  recentErrors: 0,
};

export const ACTIVITY_TYPES = [
  { value: "estudo", label: "Estudo novo" },
  { value: "revisao", label: "Revisão" },
  { value: "questoes", label: "Questões" },
  { value: "flashcards", label: "Flashcards" },
  { value: "aula", label: "Aula" },
] as const;

export const EVENT_CATEGORIES = [
  { value: "estudar", label: "Estudar", color: "bg-brand" },
  { value: "revisar", label: "Revisar", color: "bg-violet" },
  { value: "questoes", label: "Questões", color: "bg-amber" },
  { value: "flashcards", label: "Flashcards", color: "bg-sage" },
  { value: "aula_faculdade", label: "Aula da faculdade", color: "bg-foreground/60" },
  { value: "prova_faculdade", label: "Prova da faculdade", color: "bg-rose" },
  { value: "entrega_trabalho", label: "Entrega de trabalho", color: "bg-violet/80" },
  { value: "med_curso", label: "Cursinho / Med", color: "bg-rose" },
  { value: "outro", label: "Outro", color: "bg-muted-foreground" },
] as const;


export function categoryMeta(value: string) {
  return (
    EVENT_CATEGORIES.find((c) => c.value === value) ?? {
      value: "outro",
      label: "Outro",
      color: "bg-muted-foreground",
    }
  );
}

export type ExamAnalysis = Tables["exam_analyses"]["Row"];
export type ExamTopic = Tables["exam_topics"]["Row"];

export function useExamAnalyses() {
  return useQuery({
    queryKey: ["exam_analyses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_analyses")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ExamAnalysis[];
    },
  });
}

export function useExamTopics() {
  return useQuery({
    queryKey: ["exam_topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_topics")
        .select("*")
        .order("incidence_pct", { ascending: false });
      if (error) throw error;
      return data as ExamTopic[];
    },
  });
}

export function useDeckSessions() {
  return useQuery({
    queryKey: ["deck_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deck_sessions")
        .select("*")
        .order("reviewed_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as DeckSession[];
    },
  });
}

export function useTaskCompletions() {
  return useQuery({
    queryKey: ["task_completions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_completions")
        .select("*")
        .order("completed_on", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as TaskCompletion[];
    },
  });
}

/**
 * Taxa de acerto real de um baralho (0-100) com base nas últimas `lastN`
 * sessões que registraram cartões corretos/total. Retorna null se não houver.
 */
export function deckAccuracy(
  sessions: DeckSession[],
  deckId: string,
  lastN = 5,
): number | null {
  const rows = sessions
    .filter((s) => s.deck_id === deckId && (s.total_cards ?? 0) > 0)
    .slice(0, lastN);
  if (rows.length === 0) return null;
  const total = rows.reduce((acc, r) => acc + (r.total_cards ?? 0), 0);
  const correct = rows.reduce((acc, r) => acc + (r.correct_cards ?? 0), 0);
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

/**
 * Domínio exibido de um assunto: quando ele tem subtópicos, mostra a média do
 * domínio dos filhos diretos (apenas na exibição, sem gravar no banco).
 */
export function displayMastery(subject: Subject, all: Subject[]): number {
  const children = all.filter((s) => s.parent_id === subject.id);
  if (children.length === 0) return subject.mastery;
  return Math.round(children.reduce((a, c) => a + c.mastery, 0) / children.length);
}
