// Camada pura de montagem dos inputs do motor de prioridade.
//
// Converte dados crus (já carregados de qualquer fonte) no formato esperado
// por `computePrioritySnapshot`, calculando o vencimento efetivo e o contato
// mais recente. Não toca no Supabase — é testável sem banco.

import type {
  DeckSession,
  PriorityEngineInput,
  QuestionBlock,
  RatingValue,
  SubjectReview,
} from "./priorityEngine";

export type RawSubjectContact = {
  nextReviewAt: string | null;
  lastStudiedAt: string | null;
  firstStudiedAt: string | null;
  videoWatchedAt: string | null;
  summaryReadyAt: string | null;
  deckReadyAt: string | null;
};

export type RawQuestionLog = {
  createdAt: string;
  total: number;
  correct: number;
};

export type RawReview = {
  rating: string;
  reviewedAt: string;
};

export type RawStudySession = {
  startedAt: string;
};

export type RawDeck = {
  nextReviewAt: string | null;
};

export type RawDeckSession = {
  rating: string | null;
  reviewedAt: string;
};

export type RawQuestionError = {
  createdAt: string;
  errorCount: number;
  reason: string | null;
  status?: string | null | undefined;
};

const RATING_VALUES: ReadonlySet<string> = new Set([
  "muito_dificil",
  "dificil",
  "bom",
  "facil",
]);

/** Converte um rating cru em `RatingValue`; devolve null para valores desconhecidos. */
function asRatingValue(rating: string | null): RatingValue | null {
  return rating !== null && RATING_VALUES.has(rating) ? (rating as RatingValue) : null;
}

/**
 * Vencimento efetivo: o "maior risco" entre o vencimento do próprio assunto e
 * os baralhos vinculados já vencidos. Devolve o timestamp mais antigo (mais
 * atrasado), ou null se não houver risco.
 */
export function computeEffectiveNextReviewAt(
  subjectNextReviewAt: string | null,
  decks: RawDeck[],
  now: Date,
): string | null {
  const nowMs = now.getTime();
  const candidates: number[] = [];

  if (subjectNextReviewAt) candidates.push(new Date(subjectNextReviewAt).getTime());

  for (const deck of decks) {
    if (!deck.nextReviewAt) continue;
    const t = new Date(deck.nextReviewAt).getTime();
    if (t <= nowMs) candidates.push(t); // apenas baralho vencido é risco
  }

  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates)).toISOString();
}

/**
 * Contato mais recente entre todas as fontes: estudo, questões, revisão do
 * assunto, sessão de baralho e checklist de preparo.
 */
export function computeLastContactAt(
  subject: RawSubjectContact,
  questionLogs: RawQuestionLog[],
  reviews: RawReview[],
  studySessions: RawStudySession[],
  deckSessions: RawDeckSession[],
): string | null {
  const candidates: number[] = [];

  for (const value of [
    subject.lastStudiedAt,
    subject.firstStudiedAt,
    subject.videoWatchedAt,
    subject.summaryReadyAt,
    subject.deckReadyAt,
  ]) {
    if (value) candidates.push(new Date(value).getTime());
  }
  for (const q of questionLogs) candidates.push(new Date(q.createdAt).getTime());
  for (const r of reviews) candidates.push(new Date(r.reviewedAt).getTime());
  for (const s of studySessions) candidates.push(new Date(s.startedAt).getTime());
  for (const d of deckSessions) candidates.push(new Date(d.reviewedAt).getTime());

  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

export function buildPriorityEngineInput(params: {
  subject: RawSubjectContact;
  questionLogs: RawQuestionLog[];
  reviews: RawReview[];
  studySessions: RawStudySession[];
  decks: RawDeck[];
  deckSessions: RawDeckSession[];
  questionErrors: RawQuestionError[];
  now: Date;
}): PriorityEngineInput {
  const questionBlocks: QuestionBlock[] = params.questionLogs.map((q) => ({
    createdAt: q.createdAt,
    total: q.total,
    correct: q.correct,
  }));

  const subjectReviews: SubjectReview[] = [];
  for (const r of params.reviews) {
    const rating = asRatingValue(r.rating);
    if (rating !== null) subjectReviews.push({ rating, reviewedAt: r.reviewedAt });
  }

  const deckSessions: DeckSession[] = params.deckSessions.map((d) => ({
    rating: asRatingValue(d.rating),
    reviewedAt: d.reviewedAt,
  }));

  return {
    now: params.now,
    questionBlocks,
    subjectReviews,
    deckSessions,
    manualErrors: params.questionErrors.map((e) => ({
      createdAt: e.createdAt,
      errorCount: e.errorCount,
      reason: e.reason,
      ...(e.status != null ? { status: e.status } : {}),
    })),
    nextReviewAt: computeEffectiveNextReviewAt(params.subject.nextReviewAt, params.decks, params.now),
    lastContactAt: computeLastContactAt(
      params.subject,
      params.questionLogs,
      params.reviews,
      params.studySessions,
      params.deckSessions,
    ),
  };
}
