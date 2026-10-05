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
CREATE POLICY "own subject subtopics" ON public.subject_subtopics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_subject_subtopics_updated_at BEFORE UPDATE ON public.subject_subtopics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_errors TO authenticated;
GRANT ALL ON public.question_errors TO service_role;
ALTER TABLE public.question_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own question errors" ON public.question_errors FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_question_errors_updated_at BEFORE UPDATE ON public.question_errors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS question_errors_user_subject_idx ON public.question_errors (user_id, subject_id);
CREATE INDEX IF NOT EXISTS question_errors_user_created_idx ON public.question_errors (user_id, created_at DESC);