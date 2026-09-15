CREATE TABLE public.subject_priority_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
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
  engine_version text NOT NULL,
  calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_priority_snapshots TO authenticated;
GRANT ALL ON public.subject_priority_snapshots TO service_role;
ALTER TABLE public.subject_priority_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subject priority snapshots"
ON public.subject_priority_snapshots
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
CREATE INDEX subject_priority_snapshots_user_score_idx
ON public.subject_priority_snapshots (user_id, priority_score DESC);