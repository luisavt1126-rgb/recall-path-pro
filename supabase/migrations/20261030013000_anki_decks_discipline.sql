-- Baralho do Anki pode ser ligado a uma especialidade inteira (disciplina),
-- além de (ou em vez de) um assunto/aula específico. Aditivo e seguro:
-- coluna opcional, nenhum dado alterado, RLS por user_id inalterada.
ALTER TABLE public.anki_decks
  ADD COLUMN IF NOT EXISTS discipline_id uuid
  REFERENCES public.disciplines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS anki_decks_discipline_id_idx
  ON public.anki_decks (discipline_id);
