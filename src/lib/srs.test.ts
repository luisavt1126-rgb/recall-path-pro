import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert/strict";
import { scheduleReview, type SrsState } from "./srs";

const base: SrsState = {
  interval_days: 10,
  ease: 2.5,
  reps: 4,
  lapses: 0,
  stability: 0,
  difficulty: 5,
  mastery: 50,
};

describe("scheduleReview", () => {
  it("Difícil aumenta um pouco o intervalo (1,2x), como no Anki", () => {
    strictEqual(scheduleReview(base, "dificil").interval_days, 12);
  });

  it("Difícil cresce menos que Bom, e Bom menos que Fácil", () => {
    const hard = scheduleReview(base, "dificil").interval_days;
    const good = scheduleReview(base, "bom").interval_days;
    const easy = scheduleReview(base, "facil").interval_days;
    ok(hard < good && good < easy);
  });

  it("Novamente reinicia para 1 dia e conta um lapso", () => {
    const next = scheduleReview(base, "muito_dificil");
    strictEqual(next.interval_days, 1);
    strictEqual(next.lapses, 1);
    strictEqual(next.reps, 0);
  });

  it("Difícil na primeira revisão agenda para 1 dia", () => {
    strictEqual(scheduleReview({ ...base, interval_days: 0, reps: 0 }, "dificil").interval_days, 1);
  });
});
