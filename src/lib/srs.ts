// Repetição espaçada inspirada no Anki (SM-2 adaptado), com alvo de retenção
// de 90%. A estrutura (stability / difficulty) já está preparada para migrar
// para o FSRS no futuro sem perder o histórico.

export const TARGET_RETENTION = 0.9;

export type Rating = "muito_dificil" | "dificil" | "bom" | "facil";

export const RATING_LABEL: Record<Rating, string> = {
  muito_dificil: "Novamente",
  dificil: "Difícil",
  bom: "Bom",
  facil: "Fácil",
};

export const RATINGS: Rating[] = ["muito_dificil", "dificil", "bom", "facil"];


export type SrsState = {
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  mastery: number;
};

const EASE_DELTA: Record<Rating, number> = {
  muito_dificil: -0.3,
  dificil: -0.15,
  bom: 0,
  facil: 0.12,
};

const MASTERY_DELTA: Record<Rating, number> = {
  muito_dificil: -18,
  dificil: -6,
  bom: 8,
  facil: 14,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function scheduleReview(state: SrsState, rating: Rating) {
  const ease = clamp(state.ease + EASE_DELTA[rating], 1.3, 3.2);
  const reps = rating === "muito_dificil" ? 0 : state.reps + 1;
  const lapses = rating === "muito_dificil" ? state.lapses + 1 : state.lapses;
  const previous = state.interval_days || 0;

  let interval: number;
  if (rating === "muito_dificil") {
    interval = 1;
  } else if (rating === "dificil") {
    interval = previous > 0 ? Math.max(1, previous * 0.6) : 1;
  } else if (reps <= 1) {
    interval = rating === "facil" ? 3 : 2;
  } else if (reps === 2) {
    interval = rating === "facil" ? 8 : 6;
  } else {
    interval = previous * ease * (rating === "facil" ? 1.25 : 1);
  }

  interval = clamp(Math.round(interval * 10) / 10, 1, 365);

  // Stability aproximada para o alvo de retenção de 90%.
  const stability = interval / -Math.log(TARGET_RETENTION);
  const difficulty = clamp(
    state.difficulty + (rating === "muito_dificil" ? 1.2 : rating === "dificil" ? 0.5 : rating === "bom" ? -0.1 : -0.5),
    1,
    10,
  );
  const mastery = clamp(Math.round(state.mastery + MASTERY_DELTA[rating]), 0, 100);

  const next = new Date();
  next.setDate(next.getDate() + Math.round(interval));

  return {
    interval_days: interval,
    ease,
    reps,
    lapses,
    stability,
    difficulty,
    mastery,
    next_review_at: next.toISOString(),
    interval_before: previous,
  };
}

/**
 * Próximo intervalo de um baralho, seguindo os 4 níveis do Anki:
 * Novamente reinicia em D+1 (lapso), Difícil sobe pouco (1.2x),
 * Bom usa o fator de facilidade e Fácil bonifica esse fator.
 */
export function nextDeckInterval(current: number, rating: Rating, ease = 2.5) {
  const base = current > 0 ? current : 1;
  const factor: Record<Rating, number> = {
    muito_dificil: 0,
    dificil: 1.2,
    bom: ease,
    facil: ease * 1.3,
  };
  if (rating === "muito_dificil") return 1;
  return clamp(Math.round(base * factor[rating]), 1, 180);
}

