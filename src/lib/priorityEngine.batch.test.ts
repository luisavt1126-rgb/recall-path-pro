import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { buildAllPriorityInputs, needsDailyRecalculation } from "./priorityEngine.batch";
import { buildPriorityEngineInput } from "./priorityEngine.input";
import { computePrioritySnapshot, ENGINE_VERSION } from "./priorityEngine";

const DAY_MS = 86_400_000;
const now = new Date("2026-10-29T15:00:00");
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();

const emptyContact = {
  nextReviewAt: null,
  lastStudiedAt: null,
  firstStudiedAt: null,
  videoWatchedAt: null,
  summaryReadyAt: null,
  deckReadyAt: null,
};

describe("buildAllPriorityInputs", () => {
  const params = {
    now,
    subjects: [
      { id: "a", ...emptyContact, lastStudiedAt: ago(3) },
      { id: "b", ...emptyContact },
    ],
    questionLogs: [
      { subjectId: "a", createdAt: ago(2), total: 10, correct: 6 },
      { subjectId: null, createdAt: ago(1), total: 50, correct: 10 },
    ],
    reviews: [{ subjectId: "a", rating: "dificil", reviewedAt: ago(4) }],
    studySessions: [{ subjectId: "b", startedAt: ago(20) }],
    decks: [
      { id: "d1", subjectId: "b", nextReviewAt: ago(5) },
      { id: "d2", subjectId: null, nextReviewAt: ago(9) },
    ],
    deckSessions: [
      { deckId: "d1", rating: "muito_dificil", reviewedAt: ago(6) },
      { deckId: "d2", rating: "facil", reviewedAt: ago(1) },
    ],
    questionErrors: [
      { subjectId: "a", createdAt: ago(2), errorCount: 1, reason: "Chute", status: "ativo" },
    ],
  };

  const result = buildAllPriorityInputs(params);

  it("gera um input por assunto", () => {
    deepStrictEqual(
      result.map((r) => r.subjectId),
      ["a", "b"],
    );
  });

  it("dá o mesmo resultado que montar assunto por assunto", () => {
    const single = buildPriorityEngineInput({
      subject: params.subjects[0],
      questionLogs: [params.questionLogs[0]],
      reviews: [params.reviews[0]],
      studySessions: [],
      decks: [],
      deckSessions: [],
      questionErrors: [params.questionErrors[0]],
      now,
    });
    deepStrictEqual(computePrioritySnapshot(result[0].input), computePrioritySnapshot(single));
  });

  it("ignora registros sem assunto e liga sessões de baralho ao assunto do baralho", () => {
    const b = result[1].input;
    strictEqual(b.questionBlocks.length, 0);
    strictEqual(b.deckSessions.length, 1);
    strictEqual(b.deckSessions[0].rating, "muito_dificil");
    strictEqual(b.nextReviewAt, params.decks[0].nextReviewAt);
  });
});

describe("needsDailyRecalculation", () => {
  const fresh = { calculated_at: now.toISOString(), engine_version: ENGINE_VERSION };

  it("não roda sem assuntos", () => {
    strictEqual(
      needsDailyRecalculation({ subjectIds: [], snapshots: [], engineVersion: ENGINE_VERSION, now }),
      false,
    );
  });

  it("não roda quando todos foram calculados hoje na versão atual", () => {
    strictEqual(
      needsDailyRecalculation({
        subjectIds: ["a"],
        snapshots: [{ subject_id: "a", ...fresh }],
        engineVersion: ENGINE_VERSION,
        now,
      }),
      false,
    );
  });

  it("roda quando falta snapshot de algum assunto", () => {
    strictEqual(
      needsDailyRecalculation({
        subjectIds: ["a", "b"],
        snapshots: [{ subject_id: "a", ...fresh }],
        engineVersion: ENGINE_VERSION,
        now,
      }),
      true,
    );
  });

  it("roda quando o snapshot é de ontem", () => {
    strictEqual(
      needsDailyRecalculation({
        subjectIds: ["a"],
        snapshots: [{ subject_id: "a", calculated_at: ago(1), engine_version: ENGINE_VERSION }],
        engineVersion: ENGINE_VERSION,
        now,
      }),
      true,
    );
  });

  it("roda quando a versão do motor mudou", () => {
    strictEqual(
      needsDailyRecalculation({
        subjectIds: ["a"],
        snapshots: [{ subject_id: "a", calculated_at: now.toISOString(), engine_version: "0.9.0" }],
        engineVersion: ENGINE_VERSION,
        now,
      }),
      true,
    );
  });
});

describe("buildAllPriorityInputs — baralho da especialidade", () => {
  const result = buildAllPriorityInputs({
    now,
    subjects: [
      { id: "arritmias", disciplineId: "cardio", ...emptyContact },
      { id: "ic", disciplineId: "cardio", ...emptyContact },
      { id: "tireoide", disciplineId: "endo", ...emptyContact },
    ],
    questionLogs: [],
    reviews: [],
    studySessions: [],
    decks: [
      { id: "deck-cardio", subjectId: null, disciplineId: "cardio", nextReviewAt: ago(3) },
      { id: "deck-ic", subjectId: "ic", disciplineId: null, nextReviewAt: null },
    ],
    deckSessions: [
      { deckId: "deck-cardio", rating: null, reviewedAt: ago(1), totalCards: 40, correctCards: 25 },
      { deckId: "deck-ic", rating: "bom", reviewedAt: ago(1), totalCards: 10, correctCards: 9 },
    ],
    questionErrors: [],
  });
  const byId = new Map(result.map((r) => [r.subjectId, r.input]));

  it("entrega as sessões do baralho da especialidade a todas as aulas dela", () => {
    strictEqual(byId.get("arritmias")!.specialtyDeckSessions!.length, 1);
    strictEqual(byId.get("ic")!.specialtyDeckSessions!.length, 1);
    strictEqual(byId.get("tireoide")!.specialtyDeckSessions!.length, 0);
  });

  it("baralho da especialidade não conta como baralho/vencimento da aula", () => {
    strictEqual(byId.get("arritmias")!.deckSessions.length, 0);
    strictEqual(byId.get("arritmias")!.nextReviewAt, null);
    strictEqual(byId.get("ic")!.deckSessions.length, 1);
  });
});
