/**
 * Caderno de erros — regras de domínio puras (sem React/banco).
 * Constantes centralizadas: origens, prioridades, bancas sugeridas.
 */
import { CORE_AREAS } from "./areas";
import type { ErrorStatus } from "./errorStatus";

export const ERROR_ORIGINS = ["desconhecimento", "confusao", "esquecimento", "interpretacao"] as const;
export type ErrorOrigin = (typeof ERROR_ORIGINS)[number];
export const ERROR_ORIGIN_LABEL: Record<ErrorOrigin, string> = {
  desconhecimento: "Desconhecimento do conteúdo",
  confusao: "Confusão entre conceitos",
  esquecimento: "Esquecimento",
  interpretacao: "Erro de interpretação/atenção",
};

export const ERROR_PRIORITIES = ["alta", "media", "superado"] as const;
export type ErrorPriority = (typeof ERROR_PRIORITIES)[number];
export const ERROR_PRIORITY_LABEL: Record<ErrorPriority, string> = {
  alta: "Alta",
  media: "Média",
  superado: "Superado",
};

export const SUGGESTED_BANCAS = [
  "ENARE/ENAMED",
  "HCPA",
  "UFCSPA/Santa Casa POA",
  "USP-RP",
  "USP-SP",
  "SUS-SP",
] as const;

export const REVIEW_OUTCOMES = ["superei", "ainda_erro"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export function normalizeOrigin(v: string | null | undefined): ErrorOrigin {
  return (ERROR_ORIGINS as readonly string[]).includes(v ?? "") ? (v as ErrorOrigin) : "desconhecimento";
}
export function normalizePriority(v: string | null | undefined): ErrorPriority {
  return (ERROR_PRIORITIES as readonly string[]).includes(v ?? "") ? (v as ErrorPriority) : "media";
}

/** Converte os motivos antigos (texto livre) em uma das 4 origens. */
export function originFromLegacyReason(reason: string | null | undefined): ErrorOrigin {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("confund")) return "confusao";
  if (r.includes("esquec")) return "esquecimento";
  if (r.includes("aten") || r.includes("interpreta") || r.includes("pegadinha")) return "interpretacao";
  return "desconhecimento";
}

/** Sincronia prioridade -> status antigo (usado pelo restante do app). */
export function statusForPriority(p: ErrorPriority, current?: ErrorStatus): ErrorStatus {
  if (p === "superado") return "resolvido";
  if (current && current !== "resolvido") return current;
  return "ativo";
}
/** Sincronia status antigo -> prioridade. */
export function priorityForStatus(s: ErrorStatus, current?: ErrorPriority): ErrorPriority {
  if (s === "resolvido") return "superado";
  if (s === "em_melhora") return "media";
  if (current && current !== "superado") return current;
  return s === "recorrente" ? "alta" : "media";
}

/** Resultado de uma revisão do segundo ciclo. */
export function applyReviewOutcome(
  e: { priority: string; review_count: number },
  outcome: ReviewOutcome,
  at: Date,
): { priority: ErrorPriority; status: ErrorStatus; review_count: number; last_reviewed_at: string } {
  const priority = outcome === "superei" ? "superado" : normalizePriority(e.priority);
  return {
    priority,
    status: outcome === "superei" ? "resolvido" : "recorrente",
    review_count: e.review_count + (outcome === "ainda_erro" ? 1 : 0),
    last_reviewed_at: at.toISOString(),
  };
}

export type NotebookError = {
  id: string;
  subject_id: string;
  priority: string;
  origin: string;
  banca: string | null;
  error_date: string;
  created_at: string;
  last_reviewed_at: string | null;
  question_ref?: string | null;
  what?: string | null;
  correction?: string | null;
  how_to_avoid?: string | null;
  subtopic_name?: string | null;
};

/** Fila do segundo ciclo: Alta antes de Média; nunca revisados; revisão mais antiga; erro mais antigo. */
export function reviewQueue<T extends NotebookError>(errors: T[]): T[] {
  const rank = (p: string) => (p === "alta" ? 0 : 1);
  return errors
    .filter((e) => normalizePriority(e.priority) !== "superado")
    .slice()
    .sort((a, b) => {
      if (rank(a.priority) !== rank(b.priority)) return rank(a.priority) - rank(b.priority);
      const ra = a.last_reviewed_at ? Date.parse(a.last_reviewed_at) : -Infinity;
      const rb = b.last_reviewed_at ? Date.parse(b.last_reviewed_at) : -Infinity;
      if (ra !== rb) return ra - rb;
      return a.error_date.localeCompare(b.error_date) || a.created_at.localeCompare(b.created_at);
    });
}

/** Grande área de uma especialidade (pelo nome). */
export function areaOfSpecialty(name: string | null | undefined): string {
  return CORE_AREAS.find((a) => a.specialties.includes(name ?? ""))?.area ?? "Outras";
}

export type SubjectPath = { area: string; specialty: string; subject: string };
export type PathResolver = (subjectId: string) => SubjectPath;

export type ErrorFilters = {
  text: string;
  area: string;
  banca: string;
  origin: string;
  priority: string;
  from: string; // yyyy-mm-dd
  to: string;
};
export const EMPTY_FILTERS: ErrorFilters = { text: "", area: "", banca: "", origin: "", priority: "", from: "", to: "" };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filterErrors<T extends NotebookError>(errors: T[], f: ErrorFilters, path: PathResolver): T[] {
  const q = norm(f.text.trim());
  return errors.filter((e) => {
    const p = path(e.subject_id);
    if (f.area && p.area !== f.area) return false;
    if (f.banca && (e.banca ?? "") !== f.banca) return false;
    if (f.origin && normalizeOrigin(e.origin) !== f.origin) return false;
    if (f.priority && normalizePriority(e.priority) !== f.priority) return false;
    if (f.from && e.error_date < f.from) return false;
    if (f.to && e.error_date > f.to) return false;
    if (q) {
      const hay = norm(
        [e.question_ref, e.what, e.correction, e.how_to_avoid, e.banca, e.subtopic_name, p.area, p.specialty, p.subject]
          .filter(Boolean)
          .join(" "),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type ErrorGroup<T> = { area: string; specialties: { specialty: string; subjects: { subject: string; subjectId: string; errors: T[] }[] }[] };

export function groupErrors<T extends NotebookError>(errors: T[], path: PathResolver): ErrorGroup<T>[] {
  const areas = new Map<string, Map<string, Map<string, { subject: string; errors: T[] }>>>();
  for (const e of errors) {
    const p = path(e.subject_id);
    const sp = areas.get(p.area) ?? new Map();
    areas.set(p.area, sp);
    const subs = sp.get(p.specialty) ?? new Map();
    sp.set(p.specialty, subs);
    const g = subs.get(e.subject_id) ?? { subject: p.subject, errors: [] };
    g.errors.push(e);
    subs.set(e.subject_id, g);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  return [...areas.entries()]
    .sort(([a], [b]) => byName(a, b))
    .map(([area, sp]) => ({
      area,
      specialties: [...sp.entries()]
        .sort(([a], [b]) => byName(a, b))
        .map(([specialty, subs]) => ({
          specialty,
          subjects: [...subs.entries()]
            .map(([subjectId, g]) => ({ subjectId, ...g }))
            .sort((a, b) => byName(a.subject, b.subject)),
        })),
    }));
}

/** Segunda-feira (yyyy-mm-dd) da semana de uma data. */
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export type NotebookStats = {
  total: number;
  superados: number;
  pctSuperados: number;
  byArea: { name: string; value: number }[];
  byBanca: { name: string; value: number }[];
  byOrigin: { name: string; value: number }[];
  byPriority: { name: string; value: number }[];
  weekly: { week: string; registrados: number; superados: number }[];
};

export function notebookStats(
  errors: NotebookError[],
  reviews: { error_id: string; outcome: string; reviewed_at: string }[],
  path: PathResolver,
): NotebookStats {
  const count = (keyOf: (e: NotebookError) => string) => {
    const m = new Map<string, number>();
    for (const e of errors) m.set(keyOf(e), (m.get(keyOf(e)) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const superados = errors.filter((e) => normalizePriority(e.priority) === "superado").length;
  const weeks = new Map<string, { registrados: number; superados: number }>();
  const bump = (w: string, k: "registrados" | "superados") => {
    const v = weeks.get(w) ?? { registrados: 0, superados: 0 };
    v[k] += 1;
    weeks.set(w, v);
  };
  for (const e of errors) bump(weekStart(e.error_date), "registrados");
  const ids = new Set(errors.map((e) => e.id));
  for (const r of reviews) if (r.outcome === "superei" && ids.has(r.error_id)) bump(weekStart(r.reviewed_at), "superados");
  return {
    total: errors.length,
    superados,
    pctSuperados: errors.length ? Math.round((superados / errors.length) * 100) : 0,
    byArea: count((e) => path(e.subject_id).area),
    byBanca: count((e) => e.banca?.trim() || "Sem banca"),
    byOrigin: count((e) => ERROR_ORIGIN_LABEL[normalizeOrigin(e.origin)]),
    byPriority: ERROR_PRIORITIES.map((p) => ({
      name: ERROR_PRIORITY_LABEL[p],
      value: errors.filter((e) => normalizePriority(e.priority) === p).length,
    })),
    weekly: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v })),
  };
}
