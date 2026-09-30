-- Caderno de erros: registra erros de questões por assunto/subassunto.
CREATE TABLE IF NOT EXISTS public.question_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  subtopic_id uuid REFERENCES public.subject_subtopics(id) ON DELETE SET NULL,
  error_count integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_errors TO authenticated;
GRANT ALL ON public.question_errors TO service_role;
ALTER TABLE public.question_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own question errors" ON public.question_errors;
CREATE POLICY "own question errors" ON public.question_errors
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_question_errors_updated_at
  BEFORE UPDATE ON public.question_errors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS question_errors_user_subject_idx
  ON public.question_errors (user_id, subject_id);

CREATE INDEX IF NOT EXISTS question_errors_user_created_idx
  ON public.question_errors (user_id, created_at DESC);
