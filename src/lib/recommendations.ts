import type { AnkiDeck, Subject, SubjectStats } from "@/lib/data";
import type { PriorityLevel } from "@/lib/priority";

export type DeckRecommendationKind = "novo" | "revisao" | "reforco";

export type DeckRecommendation = {
  key: string;
  kind: DeckRecommendationKind;
  subject: Subject;
  deck: AnkiDeck | null;
  title: string;
  reason: string;
  weight: number;
};

export const DECK_KIND_META: Record<
  DeckRecommendationKind,
  { label: string; text: string; bg: string }
> = {
  reforco: { label: "Reforço por erros", text: "text-rose", bg: "bg-rose/10" },
  revisao: { label: "Revisão", text: "text-amber", bg: "bg-amber/10" },
  novo: { label: "Baralho novo", text: "text-brand", bg: "bg-brand/10" },
};

export type RankedSubject = {
  subject: Subject;
  score: number;
  level: PriorityLevel;
  stats: SubjectStats;
};

/**
 * Recomenda baralhos do dia a partir dos erros por assunto:
 * - reforço: muitos erros recentes ou acurácia baixa
 * - revisão: baralho existente com data vencida
 * - novo: assunto prioritário ainda sem baralho cadastrado
 */
export function recommendDecks(
  ranked: RankedSubject[],
  decks: AnkiDeck[],
  now = new Date(),
  limit = 5,
): DeckRecommendation[] {
  const bySubject = new Map<string, AnkiDeck[]>();
  for (const deck of decks) {
    if (!deck.subject_id) continue;
    const list = bySubject.get(deck.subject_id) ?? [];
    list.push(deck);
    bySubject.set(deck.subject_id, list);
  }

  const out: DeckRecommendation[] = [];

  for (const { subject, score, stats } of ranked) {
    const subjectDecks = bySubject.get(subject.id) ?? [];
    const weakAccuracy = stats.accuracy !== null && stats.total >= 5 && stats.accuracy < 70;
    const manyErrors = stats.recentErrors >= 3;

    if (manyErrors || weakAccuracy) {
      const deck = subjectDecks[0] ?? null;
      out.push({
        key: `reforco-${subject.id}`,
        kind: "reforco",
        subject,
        deck,
        title: deck?.name ?? `Reforço — ${subject.name}`,
        reason: manyErrors
          ? `${stats.recentErrors} erros nos últimos 30 dias`
          : `acertos em ${stats.accuracy}% (${stats.total} questões)`,
        weight: score + 30 + stats.recentErrors * 2,
      });
      continue;
    }

    const dueDeck = subjectDecks.find(
      (d) => !d.next_review_at || new Date(d.next_review_at) <= now,
    );
    if (dueDeck) {
      out.push({
        key: `revisao-${dueDeck.id}`,
        kind: "revisao",
        subject,
        deck: dueDeck,
        title: dueDeck.name,
        reason: dueDeck.next_review_at
          ? "baralho com revisão vencida"
          : "baralho ainda sem revisão registrada",
        weight: score + 15,
      });
      continue;
    }

    if (subjectDecks.length === 0 && (subject.last_studied_at || stats.total > 0)) {
      out.push({
        key: `novo-${subject.id}`,
        kind: "novo",
        subject,
        deck: null,
        title: `Anki — ${subject.name}`,
        reason:
          subject.mastery < 60
            ? `domínio ${subject.mastery}% e nenhum baralho criado`
            : "assunto estudado sem baralho no Anki",
        weight: score,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}
