import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId, useRateDeck } from "@/lib/actions";
import { recalculateSubjectPriority } from "@/lib/priorityEngine.service";
import {
  useDecks,
  useDeckSessions,
  useSubjects,
  deckAccuracy,
  type AnkiDeck,
} from "@/lib/data";
import { type Rating } from "@/lib/srs";
import { Panel, Stat, Empty, Field, inputClass, buttonClass, ghostButtonClass } from "@/components/bits";
import { formatDate, isSameDay, toDateInputValue } from "@/lib/format";


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
  const [syncing, setSyncing] = useState(false);

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

  const syncRows = async (rows: AnkiImportRow[], source: "csv" | "ankiconnect") => {
    const userId = await requireUserId();
    let created = 0;
    let updated = 0;
    let sessions = 0;
    const touched = new Set<string>();
    for (const row of rows) {
      const existing = decks.find((deck) => normalize(deck.anki_name ?? deck.name) === normalize(row.name));
      if (existing?.subject_id) touched.add(existing.subject_id);
      const patch = {
        anki_name: row.name,
        cards_due: row.due,
        last_synced_at: new Date().toISOString(),
        sync_source: source,
        ...(row.lastReview ? { last_review_at: row.lastReview } : {}),
        ...(row.nextReview ? { next_review_at: row.nextReview } : {}),
        ...(row.interval !== null ? { interval_days: row.interval } : {}),
      };
      let deckId = existing?.id;
      if (existing) {
        const { error } = await supabase.from("anki_decks").update(patch).eq("id", existing.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { data, error } = await supabase.from("anki_decks").insert({ user_id: userId, name: row.name, status: "revisao", ...patch }).select("id").single();
        if (error) throw error;
        deckId = data.id;
        created += 1;
      }
      if (deckId && row.total !== null && row.total > 0 && row.correct !== null) {
        const reviewedAt = row.lastReview ?? new Date().toISOString();
        const duplicate = deckSessions.some((session) => session.deck_id === deckId && session.reviewed_at.slice(0, 10) === reviewedAt.slice(0, 10) && session.total_cards === row.total);
        if (!duplicate) {
          const { error } = await supabase.from("deck_sessions").insert({
            user_id: userId,
            deck_id: deckId,
            reviewed_at: reviewedAt,
            cards_reviewed: row.total,
            total_cards: row.total,
            correct_cards: row.correct,
            rating: ratingFromAccuracy(Math.round((row.correct / row.total) * 100)),
          });
          if (error) throw error;
          sessions += 1;
        }
      }
    }
    for (const subjectId of touched) {
      void recalculateSubjectPriority(userId, subjectId).catch((err) => {
        console.warn("Falha ao recalcular prioridade do assunto", subjectId, err);
      });
    }
    qc.invalidateQueries();
    toast.success(`${created} criado(s), ${updated} atualizado(s) e ${sessions} sessão(ões) importada(s)`);
  };

  const importCsv = async (file: File) => {
    setSyncing(true);
    try {
      const rows = parseAnkiCsv(await file.text());
      if (rows.length === 0) throw new Error("Nenhuma linha válida encontrada no arquivo");
      await syncRows(rows, "csv");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o arquivo");
    } finally {
      setSyncing(false);
    }
  };

  const syncAnkiConnect = async () => {
    setSyncing(true);
    try {
      const namesResponse = await fetch("http://127.0.0.1:8765", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deckNames", version: 6 }),
      });
      const namesPayload = await namesResponse.json() as { result?: string[]; error?: string | null };
      if (namesPayload.error || !namesPayload.result) throw new Error(namesPayload.error ?? "AnkiConnect não respondeu");
      const rows: AnkiImportRow[] = namesPayload.result.map((deckName) => ({ name: deckName, correct: null, total: null, due: null, interval: null, lastReview: null, nextReview: null }));
      await syncRows(rows, "ankiconnect");
    } catch {
      toast.error("Não foi possível acessar o Anki. Abra o Anki no desktop e confira o AnkiConnect e a permissão do navegador.");
    } finally {
      setSyncing(false);
    }
  };

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

      <Panel title="Sincronizar com o Anki">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-border p-4">
            <p className="text-sm font-semibold">Importar relatório CSV</p>
            <p className="mt-1 text-xs text-muted-foreground">Aceita colunas como Baralho, Corretos, Total, Pendentes, Última revisão, Próxima revisão e Intervalo. Baralhos com o mesmo nome são atualizados.</p>
            <label className={`${buttonClass} mt-3 inline-flex cursor-pointer items-center`}>
              {syncing ? "Importando…" : "Escolher arquivo CSV"}
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" disabled={syncing} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.target.value = ""; }} />
            </label>
            <button type="button" className="ml-2 text-xs text-brand underline underline-offset-2" onClick={downloadCsvModel}>Baixar modelo</button>
          </div>
          <div className="border border-border p-4">
            <p className="text-sm font-semibold">AnkiConnect no desktop</p>
            <p className="mt-1 text-xs text-muted-foreground">Opção experimental. Requer o Anki aberto, o complemento AnkiConnect e permissão para o navegador acessar o computador local.</p>
            <button type="button" className={`${ghostButtonClass} mt-3`} disabled={syncing} onClick={() => void syncAnkiConnect()}>Conectar ao Anki aberto</button>
          </div>
        </div>
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

type AnkiImportRow = {
  name: string;
  correct: number | null;
  total: number | null;
  due: number | null;
  interval: number | null;
  lastReview: string | null;
  nextReview: string | null;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
const normalizedHeader = (value: string) => normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function parseDate(value: string | undefined) {
  if (!value?.trim()) return null;
  const iso = new Date(value.trim());
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00`).toISOString();
}

function parseAnkiCsv(text: string): AnkiImportRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = (lines[0]?.split(";").length ?? 0) > (lines[0]?.split(",").length ?? 0) ? ";" : ",";
  const parseLine = (line: string) => {
    const values: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { values.push(current.trim()); current = ""; }
      else current += char;
    }
    values.push(current.trim());
    return values;
  };
  const headers = parseLine(lines[0] ?? "").map(normalizedHeader);
  const pick = (row: string[], aliases: string[]) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    return index >= 0 ? row[index] : undefined;
  };
  const number = (value: string | undefined) => value?.trim() && Number.isFinite(Number(value.replace(",", "."))) ? Number(value.replace(",", ".")) : null;
  return lines.slice(1).map(parseLine).map((row) => ({
    name: pick(row, ["baralho", "deck", "deckname", "nome"])?.trim() ?? "",
    correct: number(pick(row, ["corretos", "correct", "correctcards", "acertos"])),
    total: number(pick(row, ["total", "totalrevisado", "reviewed", "cardsreviewed"])),
    due: number(pick(row, ["pendentes", "due", "cardsdue"])),
    interval: number(pick(row, ["intervalo", "interval", "intervaldays"])),
    lastReview: parseDate(pick(row, ["ultimarevisao", "lastreview", "lastreviewat"])),
    nextReview: parseDate(pick(row, ["proximarevisao", "nextreview", "nextreviewat"])),
  })).filter((row) => row.name);
}

function downloadCsvModel() {
  const content = "Baralho;Corretos;Total;Pendentes;Última revisão;Próxima revisão;Intervalo\nCardiologia;18;20;35;12/09/2026;14/09/2026;2\n";
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "modelo-anki-residuum.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Converte a taxa de acerto (%) no rating Anki equivalente. */
function ratingFromAccuracy(accuracyPct: number): Rating {
  if (accuracyPct >= 90) return "facil";
  if (accuracyPct >= 80) return "bom";
  if (accuracyPct >= 60) return "dificil";
  return "muito_dificil";
}

/**
 * Registro de sessão de Anki/Flashcards: informa apenas a quantidade planejada,
 * a quantidade feita e se a sessão foi concluída — sem contagem de erros nem
 * rating manual (dado inviável de extrair do Anki durante o estudo).
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
    cards_planned: number;
    cards_done: number;
    completed: boolean;
    minutes?: number;
    date: string;
  }) => void;
  onRemove: () => void;
}) {
  const [planned, setPlanned] = useState("");
  const [done, setDone] = useState("");
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    setDate(toDateInputValue(new Date()));
  }, []);

  const submit = () => {
    const plannedNum = Number(planned);
    const doneNum = Number(done);
    if (planned.trim() === "" || plannedNum <= 0) {
      toast.error("Informe a quantidade planejada para o dia");
      return;
    }
    if (done.trim() === "" || doneNum < 0) {
      toast.error("Informe a quantidade de cards feitos");
      return;
    }
    if (completed === null) {
      toast.error("Informe se concluiu a sessão");
      return;
    }
    onLog({
      cards_planned: plannedNum,
      cards_done: doneNum,
      completed,
      ...(Number(minutes) > 0 ? { minutes: Number(minutes) } : {}),
      date,
    });
    setPlanned("");
    setDone("");
    setCompleted(null);
    setMinutes("");
    setDate(toDateInputValue(new Date()));
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cards planejados">
          <input
            className={inputClass}
            inputMode="numeric"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            placeholder="20"
            aria-label={`Cards planejados em ${deck.name}`}
          />
        </Field>
        <Field label="Cards feitos">
          <input
            className={inputClass}
            inputMode="numeric"
            value={done}
            onChange={(e) => setDone(e.target.value)}
            placeholder="18"
            aria-label={`Cards feitos em ${deck.name}`}
          />
        </Field>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Concluiu a sessão planejada?</p>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => setCompleted(true)}
            className={completed === true ? buttonClass : ghostButtonClass}
          >
            Sim
          </button>
          <button
            type="button"
            onClick={() => setCompleted(false)}
            className={completed === false ? buttonClass : ghostButtonClass}
          >
            Não
          </button>
        </div>
      </div>
      <Field label="Data">
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={`Data da sessão em ${deck.name}`}
        />
      </Field>
      <Field label="Tempo (min) — opcional">
        <input
          className={inputClass}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="10"
          aria-label={`Tempo em minutos em ${deck.name}`}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button className={buttonClass} disabled={pending} onClick={submit}>
          Registrar sessão
        </button>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-rose"
          onClick={onRemove}
        >
          Remover
        </button>
      </div>
    </div>
  );
}
