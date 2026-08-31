CREATE TABLE public.exam_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  title text NOT NULL,
  banca text,
  year integer,
  source text NOT NULL DEFAULT 'banca',
  total_questions integer NOT NULL DEFAULT 0,
  summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_analyses TO authenticated;
GRANT ALL ON public.exam_analyses TO service_role;
ALTER TABLE public.exam_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own exam analyses" ON public.exam_analyses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_exam_analyses_updated_at BEFORE UPDATE ON public.exam_analyses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.exam_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.exam_analyses(id) ON DELETE CASCADE,
  area text NOT NULL,
  subject text NOT NULL,
  topic text,
  question_count integer NOT NULL DEFAULT 0,
  incidence_pct numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_topics TO authenticated;
GRANT ALL ON public.exam_topics TO service_role;
ALTER TABLE public.exam_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own exam topics" ON public.exam_topics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_exam_topics_analysis ON public.exam_topics(analysis_id);
CREATE INDEX idx_exam_analyses_user ON public.exam_analyses(user_id, created_at DESC);

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS plan_tag text;
CREATE INDEX IF NOT EXISTS idx_events_plan_tag ON public.events(user_id, plan_tag);