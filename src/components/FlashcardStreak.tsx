import { useDeckSessions } from "@/lib/data";
import { addDays, startOfDay } from "@/lib/format";

const DAYS = 91;

function levelOf(cards: number) {
  if (cards === 0) return 0;
  if (cards < 10) return 1;
  if (cards < 30) return 2;
  if (cards < 60) return 3;
  return 4;
}

const LEVEL_CLASS = [
  "bg-secondary",
  "bg-brand/25",
  "bg-brand/50",
  "bg-brand/75",
  "bg-brand",
];

export function FlashcardStreak() {
  const { data: sessions = [] } = useDeckSessions();

  const totals = new Map<number, number>();
  for (const s of sessions) {
    const key = startOfDay(new Date(s.reviewed_at)).getTime();
    totals.set(key, (totals.get(key) ?? 0) + (s.cards_reviewed ?? 0));
  }

  const today = startOfDay(new Date());
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(today, -(DAYS - 1 - i));
    return { date, cards: totals.get(date.getTime()) ?? 0 };
  });

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if ((days[i]?.cards ?? 0) > 0) streak++;
    else if (i !== days.length - 1) break;
    else continue;
  }

  const totalCards = days.reduce((a, d) => a + d.cards, 0);
  const activeDays = days.filter((d) => d.cards > 0).length;

  // 13 colunas de 7 dias (semanas), preenchendo de cima para baixo
  const weeks: { date: Date; cards: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <span
                key={day.date.toISOString()}
                title={`${day.date.toLocaleDateString("pt-BR")} · ${day.cards} cartões`}
                className={`h-3 w-3 rounded-[3px] ${LEVEL_CLASS[levelOf(day.cards)]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          Sequência atual <b className="text-foreground">{streak} dia(s)</b>
        </span>
        <span>
          {activeDays} dias ativos · {totalCards} cartões
        </span>
        <span className="flex items-center gap-1">
          menos
          {LEVEL_CLASS.map((c) => (
            <span key={c} className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />
          ))}
          mais
        </span>
      </div>
    </div>
  );
}
