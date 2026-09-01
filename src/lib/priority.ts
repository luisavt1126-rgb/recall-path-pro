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

const DAY_MS = DAY;

// ---------------------------------------------------------------------------
// Ranking 1 — baralhos do Anki (revisão atrasada, tempo desde a última revisão
// e fragilidade do intervalo FSRS/SRS). Não mistura desempenho em questões.
// ---------------------------------------------------------------------------

export type DeckPriorityInput = {
  next_review_at: string | null;
  last_review_at: string | null;
  interval_days: number;
  status: string;
};

export type Reason = { text: string; tone: "rose" | "amber" | "violet" | "sage" };

export function deckPriority(input: DeckPriorityInput) {
  let score = 0;
  const reasons: Reason[] = [];

  if (input.next_review_at) {
    const overdue = (Date.now() - new Date(input.next_review_at).getTime()) / DAY_MS;
    if (overdue >= 1) {
      score += Math.min(45, 12 + overdue * 5);
      reasons.push({ text: `revisão atrasada ${Math.floor(overdue)}d`, tone: "rose" });
    } else if (overdue >= 0) {
      score += 22;
      reasons.push({ text: "vence hoje", tone: "amber" });
    }
  } else {
    score += 20;
    reasons.push({ text: "sem revisão agendada", tone: "violet" });
  }

  if (input.last_review_at) {
    const days = (Date.now() - new Date(input.last_review_at).getTime()) / DAY_MS;
    score += Math.min(20, days * 0.5);
    if (days >= 21) {
      reasons.push({ text: `${Math.floor(days)}d sem abrir`, tone: "amber" });
    }
  } else {
    score += 16;
    reasons.push({ text: "nunca revisado", tone: "violet" });
  }

  const interval = Number(input.interval_days) || 0;
  if (interval > 0 && interval <= 3) {
    score += 12;
    reasons.push({ text: `intervalo curto (${interval}d)`, tone: "rose" });
  } else if (interval > 3 && interval <= 7) {
    score += 6;
  }

  if (input.status === "novo") {
    score += 8;
    reasons.push({ text: "baralho novo", tone: "sage" });
  }

  return { score: Math.round(score), level: priorityLevel(Math.round(score)), reasons };
}

// ---------------------------------------------------------------------------
// Ranking 2 — assuntos por desempenho em questões (% de erro, erros recentes e
// incidência em provas). Independente do ranking de baralhos.
// ---------------------------------------------------------------------------

export type QuestionPriorityInput = {
  accuracy: number | null;
  total: number;
  recentErrors: number;
  exam_incidence: number;
};

export function questionPriority(input: QuestionPriorityInput) {
  let score = 0;
  const reasons: Reason[] = [];

  const errorPct = input.accuracy === null ? null : 100 - input.accuracy;

  if (errorPct !== null && input.total > 0) {
    score += Math.min(50, errorPct * 0.55);
    if (errorPct >= 50) {
      reasons.push({ text: `${errorPct}% de erro`, tone: "rose" });
    } else if (errorPct >= 30) {
      reasons.push({ text: `${errorPct}% de erro`, tone: "amber" });
    }
    if (input.total < 10) {
      reasons.push({ text: `amostra pequena (${input.total}q)`, tone: "violet" });
    }
  }

  if (input.recentErrors > 0) {
    score += Math.min(25, input.recentErrors * 3);
    if (input.recentErrors >= 3) {
      reasons.push({ text: `${input.recentErrors} erros em 30 dias`, tone: "rose" });
    }
  }

  score += (input.exam_incidence - 3) * 4;
  if (input.exam_incidence >= 4) {
    reasons.push({ text: "alta incidência em prova", tone: "amber" });
  }

  const final = Math.round(Math.max(0, score));
  return { score: final, level: priorityLevel(final), errorPct, reasons };
}
