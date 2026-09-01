ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS video_watched_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS deck_ready_at timestamptz;