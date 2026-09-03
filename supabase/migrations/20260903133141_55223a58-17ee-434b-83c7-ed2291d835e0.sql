ALTER TABLE public.deck_sessions
  ADD COLUMN IF NOT EXISTS correct_cards integer,
  ADD COLUMN IF NOT EXISTS total_cards integer;