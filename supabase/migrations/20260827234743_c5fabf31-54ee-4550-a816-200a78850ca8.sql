-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text,
  weekly_goal_hours numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- disciplines
CREATE TABLE public.disciplines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'brand',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplines TO authenticated;
GRANT ALL ON public.disciplines TO service_role;
ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own disciplines" ON public.disciplines FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- subjects
CREATE TABLE public.subjects (
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
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subjects" ON public.subjects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- study sessions
CREATE TABLE public.study_sessions (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.study_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects ON DELETE CASCADE,
  rating text NOT NULL,
  interval_before numeric NOT NULL DEFAULT 0,
  interval_after numeric NOT NULL DEFAULT 0,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reviews" ON public.reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- question logs
CREATE TABLE public.question_logs (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_logs TO authenticated;
GRANT ALL ON public.question_logs TO service_role;
ALTER TABLE public.question_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own question logs" ON public.question_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- anki decks (no card content)
CREATE TABLE public.anki_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'novo',
  interval_days numeric NOT NULL DEFAULT 1,
  last_review_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anki_decks TO authenticated;
GRANT ALL ON public.anki_decks TO service_role;
ALTER TABLE public.anki_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own decks" ON public.anki_decks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- deck sessions
CREATE TABLE public.deck_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.anki_decks ON DELETE CASCADE,
  cards_reviewed integer NOT NULL DEFAULT 0,
  rating text,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_sessions TO authenticated;
GRANT ALL ON public.deck_sessions TO service_role;
ALTER TABLE public.deck_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deck sessions" ON public.deck_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- agenda events
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'estudar',
  starts_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX ON public.study_sessions (user_id, started_at);
CREATE INDEX ON public.events (user_id, starts_at);
CREATE INDEX ON public.subjects (user_id, next_review_at);
CREATE INDEX ON public.question_logs (user_id, created_at);