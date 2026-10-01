-- ============================================================
-- Bootstrap do schema do Residuum (idempotente)
-- Rode este script inteiro no SQL Editor do Supabase.
-- ============================================================

-- Função auxiliar de updated_at (usada pelos triggers)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = public;

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text,
  weekly_goal_hours numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Trigger para criar o profile no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ disciplines ============
CREATE TABLE IF NOT EXISTS public.disciplines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'brand',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own disciplines" ON public.disciplines;
CREATE POLICY "own disciplines" ON public.disciplines FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ subjects ============
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines ON DELETE CASCADE,
  parent_id uuid REFERENCES public.subjects ON DELETE CASCADE,
  name text NOT NULL,
  mastery integer NOT NULL DEFAULT 0,
  exam_incidence integer NOT NULL DEFAULT 3,
  first_studied_at timestamptz,
  last_studied_at timestamptz,
  next_review_at timestamptz,
  review_count integer NOT NULL DEFAULT 0,
  interval_days numeric NOT NULL DEFAULT 0,
  ease numeric NOT NULL DEFAULT 2.5,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  stability numeric NOT NULL DEFAULT 0,
  difficulty numeric NOT NULL DEFAULT 5,
  video_watched_at timestamptz,
  summary_ready_at timestamptz,
  deck_ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own subjects" ON public.subjects;
CREATE POLICY "own subjects" ON public.subjects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ study_sessions ============
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects ON DELETE SET NULL,
  discipline_id uuid REFERENCES public.disciplines ON DELETE SET NULL,
  activity_type text NOT NULL DEFAULT 'estudo',
  minutes integer NOT NULL,
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own sessions" ON public.study_sessions;
CREATE POLICY "own sessions" ON public.study_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ reviews ============
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects ON DELETE CASCADE,
  rating text NOT NULL,
  interval_before numeric NOT NULL DEFAULT 0,
  interval_after numeric NOT NULL DEFAULT 0,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own reviews" ON public.reviews;
CREATE POLICY "own reviews" ON public.reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ question_logs ============
CREATE TABLE IF NOT EXISTS public.question_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects ON DELETE SET NULL,
  discipline_id uuid REFERENCES public.disciplines ON DELETE SET NULL,
  banca text,
  year integer,
  total integer NOT NULL,
  correct integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own question logs" ON public.question_logs;
CREATE POLICY "own question logs" ON public.question_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ anki_decks ============
CREATE TABLE IF NOT EXISTS public.anki_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'novo',
  interval_days numeric NOT NULL DEFAULT 1,
  last_review_at timestamptz,
  next_review_at timestamptz,
  anki_name text,
  cards_due integer,
  last_synced_at timestamptz,
  sync_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.anki_decks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own decks" ON public.anki_decks;
CREATE POLICY "own decks" ON public.anki_decks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ deck_sessions ============
CREATE TABLE IF NOT EXISTS public.deck_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.anki_decks ON DELETE CASCADE,
  cards_reviewed integer NOT NULL DEFAULT 0,
  correct_cards integer,
  total_cards integer,
  rating text,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deck_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own deck sessions" ON public.deck_sessions;
CREATE POLICY "own deck sessions" ON public.deck_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ events ============
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'estudar',
  starts_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  plan_tag text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own events" ON public.events;
CREATE POLICY "own events" ON public.events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ exams ============
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  banca text,
  exam_date date NOT NULL,
  registration_deadline date,
  location text,
  status text NOT NULL DEFAULT 'planejada',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own exams" ON public.exams;
CREATE POLICY "own exams" ON public.exams FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_exams_updated_at ON public.exams;
CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ exam_analyses ============
CREATE TABLE IF NOT EXISTS public.exam_analyses (
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
ALTER TABLE public.exam_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own exam analyses" ON public.exam_analyses;
CREATE POLICY "own exam analyses" ON public.exam_analyses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_exam_analyses_updated_at ON public.exam_analyses;
CREATE TRIGGER update_exam_analyses_updated_at BEFORE UPDATE ON public.exam_analyses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ exam_topics ============
CREATE TABLE IF NOT EXISTS public.exam_topics (
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
ALTER TABLE public.exam_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own exam topics" ON public.exam_topics;
CREATE POLICY "own exam topics" ON public.exam_topics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ task_completions ============
CREATE TABLE IF NOT EXISTS public.task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  completed_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_key, completed_on)
);
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own task completions" ON public.task_completions;
CREATE POLICY "own task completions" ON public.task_completions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ subject_priority_snapshots ============
CREATE TABLE IF NOT EXISTS public.subject_priority_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  priority_score integer NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  knowledge_state text NOT NULL DEFAULT 'NEW' CHECK (knowledge_state IN ('NEW', 'FRAGILE', 'CONSOLIDATING', 'STABLE', 'DETERIORATING', 'PERSISTENT_GAP')),
  reason text NOT NULL DEFAULT 'Ainda não há atividade registrada para este assunto.',
  question_score numeric NOT NULL DEFAULT 0 CHECK (question_score BETWEEN 0 AND 40),
  overdue_score numeric NOT NULL DEFAULT 0 CHECK (overdue_score BETWEEN 0 AND 25),
  error_score numeric NOT NULL DEFAULT 0 CHECK (error_score BETWEEN 0 AND 25),
  stability_score numeric NOT NULL DEFAULT 0 CHECK (stability_score BETWEEN 0 AND 10),
  recent_questions integer NOT NULL DEFAULT 0,
  recent_accuracy numeric,
  historical_questions integer NOT NULL DEFAULT 0,
  historical_accuracy numeric,
  sample_confidence numeric NOT NULL DEFAULT 0 CHECK (sample_confidence BETWEEN 0 AND 1),
  sample_is_estimated boolean NOT NULL DEFAULT false,
  engine_version text NOT NULL DEFAULT '1.0.0',
  calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_id)
);
ALTER TABLE public.subject_priority_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own subject priority snapshots" ON public.subject_priority_snapshots;
CREATE POLICY "own subject priority snapshots" ON public.subject_priority_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ subject_subtopics ============
CREATE TABLE IF NOT EXISTS public.subject_subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_id, name)
);
ALTER TABLE public.subject_subtopics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own subject subtopics" ON public.subject_subtopics;
CREATE POLICY "own subject subtopics" ON public.subject_subtopics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_subject_subtopics_updated_at ON public.subject_subtopics;
CREATE TRIGGER update_subject_subtopics_updated_at BEFORE UPDATE ON public.subject_subtopics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ question_errors ============
CREATE TABLE IF NOT EXISTS public.question_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  subtopic_id uuid,
  error_count integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  note text,
  what text,
  subtopic_name text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own question errors" ON public.question_errors;
CREATE POLICY "own question errors" ON public.question_errors FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_question_errors_updated_at ON public.question_errors;
CREATE TRIGGER update_question_errors_updated_at BEFORE UPDATE ON public.question_errors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anki_decks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_analyses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_completions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_priority_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_subtopics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_errors TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============ Índices ============
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_started ON public.study_sessions (user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_events_user_starts ON public.events (user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_subjects_user_next ON public.subjects (user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_question_logs_user_created ON public.question_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS exams_user_date_idx ON public.exams (user_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_topics_analysis ON public.exam_topics(analysis_id);
CREATE INDEX IF NOT EXISTS idx_exam_analyses_user ON public.exam_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_plan_tag ON public.events(user_id, plan_tag);
CREATE INDEX IF NOT EXISTS task_completions_user_date_idx ON public.task_completions (user_id, completed_on);
CREATE INDEX IF NOT EXISTS subject_priority_snapshots_user_score_idx ON public.subject_priority_snapshots (user_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS question_errors_user_subject_idx ON public.question_errors (user_id, subject_id);
CREATE INDEX IF NOT EXISTS question_errors_user_created_idx ON public.question_errors (user_id, created_at DESC);

-- ============ Recarrega o cache ============
NOTIFY pgrst, 'reload schema';
