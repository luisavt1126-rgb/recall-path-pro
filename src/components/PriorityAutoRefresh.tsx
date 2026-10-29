import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requireUserId } from "@/lib/actions";
import { useSubjectPrioritySnapshots, useSubjects } from "@/lib/data";
import { ENGINE_VERSION } from "@/lib/priorityEngine";
import { needsDailyRecalculation } from "@/lib/priorityEngine.batch";
import { recalculateAllSubjects } from "@/lib/priorityEngine.service";

/**
 * Recálculo diário dos snapshots de prioridade.
 *
 * O componente de atraso cresce com o passar dos dias, mas os snapshots só
 * eram recalculados quando algo era registrado. Ao abrir o app, se algum
 * assunto estiver sem snapshot, com snapshot de um dia anterior ou de outra
 * versão do motor, recalcula todos em lote (uma vez por montagem).
 */
export function PriorityAutoRefresh() {
  const qc = useQueryClient();
  const { data: subjects, isSuccess: subjectsReady } = useSubjects();
  const { data: snapshots, isSuccess: snapshotsReady } = useSubjectPrioritySnapshots();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !subjectsReady || !snapshotsReady) return;
    const stale = needsDailyRecalculation({
      subjectIds: (subjects ?? []).map((s) => s.id),
      snapshots: snapshots ?? [],
      engineVersion: ENGINE_VERSION,
      now: new Date(),
    });
    if (!stale) return;
    started.current = true;

    void (async () => {
      try {
        const userId = await requireUserId();
        const result = await recalculateAllSubjects(userId);
        if (result.failures.length > 0) {
          console.warn("Recálculo diário com falhas", result.failures);
        }
        await qc.invalidateQueries({ queryKey: ["subject_priority_snapshots"] });
      } catch (err) {
        console.warn("Falha no recálculo diário de prioridade", err);
      }
    })();
  }, [qc, subjects, snapshots, subjectsReady, snapshotsReady]);

  return null;
}
