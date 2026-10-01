import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import {
  buildPriorityEngineInput,
  computeEffectiveNextReviewAt,
  computeLastContactAt,
  type RawDeck,
  type RawSubjectContact,
} from "./priorityEngine.input";

const DAY_MS = 86_400_000;
const now = new Date("2026-09-30T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const ago = (days: number) => iso(now.getTime() - days * DAY_MS);
const ahead = (days: number) => iso(now.getTime() + days * DAY_MS);

const emptySubject: RawSubjectContact = {
  nextReviewAt: null,
  lastStudiedAt: null,
  firstStudiedAt: null,
  videoWatchedAt: null,
  summaryReadyAt: null,
  deckReadyAt: null,
};

describe("computeEffectiveNextReviewAt", () => {
  it("sem vencimento e sem baralhos -> null", () => {
    strictEqual(computeEffectiveNextReviewAt(null, [], now), null);
  });

  it("assunto futuro sem baralhos vencidos -> data do assunto", () => {
    strictEqual(computeEffectiveNextReviewAt(ahead(5), [], now), ahead(5));
  });

  it("baralho vencido com assunto nulo -> data do baralho", () => {
    const decks: RawDeck[] = [{ nextReviewAt: ago(10) }];
    strictEqual(computeEffectiveNextReviewAt(null, decks, now), ago(10));
  });

  it("assunto futuro + baralho vencido -> escolhe o mais atrasado", () => {
    const decks: RawDeck[] = [{ nextReviewAt: ago(10) }];
    strictEqual(computeEffectiveNextReviewAt(ahead(5), decks, now), ago(10));
  });

  it("baralho futuro (não vencido) é ignorado", () => {
    const decks: RawDeck[] = [{ nextReviewAt: ahead(3) }];
    strictEqual(computeEffectiveNextReviewAt(null, decks, now), null);
  });

  it("entre vários vencidos, escolhe o mais antigo", () => {
    const decks: RawDeck[] = [{ nextReviewAt: ago(5) }, { nextReviewAt: ago(20) }];
    strictEqual(computeEffectiveNextReviewAt(null, decks, now), ago(20));
  });
});

describe("computeLastContactAt", () => {
  it("sem qualquer contato -> null", () => {
    strictEqual(computeLastContactAt(emptySubject, [], [], [], []), null);
  });

  it("escolhe a data mais recente entre as fontes", () => {
    const subject: RawSubjectContact = { ...emptySubject, lastStudiedAt: ago(9) };
    strictEqual(
      computeLastContactAt(
        subject,
        [{ createdAt: ago(2), total: 5, correct: 3 }],
        [{ rating: "bom", reviewedAt: ago(12) }],
        [{ startedAt: ago(7) }],
        [{ rating: "dificil", reviewedAt: ago(1) }],
      ),
      ago(1),
    );
  });

  it("usa first_studied_at quando é o único contato", () => {
    const subject: RawSubjectContact = { ...emptySubject, firstStudiedAt: ago(30) };
    strictEqual(computeLastContactAt(subject, [], [], [], []), ago(30));
  });
});

describe("buildPriorityEngineInput", () => {
  it("mapeia blocos, filtra ratings inválidos e calcula datas", () => {
    const input = buildPriorityEngineInput({
      subject: { ...emptySubject, nextReviewAt: ago(3) },
      questionLogs: [{ createdAt: ago(2), total: 10, correct: 6 }],
      reviews: [
        { rating: "bom", reviewedAt: ago(1) },
        { rating: "INVALIDO", reviewedAt: ago(1) },
      ],
      studySessions: [],
      decks: [],
      deckSessions: [{ rating: null, reviewedAt: ago(1) }],
      questionErrors: [],
      now,
    });

    strictEqual(input.questionBlocks.length, 1);
    strictEqual(input.questionBlocks[0]!?.total, 10);
    strictEqual(input.subjectReviews.length, 1);
    strictEqual(input.subjectReviews[0]!?.rating, "bom");
    strictEqual(input.deckSessions.length, 1);
    strictEqual(input.deckSessions[0]?.rating, null);
    strictEqual(input.nextReviewAt, ago(3));
    strictEqual(input.lastContactAt, ago(1));
  });
});
