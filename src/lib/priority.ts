export type PriorityLevel = "critico" | "alta" | "normal" | "baixa";

export const PRIORITY_META: Record<
  PriorityLevel,
  { label: string; emoji: string; text: string; bg: string; bar: string }
> = {
  critico: {
    label: "Crítico",
    emoji: "🚨",
    text: "text-rose",
    bg: "bg-rose/8",
    bar: "bg-rose",
  },
  alta: {
    label: "Alta prioridade",
    emoji: "⚠️",
    text: "text-amber",
    bg: "bg-amber/8",
    bar: "bg-amber",
  },
  normal: {
    label: "Normal",
    emoji: "📌",
    text: "text-violet",
    bg: "bg-violet/8",
    bar: "bg-violet",
  },
  baixa: {
    label: "Baixa prioridade",
    emoji: "🟢",
    text: "text-sage",
    bg: "bg-sage/8",
    bar: "bg-sage",
  },
};

export type PriorityInput = {
  next_review_at: string | null;
  last_studied_at: string | null;
  mastery: number;
  exam_incidence: number;
  accuracy: number | null;
  recentErrors: number;
};

const DAY = 86_400_000;

export function priorityScore(input: PriorityInput) {
  let score = 0;

  if (input.next_review_at) {
    const overdue = (Date.now() - new Date(input.next_review_at).getTime()) / DAY;
    if (overdue > 0) score += Math.min(40, 10 + overdue * 4);
  } else {
    score += 8;
  }

  score += ((100 - input.mastery) / 100) * 25;

  if (input.accuracy !== null && input.accuracy < 70) {
    score += ((70 - input.accuracy) / 70) * 20;
  }
  score += Math.min(15, input.recentErrors * 2);

  if (input.last_studied_at) {
    const days = (Date.now() - new Date(input.last_studied_at).getTime()) / DAY;
    score += Math.min(12, days * 0.4);
  } else {
    score += 6;
  }

  score += (input.exam_incidence - 3) * 3;

  return Math.round(Math.max(0, score));
}

export function priorityLevel(score: number): PriorityLevel {
  if (score >= 60) return "critico";
  if (score >= 40) return "alta";
  if (score >= 22) return "normal";
  return "baixa";
}
