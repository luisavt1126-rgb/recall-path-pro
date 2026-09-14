import type { AnkiDeck, DeckSession, QuestionLog, Review, StudySession, Subject, TaskCompletion } from "@/lib/data";
import { startOfDay } from "@/lib/format";

const DAY = 86_400_000;

export type StudyInsight = { tone: "rose" | "amber" | "violet"; title: string; detail: string };

export function identifyPatterns(
  logs: QuestionLog[],
  subjects: Subject[],
  reviews: Review[],
  decks: AnkiDeck[],
): StudyInsight[] {
  const insights: StudyInsight[] = [];
  const bank = new Map<string, { total: number; correct: number }>();
  for (const log of logs) {
    if (!log.banca) continue;
    const row = bank.get(log.banca) ?? { total: 0, correct: 0 };
    row.total += log.total;
    row.correct += log.correct;
    bank.set(log.banca, row);
  }
  const weakBank = [...bank.entries()]
    .filter(([, row]) => row.total >= 10)
    .map(([name, row]) => ({ name, ...row, accuracy: Math.round((row.correct / row.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  if (weakBank && weakBank.accuracy < 70) insights.push({
    tone: "rose",
    title: `Erros concentrados na banca ${weakBank.name}`,
    detail: `${weakBank.accuracy}% de acerto em ${weakBank.total} questões. Priorize blocos dessa banca.`,
  });

  const bySubject = new Map<string, QuestionLog[]>();
  for (const log of logs) if (log.subject_id) bySubject.set(log.subject_id, [...(bySubject.get(log.subject_id) ?? []), log]);
  const recurring = [...bySubject.entries()].map(([id, rows]) => {
    const sorted = rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const recent = sorted.slice(0, 3);
    const total = recent.reduce((sum, row) => sum + row.total, 0);
    const correct = recent.reduce((sum, row) => sum + row.correct, 0);
    return { id, blocks: recent.length, total, accuracy: total ? Math.round((correct / total) * 100) : 100 };
  }).filter((row) => row.blocks >= 2 && row.total >= 10 && row.accuracy < 65).sort((a, b) => a.accuracy - b.accuracy)[0];
  if (recurring) {
    const subject = subjects.find((item) => item.id === recurring.id);
    const hasDeck = decks.some((deck) => deck.subject_id === recurring.id);
    insights.push({
      tone: "amber",
      title: `${subject?.name ?? "Um assunto"} voltou a apresentar erros`,
      detail: `${recurring.accuracy}% nos últimos ${recurring.blocks} blocos. ${hasDeck ? "Considere refazer o baralho vinculado." : "Considere criar um baralho de reforço."}`,
    });
  }

  const stale = subjects.filter((subject) => subject.last_studied_at && subject.mastery >= 50)
    .map((subject) => ({ subject, days: Math.floor((Date.now() - new Date(subject.last_studied_at as string).getTime()) / DAY) }))
    .filter((row) => row.days >= 14)
    .sort((a, b) => b.days - a.days)[0];
  if (stale) insights.push({
    tone: "violet",
    title: `${stale.subject.name} está há ${stale.days} dias sem revisão`,
    detail: `O domínio atual é ${stale.subject.mastery}%. Uma revisão curta agora reduz o risco de queda.`,
  });

  if (insights.length === 0 && reviews.length > 0) insights.push({
    tone: "violet",
    title: "Nenhum padrão preocupante recente",
    detail: "Continue registrando questões por assunto e banca para aumentar a precisão da análise.",
  });
  return insights.slice(0, 3);
}

function dateKey(value: string | Date) {
  return startOfDay(new Date(value)).toISOString().slice(0, 10);
}

export function currentStudyStreak(sessions: StudySession[], logs: QuestionLog[], reviews: Review[], deckSessions: DeckSession[]) {
  const active = new Set<string>();
  sessions.forEach((row) => active.add(dateKey(row.started_at)));
  logs.forEach((row) => active.add(dateKey(row.created_at)));
  reviews.forEach((row) => active.add(dateKey(row.reviewed_at)));
  deckSessions.forEach((row) => active.add(dateKey(row.reviewed_at)));
  let streak = 0;
  const cursor = startOfDay(new Date());
  if (!active.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (active.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function clearReviewStreak(completions: TaskCompletion[]) {
  const clear = new Set(completions.filter((row) => row.task_key === "day-clear").map((row) => row.completed_on));
  let streak = 0;
  const cursor = startOfDay(new Date());
  while (clear.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}