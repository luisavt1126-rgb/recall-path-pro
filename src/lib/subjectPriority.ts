// Leitura da prioridade por assunto para as telas.
//
// Ponto único onde as telas transformam um snapshot do motor
// (`subject_priority_snapshots`) em score, nível de etiqueta, estado e motivos.
// Nenhuma tela calcula prioridade de assunto por conta própria.

import { useMemo } from "react";
import { useSubjectPrioritySnapshots, type SubjectPrioritySnapshot } from "@/lib/data";
import type { KnowledgeState } from "@/lib/priorityEngine";
import { priorityLevel, type PriorityLevel, type Reason } from "@/lib/priority";

export const KNOWLEDGE_STATE_META: Record<
  KnowledgeState,
  { label: string; tone: Reason["tone"] }
> = {
  NEW: { label: "Novo", tone: "violet" },
  FRAGILE: { label: "Frágil", tone: "amber" },
  CONSOLIDATING: { label: "Consolidando", tone: "violet" },
  STABLE: { label: "Estável", tone: "sage" },
  DETERIORATING: { label: "Em queda", tone: "rose" },
  PERSISTENT_GAP: { label: "Lacuna persistente", tone: "rose" },
};

function knowledgeStateMeta(state: string) {
  return KNOWLEDGE_STATE_META[state as KnowledgeState] ?? KNOWLEDGE_STATE_META.NEW;
}

export type SubjectPriority = {
  score: number;
  level: PriorityLevel;
  state: KnowledgeState;
  stateLabel: string;
  reason: string;
  /** Etiquetas curtas: estado + motivo legível. */
  reasons: Reason[];
  /** False enquanto o assunto ainda não tem snapshot calculado. */
  calculated: boolean;
};

export function subjectPriorityFrom(snapshot: SubjectPrioritySnapshot | undefined): SubjectPriority {
  if (!snapshot) {
    return {
      score: 0,
      level: priorityLevel(0),
      state: "NEW",
      stateLabel: KNOWLEDGE_STATE_META.NEW.label,
      reason: "Prioridade ainda não calculada.",
      reasons: [],
      calculated: false,
    };
  }
  const meta = knowledgeStateMeta(snapshot.knowledge_state);
  const state = (snapshot.knowledge_state in KNOWLEDGE_STATE_META
    ? snapshot.knowledge_state
    : "NEW") as KnowledgeState;
  const reasons: Reason[] = [{ text: meta.label, tone: meta.tone }];
  if (snapshot.sample_is_estimated) {
    reasons.push({ text: "amostra estimada", tone: "violet" });
  }
  return {
    score: snapshot.priority_score,
    level: priorityLevel(snapshot.priority_score),
    state,
    stateLabel: meta.label,
    reason: snapshot.reason,
    reasons,
    calculated: true,
  };
}

/** Prioridade de cada assunto, pronta para as telas (via snapshots do motor). */
export function useSubjectPriorities() {
  const { data: snapshots = [] } = useSubjectPrioritySnapshots();
  return useMemo(() => {
    const bySubject = new Map(snapshots.map((s) => [s.subject_id, s]));
    return (subjectId: string) => subjectPriorityFrom(bySubject.get(subjectId));
  }, [snapshots]);
}
