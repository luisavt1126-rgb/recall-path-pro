import type { Subject } from "@/lib/data";
import { useSetSubjectPrep, useSetSubjectPrepDate } from "@/lib/actions";


export type PrepKey = "video_watched_at" | "summary_ready_at" | "deck_ready_at";

export const PREP_ITEMS: { key: PrepKey; icon: string; label: string }[] = [
  { key: "video_watched_at", icon: "🎥", label: "Vídeoaula assistida" },
  { key: "summary_ready_at", icon: "📝", label: "Resumo pronto" },
  { key: "deck_ready_at", icon: "🃏", label: "Baralho de flashcards pronto" },
];

/** Iconezinhos compactos para a lista de assuntos. */
export function PrepIcons({ subject }: { subject: Subject }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {PREP_ITEMS.map((item) => {
        const done = Boolean(subject[item.key]);
        return (
          <span
            key={item.key}
            title={`${item.label}${done ? " ✓" : " — pendente"}`}
            className={`text-[11px] leading-none ${
              done ? "opacity-100" : "opacity-25 grayscale"
            }`}
          >
            {item.icon}
          </span>
        );
      })}
    </span>
  );
}

/** Checklist completo com data editável (página de detalhe). */
export function PrepChecklist({ subject }: { subject: Subject }) {
  const setPrep = useSetSubjectPrep();
  const setDate = useSetSubjectPrepDate();
  return (
    <div className="space-y-2">
      {PREP_ITEMS.map((item) => {
        const at = subject[item.key] as string | null;
        const done = Boolean(at);
        return (
          <div
            key={item.key}
            className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
          >
            <input
              type="checkbox"
              checked={done}
              disabled={setPrep.isPending}
              onChange={(e) =>
                setPrep.mutate({ subject, field: item.key, done: e.target.checked })
              }
              className="h-4 w-4 accent-[var(--brand)]"
              aria-label={item.label}
            />
            <span className="text-base leading-none">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{item.label}</span>
              {at && (
                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>marcado em</span>
                  <input
                    type="date"
                    value={new Date(at).toISOString().slice(0, 10)}
                    disabled={setDate.isPending}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setDate.mutate({ subject, field: item.key, date: e.target.value });
                    }}
                    className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                    aria-label={`Data de ${item.label}`}
                  />
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

