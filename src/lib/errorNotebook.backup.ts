/** Backup JSON do caderno de erros — funções puras de exportação/validação. */
import { normalizeOrigin, normalizePriority, type SubjectPath } from "./errorNotebook";

export const BACKUP_FORMAT = "residuum-caderno-de-erros";
export const BACKUP_VERSION = 1;

export type BackupError = {
  id: string;
  subject_id: string;
  subject_path: SubjectPath;
  banca: string | null;
  exam_year: number | null;
  question_ref: string | null;
  what: string | null;
  correction: string | null;
  how_to_avoid: string | null;
  origin: string;
  priority: string;
  error_date: string;
  subtopic_name: string | null;
  review_count: number;
  last_reviewed_at: string | null;
};
export type BackupReview = { error_id: string; outcome: string; reviewed_at: string };
export type NotebookBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  errors: BackupError[];
  reviews: BackupReview[];
};

export function buildBackup(errors: BackupError[], reviews: BackupReview[], now: Date): NotebookBackup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: now.toISOString(), errors, reviews };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Valida um backup e resolve o assunto (pelo id ou pelo caminho na hierarquia). */
export function parseBackup(
  raw: unknown,
  resolveSubject: (id: string, path: SubjectPath | null) => string | null,
): { valid: (BackupError & { resolved_subject_id: string })[]; reviews: BackupReview[]; skipped: number } {
  const obj = raw as Partial<NotebookBackup> | null;
  if (!obj || obj.format !== BACKUP_FORMAT || !Array.isArray(obj.errors)) {
    throw new Error("Arquivo não é um backup do caderno de erros.");
  }
  let skipped = 0;
  const valid: (BackupError & { resolved_subject_id: string })[] = [];
  for (const e of obj.errors as Partial<BackupError>[]) {
    const id = str(e.id);
    const date = str(e.error_date);
    const path = e.subject_path && typeof e.subject_path === "object" ? (e.subject_path as SubjectPath) : null;
    const subjectId = resolveSubject(str(e.subject_id) ?? "", path);
    if (!id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !subjectId) {
      skipped++;
      continue;
    }
    valid.push({
      id,
      subject_id: subjectId,
      resolved_subject_id: subjectId,
      subject_path: path ?? { area: "", specialty: "", subject: "" },
      banca: str(e.banca),
      exam_year: typeof e.exam_year === "number" ? e.exam_year : null,
      question_ref: str(e.question_ref),
      what: str(e.what),
      correction: str(e.correction),
      how_to_avoid: str(e.how_to_avoid),
      origin: normalizeOrigin(e.origin),
      priority: normalizePriority(e.priority),
      error_date: date,
      subtopic_name: str(e.subtopic_name),
      review_count: typeof e.review_count === "number" ? e.review_count : 0,
      last_reviewed_at: str(e.last_reviewed_at),
    });
  }
  const reviews = (Array.isArray(obj.reviews) ? obj.reviews : []).filter(
    (r): r is BackupReview =>
      !!r && typeof r.error_id === "string" && (r.outcome === "superei" || r.outcome === "ainda_erro") && typeof r.reviewed_at === "string",
  );
  return { valid, reviews, skipped };
}
