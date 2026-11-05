import { describe, expect, test } from "bun:test";
import {
  applyReviewOutcome,
  EMPTY_FILTERS,
  filterErrors,
  notebookStats,
  originFromLegacyReason,
  reviewQueue,
  weekStart,
  type NotebookError,
} from "./errorNotebook";
import { parseBackup } from "./errorNotebook.backup";
import { computePrioritySnapshot } from "./priorityEngine";

const base = (o: Partial<NotebookError>): NotebookError => ({
  id: "x",
  subject_id: "s1",
  priority: "media",
  origin: "desconhecimento",
  banca: null,
  error_date: "2026-10-01",
  created_at: "2026-10-01T10:00:00Z",
  last_reviewed_at: null,
  ...o,
});
const path = () => ({ area: "Pediatria", specialty: "Neonatologia", subject: "Icterícia" });

describe("segundo ciclo", () => {
  test("ignora superados, Alta antes de Média, nunca revisados e mais antigos primeiro", () => {
    const q = reviewQueue([
      base({ id: "sup", priority: "superado" }),
      base({ id: "media-velha", priority: "media", error_date: "2026-01-01" }),
      base({ id: "alta-revisada", priority: "alta", last_reviewed_at: "2026-10-02T00:00:00Z" }),
      base({ id: "alta-nova", priority: "alta", error_date: "2026-10-03" }),
      base({ id: "alta-velha", priority: "alta", error_date: "2026-09-01" }),
    ]);
    expect(q.map((e) => e.id)).toEqual(["alta-velha", "alta-nova", "alta-revisada", "media-velha"]);
  });

  test("Superei vira Superado; Ainda erro mantém prioridade e conta revisão", () => {
    const at = new Date("2026-11-05T12:00:00Z");
    expect(applyReviewOutcome({ priority: "alta", review_count: 0 }, "superei", at).priority).toBe("superado");
    const r = applyReviewOutcome({ priority: "alta", review_count: 2 }, "ainda_erro", at);
    expect(r.priority).toBe("alta");
    expect(r.review_count).toBe(3);
    expect(r.last_reviewed_at).toBe(at.toISOString());
  });
});

test("filtros combinados por banca, prioridade e período", () => {
  const list = [
    base({ id: "a", banca: "HCPA", priority: "alta", error_date: "2026-10-10" }),
    base({ id: "b", banca: "HCPA", priority: "media", error_date: "2026-10-10" }),
    base({ id: "c", banca: "HCPA", priority: "alta", error_date: "2026-08-10" }),
  ];
  const r = filterErrors(list, { ...EMPTY_FILTERS, banca: "HCPA", priority: "alta", from: "2026-10-01" }, path);
  expect(r.map((e) => e.id)).toEqual(["a"]);
});

test("busca por texto ignora acentos", () => {
  const r = filterErrors([base({ correction: "Fototerapia na icterícia" })], { ...EMPTY_FILTERS, text: "ICTERICIA" }, path);
  expect(r.length).toBe(1);
});

test("painel: % superados e semana começando na segunda", () => {
  expect(weekStart("2026-11-05")).toBe("2026-11-02");
  const s = notebookStats(
    [base({ id: "a", priority: "superado" }), base({ id: "b" }), base({ id: "c" }), base({ id: "d" })],
    [{ error_id: "a", outcome: "superei", reviewed_at: "2026-11-05T10:00:00Z" }],
    path,
  );
  expect(s.total).toBe(4);
  expect(s.pctSuperados).toBe(25);
  expect(s.weekly.find((w) => w.week === "2026-11-02")?.superados).toBe(1);
});

test("motivo antigo vira origem", () => {
  expect(originFromLegacyReason("Confundi conceitos")).toBe("confusao");
  expect(originFromLegacyReason("Falta de atenção")).toBe("interpretacao");
});

test("backup rejeita arquivo estranho e pula erro sem assunto", () => {
  expect(() => parseBackup({ foo: 1 }, () => null)).toThrow();
  const r = parseBackup(
    { format: "residuum-caderno-de-erros", version: 1, errors: [{ id: "1", subject_id: "s1", error_date: "2026-10-01" }, { id: "2", subject_id: "zz", error_date: "2026-10-01" }], reviews: [] },
    (id) => (id === "s1" ? "s1" : null),
  );
  expect(r.valid.length).toBe(1);
  expect(r.skipped).toBe(1);
});

describe("motor: erro do caderno só mexe no componente de erros", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const run = (manualErrors: Parameters<typeof computePrioritySnapshot>[0]["manualErrors"]) =>
    computePrioritySnapshot({
      now,
      questionBlocks: [],
      subjectReviews: [],
      deckSessions: [],
      manualErrors,
      nextReviewAt: null,
      lastContactAt: "2026-11-01T12:00:00Z",
    });
  test("Superado não pesa; Alta pesa mais que Média; Ainda erro aumenta", () => {
    const e = { createdAt: "2026-11-01T12:00:00Z", errorCount: 1, reason: null };
    expect(run([{ ...e, priority: "superado" }]).errorScore).toBe(0);
    const alta = run([{ ...e, priority: "alta" }]).errorScore;
    const media = run([{ ...e, priority: "media" }]).errorScore;
    expect(alta).toBeGreaterThan(media);
    expect(run([{ ...e, priority: "alta", stillWrongCount: 2 }]).errorScore).toBeGreaterThan(alta);
  });
});
