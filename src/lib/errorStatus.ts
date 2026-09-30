/** Status do erro no caderno de erros. */
export const ERROR_STATUSES = ["ativo", "em_melhora", "resolvido", "recorrente"] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];

export const ERROR_STATUS_LABEL: Record<ErrorStatus, string> = {
  ativo: "Ativo",
  em_melhora: "Em melhora",
  resolvido: "Resolvido",
  recorrente: "Recorrente",
};

/** Peso de cada status no motor de prioridade (resolvido = 0). */
export const ERROR_STATUS_WEIGHT: Record<ErrorStatus, number> = {
  ativo: 1,
  em_melhora: 0.5,
  resolvido: 0,
  recorrente: 1,
};

/** Normaliza um status vindo do banco para um dos valores válidos. */
export function normalizeStatus(status: string | null | undefined): ErrorStatus {
  return (ERROR_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as ErrorStatus)
    : "ativo";
}

/**
 * Próximo status após uma revisão por questões com >= 80% de acerto no mesmo
 * assunto/subassunto.
 */
export function nextStatusOnGoodReview(status: ErrorStatus): ErrorStatus {
  if (status === "em_melhora") return "resolvido";
  if (status === "resolvido") return "resolvido";
  return "em_melhora"; // ativo e recorrente passam a "em melhora"
}

/** Status de um novo erro: "recorrente" se já existe erro para o mesmo assunto. */
export function statusForNewError(hasExisting: boolean): ErrorStatus {
  return hasExisting ? "recorrente" : "ativo";
}
