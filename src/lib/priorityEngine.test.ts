import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import {
  computePrioritySnapshot,
  sampleConfidence,
  ENGINE_VERSION,
  DAY_MS,
  type ManualError,
  type PriorityEngineInput,
  type QuestionBlock,
} from "./priorityEngine";

const now = new Date("2026-09-30T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
const future = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();

function input(partial: Partial<PriorityEngineInput> = {}): PriorityEngineInput {
  return {
    now: partial.now ?? now,
    questionBlocks: partial.questionBlocks ?? [],
    subjectReviews: partial.subjectReviews ?? [],
    deckSessions: partial.deckSessions ?? [],
    manualErrors: partial.manualErrors ?? [],
    nextReviewAt: partial.nextReviewAt ?? null,
    lastContactAt: partial.lastContactAt ?? null,
  };
}

const q = (daysAgo: number, total: number, correct: number): QuestionBlock => ({
  createdAt: ago(daysAgo),
  total,
  correct,
});

describe("sampleConfidence (faixas exatas)", () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [1, 0.1],
    [4, 0.1],
    [5, 0.3],
    [9, 0.3],
    [10, 0.55],
    [19, 0.55],
    [20, 0.8],
    [39, 0.8],
    [40, 1],
  ];
  for (const [count, expected] of cases) {
    it(`count=${count} -> ${expected}`, () => {
      strictEqual(sampleConfidence(count), expected);
    });
  }
});

describe("histórico vazio", () => {
  it("vira NEW, score 0 e componentes zerados", () => {
    const r = computePrioritySnapshot(input());
    strictEqual(r.knowledgeState, "NEW");
    strictEqual(r.priorityScore, 0);
    strictEqual(r.questionScore, 0);
    strictEqual(r.overdueScore, 0);
    strictEqual(r.errorScore, 0);
    strictEqual(r.stabilityScore, 0);
    strictEqual(r.recentQuestions, 0);
    strictEqual(r.recentAccuracy, null);
    strictEqual(r.sampleConfidence, 0);
    strictEqual(r.sampleIsEstimated, false);
    strictEqual(r.engineVersion, ENGINE_VERSION);
  });
});

describe("formação da amostra (60 dias / 30 questões)", () => {
  it("bloco antigo (>60d) vai para o histórico; recente (<=60d) para a amostra", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(90, 10, 5), q(10, 4, 4)] }),
    );
    strictEqual(r.recentQuestions, 4);
    strictEqual(r.recentAccuracy, 100);
    strictEqual(r.historicalQuestions, 10);
    strictEqual(r.historicalAccuracy, 50);
  });

  it("corte proporcional no bloco de fronteira marca sampleIsEstimated", () => {
    const r = computePrioritySnapshot(input({ questionBlocks: [q(5, 50, 25)] }));
    strictEqual(r.recentQuestions, 30);
    strictEqual(r.historicalQuestions, 20);
    strictEqual(r.sampleIsEstimated, true);
    // 25/50 = 50% de acerto, alocado proporcionalmente nos 30 recentes.
    strictEqual(r.recentAccuracy, 50);
    strictEqual(r.historicalAccuracy, 50);
  });
});

describe("knowledge_state — DETERIORATING (cortes 10/20/10)", () => {
  it("dispara com 10 recentes, 20 históricas e queda de 10", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 10, 8), q(90, 20, 18)] }),
    );
    strictEqual(r.knowledgeState, "DETERIORATING");
  });

  it("não dispara com 9 recentes", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 9, 6), q(90, 20, 18)] }),
    );
    ok(r.knowledgeState !== "DETERIORATING");
  });

  it("não dispara com 19 históricas", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 10, 7), q(90, 19, 15)] }),
    );
    ok(r.knowledgeState !== "DETERIORATING");
  });

  it("não dispara com queda menor que 10", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 10, 9), q(90, 20, 18)] }),
    );
    ok(r.knowledgeState !== "DETERIORATING");
  });
});

describe("knowledge_state — PERSISTENT_GAP", () => {
  it("dispara com recente <60% e histórico <70% (mínimos atingidos)", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 10, 5), q(90, 20, 11)] }),
    );
    strictEqual(r.knowledgeState, "PERSISTENT_GAP");
  });
});

describe("knowledge_state — STABLE", () => {
  it("dispara com 20+ recentes, acerto >=80%, sem queda e sem ratings difíceis", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 20, 18), q(90, 20, 18)] }),
    );
    strictEqual(r.knowledgeState, "STABLE");
  });
});

describe("knowledge_state — FRAGILE", () => {
  it("acurácia recente abaixo de 70% sem critérios mais fortes", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 12, 8), q(90, 20, 13)] }),
    );
    strictEqual(r.knowledgeState, "FRAGILE");
  });
});

describe("knowledge_state — CONSOLIDATING", () => {
  it("assunto iniciado, sem sinais de fragilidade e ainda sem evidência para STABLE", () => {
    const r = computePrioritySnapshot(
      input({ lastContactAt: ago(5), questionBlocks: [q(5, 15, 15), q(90, 30, 30)] }),
    );
    strictEqual(r.knowledgeState, "CONSOLIDATING");
  });
});

describe("score total", () => {
  const fixtures: PriorityEngineInput[] = [
    input(),
    input({ questionBlocks: [q(5, 10, 8), q(90, 20, 18)] }),
    input({ questionBlocks: [q(5, 20, 18), q(90, 20, 18)] }),
    input({ nextReviewAt: ago(30) }),
    input({ lastContactAt: ago(60) }),
    input({ questionBlocks: [q(5, 50, 25)] }),
  ];

  for (let i = 0; i < fixtures.length; i += 1) {
    it(`caso ${i}: soma dos componentes = score e 0..100`, () => {
      const r = computePrioritySnapshot(fixtures[i]!);
      ok(r.priorityScore >= 0 && r.priorityScore <= 100);
      strictEqual(
        r.priorityScore,
        Math.round(r.questionScore + r.overdueScore + r.errorScore + r.stabilityScore),
      );
    });
  }
});

describe("overdue", () => {
  it("vencimento 30 dias atrás satura em 25", () => {
    const r = computePrioritySnapshot(input({ nextReviewAt: ago(30) }));
    strictEqual(r.overdueScore, 25);
  });

  it("vencendo hoje vale o risco inicial", () => {
    const r = computePrioritySnapshot(input({ nextReviewAt: now.toISOString() }));
    strictEqual(r.overdueScore, 5);
  });

  it("vencimento futuro não pontua", () => {
    const r = computePrioritySnapshot(input({ nextReviewAt: future(5) }));
    strictEqual(r.overdueScore, 0);
  });

  it("sem vencimento, contato de 60 dias satura em 25", () => {
    const r = computePrioritySnapshot(input({ lastContactAt: ago(60) }));
    strictEqual(r.overdueScore, 25);
  });

  it("sem vencimento, contato recente (<=14d) não pontua", () => {
    const r = computePrioritySnapshot(input({ lastContactAt: ago(14) }));
    strictEqual(r.overdueScore, 0);
  });

  it("sem vencimento, 37 dias de antiguidade vale 12.5", () => {
    const r = computePrioritySnapshot(input({ lastContactAt: ago(37) }));
    strictEqual(r.overdueScore, 12.5);
  });
});

describe("estabilidade e ratings", () => {
  it("5 ratings difíceis somam 3 pontos de estabilidade", () => {
    const r = computePrioritySnapshot(
      input({
        subjectReviews: Array.from({ length: 5 }, (_, i) => ({
          rating: "muito_dificil" as const,
          reviewedAt: ago(i),
        })),
      }),
    );
    strictEqual(r.stabilityScore, 3);
  });

  it("sessão de baralho sem rating não quebra e não conta como difícil", () => {
    const r = computePrioritySnapshot(
      input({ deckSessions: [{ rating: null, reviewedAt: ago(2) }] }),
    );
    strictEqual(r.stabilityScore, 0);
    strictEqual(r.knowledgeState, "CONSOLIDATING");
  });
});

describe("componente de erros", () => {
  it("volume (10 erros) + recorrência (1 de 2 blocos) = 20", () => {
    const r = computePrioritySnapshot(
      input({ questionBlocks: [q(5, 30, 20), q(90, 20, 18)] }),
    );
    strictEqual(r.errorScore, 20);
  });
});

describe("caderno de erros (manualErrors)", () => {
  it("erro recente soma volume + recorrência", () => {
    const manualErrors: ManualError[] = [
      { createdAt: ago(5), errorCount: 5, reason: "não sabia o conteúdo" },
    ];
    const r = computePrioritySnapshot(input({ manualErrors }));
    strictEqual(r.errorScore, 10.83);
  });

  it("3+ erros no caderno = recorrência máxima e estado FRAGILE", () => {
    const manualErrors: ManualError[] = [
      { createdAt: ago(2), errorCount: 1, reason: "chute" },
      { createdAt: ago(3), errorCount: 1, reason: "chute" },
      { createdAt: ago(4), errorCount: 1, reason: "chute" },
    ];
    const r = computePrioritySnapshot(input({ manualErrors }));
    strictEqual(r.errorScore, 14.5);
    strictEqual(r.knowledgeState, "FRAGILE");
  });

  it("erro antigo (fora de 30 dias) conta só recorrência, não volume", () => {
    const manualErrors: ManualError[] = [
      { createdAt: ago(40), errorCount: 10, reason: "interpretação" },
    ];
    const r = computePrioritySnapshot(input({ manualErrors }));
    strictEqual(r.errorScore, 3.33);
  });

  it("sem erros no caderno mantém o score de erro zerado", () => {
    const r = computePrioritySnapshot(input());
    strictEqual(r.errorScore, 0);
  });
});

describe("caderno de erros — peso por status", () => {
  it("erro resolvido não pesa (peso 0)", () => {
    const r = computePrioritySnapshot(
      input({
        manualErrors: [{ createdAt: ago(5), errorCount: 5, reason: "chute", status: "resolvido" }],
      }),
    );
    strictEqual(r.errorScore, 0);
  });

  it("erro em melhora pesa menos (peso 0.5)", () => {
    const r = computePrioritySnapshot(
      input({
        manualErrors: [{ createdAt: ago(5), errorCount: 5, reason: "chute", status: "em_melhora" }],
      }),
    );
    strictEqual(r.errorScore, 5.42);
  });

  it("erro recorrente pesa como ativo (peso 1)", () => {
    const r = computePrioritySnapshot(
      input({
        manualErrors: [{ createdAt: ago(5), errorCount: 5, reason: "chute", status: "recorrente" }],
      }),
    );
    strictEqual(r.errorScore, 10.83);
  });
});
