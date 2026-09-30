// Motor de prioridade por assunto — base pura, determinística e versionada.
//
// Este módulo NÃO depende de React/Supabase e NÃO é conectado ao frontend.
// Ele recebe evidências já carregadas e devolve um resultado pronto para ser
// persistido em `subject_priority_snapshots` (via `priorityEngine.upsert.ts`).
//
// Não substitui `questionPriority`/`deckPriority` (em src/lib/priority.ts),
// que continuam ativos. `mastery`, `exam_incidence` e os campos SRS ficam de
// fora do score por decisão de projeto (ver .lovable/plan).

import { ERROR_STATUS_WEIGHT, normalizeStatus } from "./errorStatus";

export const ENGINE_VERSION = "1.2.0";

export type KnowledgeState =
  | "NEW"
  | "FRAGILE"
  | "CONSOLIDATING"
  | "STABLE"
  | "DETERIORATING"
  | "PERSISTENT_GAP";

export type RatingValue = "muito_dificil" | "dificil" | "bom" | "facil";

/** Bloco agregado de questões (não há tentativas individuais no schema atual). */
export type QuestionBlock = {
  /** ISO timestamp do bloco. */
  createdAt: string;
  total: number;
  correct: number;
};

export type SubjectReview = {
  rating: RatingValue;
  reviewedAt: string;
};

export type DeckSession = {
  /** Pode ser null quando a sessão não registrou os 4 níveis do Anki. */
  rating: RatingValue | null;
  reviewedAt: string;
};

/** Erro anotado no caderno de erros (question_errors). */
export type ManualError = {
  createdAt: string;
  errorCount: number;
  reason: string | null;
  /** "ativo" | "em_melhora" | "resolvido" | "recorrente" (default "ativo"). */
  status?: string;
};

export type PriorityEngineInput = {
  now: Date;
  questionBlocks: QuestionBlock[];
  subjectReviews: SubjectReview[];
  deckSessions: DeckSession[];
  manualErrors: ManualError[];
  /**
   * Vencimento efetivo: o maior risco entre o vencimento do próprio assunto e
   * os baralhos vinculados vencidos (cabe ao chamador calcular e informar).
   */
  nextReviewAt: string | null;
  /**
   * Contato mais recente com o assunto, vindo de estudo, questões, revisão,
   * sessão de baralho ou checklist de preparo.
   */
  lastContactAt: string | null;
};

export type PrioritySnapshotResult = {
  priorityScore: number;
  knowledgeState: KnowledgeState;
  reason: string;
  questionScore: number;
  overdueScore: number;
  errorScore: number;
  stabilityScore: number;
  recentQuestions: number;
  recentAccuracy: number | null;
  historicalQuestions: number;
  historicalAccuracy: number | null;
  sampleConfidence: number;
  sampleIsEstimated: boolean;
  engineVersion: string;
};

// ---------------------------------------------------------------------------
// Constantes centralizadas e versionadas (todos os cortes ficam aqui).
// ---------------------------------------------------------------------------

export const DAY_MS = 86_400_000;

/** Tetos de cada componente (somam 100 pontos). */
export const COMPONENT_MAX = {
  question: 40,
  overdue: 25,
  error: 25,
  stability: 10,
} as const;

/** Amostra recente: janela e quantidade máxima de questões. */
export const RECENT_WINDOW_DAYS = 60;
export const RECENT_MAX_QUESTIONS = 30;

/** Atraso quando há vencimento. */
export const OVERDUE_FULL_DAYS = 30;
export const OVERDUE_DAY_INITIAL = 5;
/** Antiguidade quando há contato mas não há vencimento. */
export const STALE_START_DAYS = 14;
export const STALE_FULL_DAYS = 60;

/** Componente de erros. */
export const ERROR_VOLUME_CAP = 10;
export const ERROR_WEIGHT_VOLUME = 0.6;
export const ERROR_WEIGHT_RECURRENCE = 0.4;
export const ERROR_RECURRENCE_ACC_THRESHOLD = 70;
export const ERROR_RECURRENCE_BLOCKS = 3;
export const ERROR_MANUAL_WINDOW_DAYS = 30;

/** Componente de estabilidade/tendência. */
export const STABILITY_WEIGHT_TREND = 0.7;
export const STABILITY_WEIGHT_HARD = 0.3;
export const STABILITY_DROP_FULL = 20;
export const STABILITY_HARD_RATINGS = 5;

/** knowledge_state — cortes mínimos. */
export const DETERIORATION_MIN_RECENT = 10;
export const DETERIORATION_MIN_HISTORICAL = 20;
export const DETERIORATION_MIN_DROP = 10;

export const PERSISTENT_GAP_MIN_RECENT = 10;
export const PERSISTENT_GAP_MIN_HISTORICAL = 20;
export const PERSISTENT_GAP_RECENT_ACC = 60;
export const PERSISTENT_GAP_HISTORICAL_ACC = 70;

export const STABLE_MIN_RECENT = 20;
export const STABLE_MIN_ACC = 80;
export const STABLE_MAX_HARD_RATIO = 0.5;

export const FRAGILE_MAX_ACC = 70;
export const FRAGILE_MIN_SAMPLE = 10;
export const FRAGILE_OVERDUE_MIN = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Confiança da amostra em função da quantidade de questões recentes. */
export function sampleConfidence(count: number): number {
  if (count <= 0) return 0;
  if (count <= 4) return 0.1;
  if (count <= 9) return 0.3;
  if (count <= 19) return 0.55;
  if (count <= 39) return 0.8;
  return 1;
}

function daysFrom(nowMs: number, iso: string): number {
  return (nowMs - new Date(iso).getTime()) / DAY_MS;
}

type Sample = {
  recentQuestions: number;
  recentCorrect: number;
  recentAccuracy: number | null;
  recentErrors: number;
  historicalQuestions: number;
  historicalCorrect: number;
  historicalAccuracy: number | null;
  sampleConfidence: number;
  sampleIsEstimated: boolean;
};

/**
 * Monta a amostra recente (últimos 60 dias, até 30 questões, do mais novo ao
 * mais antigo) e o histórico de base (todo o restante). Quando um bloco de
 * fronteira estoura o limite, os acertos são alocados proporcionalmente e a
 * amostra é marcada como estimada.
 */
function buildSample(now: Date, blocks: QuestionBlock[]): Sample {
  const nowMs = now.getTime();
  const windowStart = nowMs - RECENT_WINDOW_DAYS * DAY_MS;

  const sorted = blocks
    .filter((b) => b.total > 0)
    .map((b) => ({ ...b, t: new Date(b.createdAt).getTime() }))
    .sort((a, b) => b.t - a.t);

  let recentQuestions = 0;
  let recentCorrect = 0;
  let historicalQuestions = 0;
  let historicalCorrect = 0;
  let sampleIsEstimated = false;

  let remaining = RECENT_MAX_QUESTIONS;

  for (const b of sorted) {
    if (b.t < windowStart || remaining <= 0) {
      historicalQuestions += b.total;
      historicalCorrect += b.correct;
      continue;
    }
    if (b.total <= remaining) {
      recentQuestions += b.total;
      recentCorrect += b.correct;
      remaining -= b.total;
    } else {
      const rate = b.correct / b.total;
      const takenCorrect = Math.round(rate * remaining);
      recentQuestions += remaining;
      recentCorrect += takenCorrect;
      historicalQuestions += b.total - remaining;
      historicalCorrect += b.correct - takenCorrect;
      remaining = 0;
      sampleIsEstimated = true;
    }
  }

  const recentAccuracy =
    recentQuestions > 0 ? Math.round((recentCorrect / recentQuestions) * 100) : null;
  const historicalAccuracy =
    historicalQuestions > 0
      ? Math.round((historicalCorrect / historicalQuestions) * 100)
      : null;

  return {
    recentQuestions,
    recentCorrect,
    recentAccuracy,
    recentErrors: Math.max(0, recentQuestions - recentCorrect),
    historicalQuestions,
    historicalCorrect,
    historicalAccuracy,
    sampleConfidence: sampleConfidence(recentQuestions),
    sampleIsEstimated,
  };
}

/** Proporção dos últimos blocos com acurácia abaixo do limiar (recorrência). */
function recurrenceRatio(blocks: QuestionBlock[]): number {
  const recent = blocks
    .filter((b) => b.total > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, ERROR_RECURRENCE_BLOCKS);
  if (recent.length === 0) return 0;
  const bad = recent.filter(
    (b) => (b.correct / b.total) * 100 < ERROR_RECURRENCE_ACC_THRESHOLD,
  ).length;
  return bad / recent.length;
}

/** Proporção de ratings "muito_dificil"/"dificil" entre as últimas avaliações. */
function hardRatingRatio(
  reviews: SubjectReview[],
  deckSessions: DeckSession[],
): number {
  const ratings = [
    ...reviews.map((r) => ({ rating: r.rating, t: new Date(r.reviewedAt).getTime() })),
    ...deckSessions
      .filter((d) => d.rating !== null)
      .map((d) => ({ rating: d.rating as RatingValue, t: new Date(d.reviewedAt).getTime() })),
  ]
    .sort((a, b) => b.t - a.t)
    .slice(0, STABILITY_HARD_RATINGS);

  if (ratings.length === 0) return 0;
  const hard = ratings.filter(
    (r) => r.rating === "muito_dificil" || r.rating === "dificil",
  ).length;
  return hard / ratings.length;
}

type OverdueInfo = {
  score: number;
  daysOverdue: number;
  daysSinceContact: number;
};

function overdueInfo(
  now: Date,
  nextReviewAt: string | null,
  lastContactAt: string | null,
): OverdueInfo {
  const nowMs = now.getTime();

  if (nextReviewAt) {
    const daysOverdue = daysFrom(nowMs, nextReviewAt);
    if (daysOverdue < 0) return { score: 0, daysOverdue: 0, daysSinceContact: 0 };
    const ramp = Math.min(1, daysOverdue / OVERDUE_FULL_DAYS);
    const score = round2(
      OVERDUE_DAY_INITIAL + (COMPONENT_MAX.overdue - OVERDUE_DAY_INITIAL) * ramp,
    );
    return { score, daysOverdue, daysSinceContact: 0 };
  }

  if (lastContactAt) {
    const daysSinceContact = daysFrom(nowMs, lastContactAt);
    if (daysSinceContact <= STALE_START_DAYS) {
      return { score: 0, daysOverdue: 0, daysSinceContact };
    }
    const span = STALE_FULL_DAYS - STALE_START_DAYS;
    const ramp = Math.min(1, (daysSinceContact - STALE_START_DAYS) / span);
    return {
      score: round2(COMPONENT_MAX.overdue * ramp),
      daysOverdue: 0,
      daysSinceContact,
    };
  }

  return { score: 0, daysOverdue: 0, daysSinceContact: 0 };
}

function questionScore(
  recentAccuracy: number | null,
  recentQuestions: number,
  confidence: number,
): number {
  if (recentQuestions <= 0 || recentAccuracy === null) return 0;
  const rawGap = 100 - recentAccuracy;
  return round2(COMPONENT_MAX.question * (rawGap / 100) * confidence);
}

type ErrorInfo = {
  score: number;
  manualRecentErrors: number;
  manualEntries: number;
};

function errorScore(
  recentErrors: number,
  recurrence: number,
  manualErrors: ManualError[],
  now: Date,
): ErrorInfo {
  const nowMs = now.getTime();

  // Erros "resolvido" não pesam (peso 0); "em_melhora" pesa menos (0.5).
  const weighted = manualErrors
    .map((e) => {
      const status = normalizeStatus(e.status);
      return { ...e, status, weight: ERROR_STATUS_WEIGHT[status] };
    })
    .filter((e) => e.weight > 0);

  const manualRecentErrors = weighted
    .filter((e) => new Date(e.createdAt).getTime() > nowMs - ERROR_MANUAL_WINDOW_DAYS * DAY_MS)
    .reduce((sum, e) => sum + e.errorCount * e.weight, 0);

  const manualEntries = weighted.length;
  const weightedEntries = weighted.reduce((sum, e) => sum + e.weight, 0);

  const volumeErrors = recentErrors + manualRecentErrors;
  const volume =
    COMPONENT_MAX.error * ERROR_WEIGHT_VOLUME * Math.min(1, volumeErrors / ERROR_VOLUME_CAP);

  const manualRecurrence = Math.min(1, weightedEntries / ERROR_RECURRENCE_BLOCKS);
  const effectiveRecurrence = Math.max(recurrence, manualRecurrence);
  const recur = COMPONENT_MAX.error * ERROR_WEIGHT_RECURRENCE * effectiveRecurrence;

  return {
    score: round2(volume + recur),
    manualRecentErrors,
    manualEntries,
  };
}

function stabilityScore(
  historicalAccuracy: number | null,
  recentAccuracy: number | null,
  hardRatio: number,
): number {
  let trend = 0;
  if (historicalAccuracy !== null && recentAccuracy !== null) {
    const drop = historicalAccuracy - recentAccuracy;
    const risk = clamp(drop, 0, STABILITY_DROP_FULL) / STABILITY_DROP_FULL;
    trend = COMPONENT_MAX.stability * STABILITY_WEIGHT_TREND * risk;
  }
  const hard = COMPONENT_MAX.stability * STABILITY_WEIGHT_HARD * hardRatio;
  return round2(trend + hard);
}

type StateContext = {
  started: boolean;
  recentQuestions: number;
  recentAccuracy: number | null;
  historicalQuestions: number;
  historicalAccuracy: number | null;
  recentErrors: number;
  recurrence: number;
  manualEntries: number;
  hardRatio: number;
  overdueScore: number;
};

function determineState(ctx: StateContext): KnowledgeState {
  const {
    started,
    recentQuestions,
    recentAccuracy,
    historicalQuestions,
    historicalAccuracy,
    recentErrors,
    recurrence,
    manualEntries,
    hardRatio,
    overdueScore,
  } = ctx;

  if (!started) return "NEW";

  if (
    recentQuestions >= PERSISTENT_GAP_MIN_RECENT &&
    historicalQuestions >= PERSISTENT_GAP_MIN_HISTORICAL &&
    recentAccuracy !== null &&
    recentAccuracy < PERSISTENT_GAP_RECENT_ACC &&
    historicalAccuracy !== null &&
    historicalAccuracy < PERSISTENT_GAP_HISTORICAL_ACC
  ) {
    return "PERSISTENT_GAP";
  }

  const drop =
    historicalAccuracy !== null && recentAccuracy !== null
      ? historicalAccuracy - recentAccuracy
      : 0;

  if (
    recentQuestions >= DETERIORATION_MIN_RECENT &&
    historicalQuestions >= DETERIORATION_MIN_HISTORICAL &&
    historicalAccuracy !== null &&
    recentAccuracy !== null &&
    drop >= DETERIORATION_MIN_DROP
  ) {
    return "DETERIORATING";
  }

  if (
    recentQuestions >= STABLE_MIN_RECENT &&
    recentAccuracy !== null &&
    recentAccuracy >= STABLE_MIN_ACC &&
    drop < DETERIORATION_MIN_DROP &&
    hardRatio < STABLE_MAX_HARD_RATIO
  ) {
    return "STABLE";
  }

  const lowConfidence = recentQuestions > 0 && recentQuestions < FRAGILE_MIN_SAMPLE;
  const recentWeak = recentAccuracy !== null && recentAccuracy < FRAGILE_MAX_ACC;
  const recurringErrors = recurrence > 0 || recentErrors > 0 || manualEntries > 0;
  const relevantOverdue = overdueScore >= FRAGILE_OVERDUE_MIN;

  if (lowConfidence || recentWeak || recurringErrors || relevantOverdue) {
    return "FRAGILE";
  }

  return "CONSOLIDATING";
}

type ReasonContext = {
  recentQuestions: number;
  recentAccuracy: number | null;
  historicalQuestions: number;
  historicalAccuracy: number | null;
  drop: number;
  recentErrors: number;
  recurrence: number;
  manualEntries: number;
  daysOverdue: number;
};

function buildReason(state: KnowledgeState, ctx: ReasonContext): string {
  switch (state) {
    case "NEW":
      return "Ainda não há atividade registrada para este assunto.";
    case "PERSISTENT_GAP":
      return `Gap persistente: ${ctx.recentAccuracy}% de acerto em ${ctx.recentQuestions} questões recentes e ${ctx.historicalAccuracy}% no histórico (${ctx.historicalQuestions} questões).`;
    case "DETERIORATING":
      return `Queda de ${Math.round(ctx.drop)} pontos entre o histórico (${ctx.historicalAccuracy}%) e o recente (${ctx.recentAccuracy}%).`;
    case "STABLE":
      return `Acurácia estável de ${ctx.recentAccuracy}% em ${ctx.recentQuestions} questões recentes.`;
    case "FRAGILE": {
      if (ctx.recentAccuracy !== null && ctx.recentAccuracy < FRAGILE_MAX_ACC) {
        return `Acurácia recente de ${ctx.recentAccuracy}% em ${ctx.recentQuestions} questões — reforço recomendado.`;
      }
      if (ctx.recurrence > 0 || ctx.recentErrors > 0) {
        return `${ctx.recentErrors} erros recentes — padrão de recorrência detectado.`;
      }
      if (ctx.manualEntries > 0) {
        return `${ctx.manualEntries} erro(s) no caderno de erros — reforço recomendado.`;
      }
      if (ctx.daysOverdue > 0) {
        return `${Math.floor(ctx.daysOverdue)} dias de atraso na revisão.`;
      }
      if (ctx.recentQuestions > 0 && ctx.recentQuestions < FRAGILE_MIN_SAMPLE) {
        return `Amostra pequena (${ctx.recentQuestions} questões) — confiança baixa.`;
      }
      return "Assunto iniciado, com sinais de fragilidade.";
    }
    case "CONSOLIDATING":
      return `Evolução adequada, mas ainda com pouca evidência (${ctx.recentQuestions} questões recentes).`;
    default:
      return "Prioridade calculada pelo motor.";
  }
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export function computePrioritySnapshot(input: PriorityEngineInput): PrioritySnapshotResult {
  const sample = buildSample(input.now, input.questionBlocks);
  const question = questionScore(sample.recentAccuracy, sample.recentQuestions, sample.sampleConfidence);
  const overdue = overdueInfo(input.now, input.nextReviewAt, input.lastContactAt);
  const recurrence = recurrenceRatio(input.questionBlocks);
  const error = errorScore(sample.recentErrors, recurrence, input.manualErrors, input.now);
  const hard = hardRatingRatio(input.subjectReviews, input.deckSessions);
  const stability = stabilityScore(sample.historicalAccuracy, sample.recentAccuracy, hard);

  const priorityScore = clamp(
    Math.round(question + overdue.score + error.score + stability),
    0,
    100,
  );

  const started =
    input.lastContactAt !== null ||
    input.nextReviewAt !== null ||
    sample.recentQuestions > 0 ||
    sample.historicalQuestions > 0 ||
    input.subjectReviews.length > 0 ||
    input.deckSessions.length > 0 ||
    input.manualErrors.length > 0;

  const knowledgeState = determineState({
    started,
    recentQuestions: sample.recentQuestions,
    recentAccuracy: sample.recentAccuracy,
    historicalQuestions: sample.historicalQuestions,
    historicalAccuracy: sample.historicalAccuracy,
    recentErrors: sample.recentErrors,
    recurrence,
    manualEntries: error.manualEntries,
    hardRatio: hard,
    overdueScore: overdue.score,
  });

  const drop =
    sample.historicalAccuracy !== null && sample.recentAccuracy !== null
      ? sample.historicalAccuracy - sample.recentAccuracy
      : 0;

  const reason = buildReason(knowledgeState, {
    recentQuestions: sample.recentQuestions,
    recentAccuracy: sample.recentAccuracy,
    historicalQuestions: sample.historicalQuestions,
    historicalAccuracy: sample.historicalAccuracy,
    drop,
    recentErrors: sample.recentErrors,
    recurrence,
    manualEntries: error.manualEntries,
    daysOverdue: overdue.daysOverdue,
  });

  return {
    priorityScore,
    knowledgeState,
    reason,
    questionScore: question,
    overdueScore: overdue.score,
    errorScore: error.score,
    stabilityScore: stability,
    recentQuestions: sample.recentQuestions,
    recentAccuracy: sample.recentAccuracy,
    historicalQuestions: sample.historicalQuestions,
    historicalAccuracy: sample.historicalAccuracy,
    sampleConfidence: sample.sampleConfidence,
    sampleIsEstimated: sample.sampleIsEstimated,
    engineVersion: ENGINE_VERSION,
  };
}
