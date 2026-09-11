import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId, useRateDeck } from "@/lib/actions";
import {
  useDecks,
  useDeckSessions,
  useSubjects,
  deckAccuracy,
  type AnkiDeck,
} from "@/lib/data";
import { RATINGS, RATING_LABEL, type Rating } from "@/lib/srs";
import { Panel, Stat, Empty, Field, inputClass, buttonClass, ghostButtonClass } from "@/components/bits";
import { formatDate, isSameDay } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/baralhos")({
  head: () => ({
    meta: [
      { title: "Baralhos Anki · Residuum" },
      {
        name: "description",
        content: "Controle de baralhos do Anki por assunto: status, intervalo e próxima revisão.",
      },
      { property: "og:title", content: "Baralhos Anki · Residuum" },
      {
        property: "og:description",
        content: "Só metadados dos baralhos — nenhum conteúdo de cartão é armazenado.",
      },
    ],
  }),
  component: DecksPage,
});

const STATUS = [
  { value: "novo", label: "Novo" },
  { value: "revisao", label: "Revisão" },
  { value: "reforco", label: "Reforço por erros" },
];

function DecksPage() {
  const qc = useQueryClient();
  const { data: decks = [] } = useDecks();
  const { data: subjects = [] } = useSubjects();
  const { data: deckSessions = [] } = useDeckSessions();

  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState("novo");

  const createDeck = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const { error } = await supabase.from("anki_decks").insert({
        user_id: userId,
        name: name.trim(),
        subject_id: subjectId || null,
        status,
        next_review_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      qc.invalidateQueries();
      toast.success("Baralho cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rateDeck = useRateDeck();

  const removeDeck = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("deck_sessions").delete().eq("deck_id", id);
      const { error } = await supabase.from("anki_decks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Baralho removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date();
  const dueToday = decks.filter(
    (d) =>
      !d.next_review_at ||
      new Date(d.next_review_at) <= today ||
      isSameDay(new Date(d.next_review_at), today),
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Baralhos" value={String(decks.length)} />
        <Stat label="Para hoje" value={String(dueToday.length)} tone="brand" />
        <Stat
          label="Reforço por erros"
          value={String(decks.filter((d) => d.status === "reforco").length)}
          tone="rose"
        />
        <Stat label="Novos" value={String(decks.filter((d) => d.status === "novo").length)} />
      </div>

      <Panel title="Novo baralho">
        <p className="mb-3 text-xs text-muted-foreground">
          Apenas o nome e o andamento do baralho são guardados aqui — o conteúdo dos cartões
          continua no Anki.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createDeck.mutate();
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          <Field label="Nome do baralho">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Cardio · Arritmias"
            />
          </Field>
          <Field label="Assunto vinculado">
            <select
              className={inputClass}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-3">
            <button className={buttonClass}>Cadastrar baralho</button>
          </div>
        </form>
      </Panel>

      <Panel title="Meus baralhos">
        {decks.length === 0 ? (
          <Empty>Nenhum baralho cadastrado ainda.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {decks.map((deck) => {
              const accuracy = deckAccuracy(deckSessions, deck.id);
              return (
              <div key={deck.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{deck.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {subjects.find((s) => s.id === deck.subject_id)?.name ?? "Sem assunto"} ·
                      próxima {formatDate(deck.next_review_at)} · intervalo{" "}
                      {Math.round(Number(deck.interval_days))}d
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        deck.status === "reforco"
                          ? "bg-rose/10 text-rose"
                          : deck.status === "revisao"
                            ? "bg-amber/10 text-amber"
                            : "bg-brand/10 text-brand"
                      }`}
                    >
                      {STATUS.find((s) => s.value === deck.status)?.label ?? deck.status}
                    </span>
                    {accuracy !== null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          accuracy < 60
                            ? "bg-rose/10 text-rose"
                            : accuracy < 80
                              ? "bg-amber/10 text-amber"
                              : "bg-sage/10 text-sage"
                        }`}
                      >
                        acerto {accuracy}%
                      </span>
                    )}
                  </div>
                </div>
                <DeckSessionForm
                  deck={deck}
                  pending={rateDeck.isPending}
                  onLog={(payload) => rateDeck.mutate({ deck, ...payload })}
                  onRemove={() => removeDeck.mutate(deck.id)}
                />
              </div>
              );
            })}

          </div>
        )}
      </Panel>
    </>
  );
}

/** Converte a taxa de acerto (%) no rating Anki equivalente. */
export function ratingFromAccuracy(accuracyPct: number): Rating {
  if (accuracyPct >= 90) return "facil";
  if (accuracyPct >= 80) return "bom";
  if (accuracyPct >= 60) return "dificil";
  return "muito_dificil";
}

/**
 * Registro de sessão: o rating é calculado automaticamente a partir de
 * "Cartões corretos / Total revisado" (≥90% Fácil, 80–89% Bom, 60–79% Difícil,
 * <60% Novamente). Há um modo manual opcional com os 4 níveis do Anki.
 */
function DeckSessionForm({
  deck,
  pending,
  onLog,
  onRemove,
}: {
  deck: AnkiDeck;
  pending: boolean;
  onLog: (payload: {
    cards: number;
    rating: Rating;
    correct: number | null;
    total: number | null;
  }) => void;
  onRemove: () => void;
}) {
  const [correct, setCorrect] = useState("");
  const [total, setTotal] = useState("");
  const [manual, setManual] = useState(false);

  const submitAuto = () => {
    const totalNum = Number(total);
    const correctNum = Number(correct);
    if (total.trim() === "" || totalNum <= 0) {
      toast.error("Informe o total de cartões revisados");
      return;
    }
    if (correct.trim() === "" || correctNum < 0 || correctNum > totalNum) {
      toast.error("Cartões corretos precisa ser entre 0 e o total revisado");
      return;
    }
    const rating = ratingFromAccuracy(Math.round((correctNum / totalNum) * 100));
    onLog({ cards: totalNum, rating, correct: correctNum, total: totalNum });
    setCorrect("");
    setTotal("");
  };

  const submitManual = (rating: Rating) => {
    const totalNum = Number(total);
    const correctNum = Number(correct);
    const hasScore = total.trim() !== "" && totalNum > 0;
    if (hasScore && (correct.trim() === "" || correctNum < 0 || correctNum > totalNum)) {
      toast.error("Cartões corretos precisa ser entre 0 e o total revisado");
      return;
    }
    onLog({
      cards: hasScore ? totalNum : 0,
      rating,
      correct: hasScore ? correctNum : null,
      total: hasScore ? totalNum : null,
    });
    setCorrect("");
    setTotal("");
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cartões corretos">
          <input
            className={inputClass}
            inputMode="numeric"
            value={correct}
            onChange={(e) => setCorrect(e.target.value)}
            placeholder="18"
            aria-label={`Cartões corretos em ${deck.name}`}
          />
        </Field>
        <Field label="Total revisado">
          <input
            className={inputClass}
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="20"
            aria-label={`Total de cartões revisados em ${deck.name}`}
          />
        </Field>
      </div>
      {!manual ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button className={buttonClass} disabled={pending} onClick={submitAuto}>
              Registrar sessão
            </button>
            <button
              className="ml-auto text-xs text-muted-foreground hover:text-rose"
              onClick={onRemove}
            >
              Remover
            </button>
          </div>
          <button
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setManual(true)}
          >
            Não sei o número — avaliar manualmente
          </button>
        </>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            Avaliação manual — os campos numéricos são opcionais aqui.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {RATINGS.map((rating) => (
              <button
                key={rating}
                className={rating === "bom" ? buttonClass : ghostButtonClass}
                disabled={pending}
                onClick={() => submitManual(rating)}
              >
                {RATING_LABEL[rating]}
              </button>
            ))}
            <button
              className="ml-auto text-xs text-muted-foreground hover:text-rose"
              onClick={onRemove}
            >
              Remover
            </button>
          </div>
          <button
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setManual(false)}
          >
            Voltar ao registro por acertos
          </button>
        </>
      )}
    </div>
  );
}
