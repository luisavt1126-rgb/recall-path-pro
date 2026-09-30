-- Anki sync metadata + task completions (migrado da migration Drizzle órfã 0000)
ALTER TABLE public.anki_decks
  ADD COLUMN IF NOT EXISTS anki_name text,
  ADD COLUMN IF NOT EXISTS cards_due integer,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_source text;

CREATE TABLE IF NOT EXISTS public.task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  completed_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_key, completed_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_completions TO authenticated;
GRANT ALL ON public.task_completions TO service_role;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own task completions" ON public.task_completions;
CREATE POLICY "own task completions" ON public.task_completions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS task_completions_user_date_idx
  ON public.task_completions (user_id, completed_on);
