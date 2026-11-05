ALTER TABLE public.question_errors
  ADD COLUMN IF NOT EXISTS banca text,
  ADD COLUMN IF NOT EXISTS exam_year integer,
  ADD COLUMN IF NOT EXISTS question_ref text,
  ADD COLUMN IF NOT EXISTS correction text,
  ADD COLUMN IF NOT EXISTS how_to_avoid text,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'desconhecimento',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS error_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.question_errors ADD CONSTRAINT question_errors_origin_chk CHECK (origin IN ('desconhecimento','confusao','esquecimento','interpretacao'));
ALTER TABLE public.question_errors ADD CONSTRAINT question_errors_priority_chk CHECK (priority IN ('alta','media','superado'));
CREATE INDEX IF NOT EXISTS question_errors_user_priority_idx ON public.question_errors (user_id, priority);
CREATE INDEX IF NOT EXISTS question_errors_user_date_idx ON public.question_errors (user_id, error_date DESC);

CREATE TABLE public.question_error_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  error_id uuid NOT NULL REFERENCES public.question_errors(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('superei','ainda_erro')),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_error_reviews TO authenticated;
GRANT ALL ON public.question_error_reviews TO service_role;
ALTER TABLE public.question_error_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own question error reviews" ON public.question_error_reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX question_error_reviews_user_error_idx ON public.question_error_reviews (user_id, error_id, reviewed_at DESC);