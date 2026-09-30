-- Subassuntos organizacionais (sem SRS próprio). Vinculados a um assunto,
-- com exclusão em cascata e acesso restrito ao próprio usuário.
CREATE TABLE IF NOT EXISTS public.subject_subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_subtopics TO authenticated;
GRANT ALL ON public.subject_subtopics TO service_role;
ALTER TABLE public.subject_subtopics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own subject subtopics" ON public.subject_subtopics;
CREATE POLICY "own subject subtopics" ON public.subject_subtopics
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_subject_subtopics_updated_at
  BEFORE UPDATE ON public.subject_subtopics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
