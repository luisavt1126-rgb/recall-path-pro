import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  requireUserId,
  startSubjectCycle,
  nudgeMastery,
  nudgeMasteryFromQuestions,
} from "@/lib/actions";
import {
  useDecks,
  useDeckSessions,
  useSubjects,
  deckAccuracy,
  type AnkiDeck,
} from "@/lib/data";
import { nextDeckInterval } from "@/lib/srs";
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

  const logDeck = useMutation({
    mutationFn: async ({
      deck,
      cards,
      good,
      correct,
      total,
    }: {
      deck: AnkiDeck;
      cards: number;
      good: boolean;
      correct?: number | null;
      total?: number | null;
    }) => {
      const userId = await requireUserId();
      const now = new Date();
      const interval = nextDeckInterval(Number(deck.interval_days), good ? "bom" : "dificil");
      const hasScore = (total ?? 0) > 0 && correct !== null && correct !== undefined;
      const { error } = await supabase.from("deck_sessions").insert({
        user_id: userId,
        deck_id: deck.id,
        cards_reviewed: cards,
        rating: good ? "bom" : "dificil",
        correct_cards: hasScore ? correct : null,
        total_cards: hasScore ? total : null,
      });
      if (error) throw error;
      const { error: updateError } = await supabase
        .from("anki_decks")
        .update({
          interval_days: interval,
          last_review_at: now.toISOString(),
          next_review_at: new Date(now.getTime() + interval * 86_400_000).toISOString(),
          status: good ? "revisao" : "reforco",
        })
        .eq("id", deck.id);
      if (updateError) throw updateError;
      if (deck.subject_id) {
        await startSubjectCycle(deck.subject_id, now.toISOString());
        if (hasScore) {
          // taxa de acerto real puxa o domínio (80% atual / 20% sessão)
          await nudgeMasteryFromQuestions(
            deck.subject_id,
            Math.round(((correct as number) / (total as number)) * 100),
          );
        } else {
          await nudgeMastery(deck.subject_id, good ? 3 : -3);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Sessão do baralho registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });


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
                  pending={logDeck.isPending}
                  onLog={(payload) => logDeck.mutate({ deck, ...payload })}
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
