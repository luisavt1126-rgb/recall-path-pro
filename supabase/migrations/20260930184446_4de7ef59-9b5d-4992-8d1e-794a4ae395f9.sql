-- Correção do schema cache: garante a tabela question_errors completa (schema real do app).
-- Executar este script no SQL Editor do Supabase e depois recarregar o cache do PostgREST.

CREATE TABLE IF NOT EXISTS public.question_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  subtopic_id uuid REFERENCES public.subject_subtopics(id) ON DELETE SET NULL,
  error_count integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  note text,
  what text,
  subtopic_name text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Colunas adicionais (idempotente, caso a tabela já exista de versões anteriores).
ALTER TABLE public.question_errors
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS what text,
  ADD COLUMN IF NOT EXISTS subtopic_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_errors TO authenticated;
GRANT ALL ON public.question_errors TO service_role;
ALTER TABLE public.question_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own question errors" ON public.question_errors;
CREATE POLICY "own question errors" ON public.question_errors
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_question_errors_updated_at ON public.question_errors;
CREATE TRIGGER update_question_errors_updated_at
  BEFORE UPDATE ON public.question_errors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS question_errors_user_subject_idx
  ON public.question_errors (user_id, subject_id);
CREATE INDEX IF NOT EXISTS question_errors_user_created_idx
  ON public.question_errors (user_id, created_at DESC);

-- Recarrega o cache do schema do PostgREST.
NOTIFY pgrst, 'reload schema';
